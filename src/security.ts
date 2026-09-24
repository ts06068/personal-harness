import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

export const PROVIDERS = ["openai-codex", "claude-bridge", "gemini-cli-acp"] as const;
export type Provider = typeof PROVIDERS[number];
export const PROVIDER_LABELS: Record<Provider, string> = {
  "openai-codex": "GPT (ChatGPT subscription)",
  "claude-bridge": "Claude (Claude subscription)",
  "gemini-cli-acp": "Gemini (Google subscription)",
};

// Values are never printed. The launcher excludes alternate billing credentials.
const BILLING_ENV = /^(OPENAI_API_KEY|CODEX_API_KEY|OPENAI_BASE_URL|OPENAI_API_BASE|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_OAUTH_TOKEN|ANTHROPIC_BASE_URL|ANTHROPIC_CUSTOM_HEADERS|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)|GEMINI_API_KEY|GEMINI_API_BASE_URL|GOOGLE_GEMINI_BASE_URL|GOOGLE_VERTEX_BASE_URL|GOOGLE_API_KEY|GOOGLE_CLOUD_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_CLOUD_PROJECT(_ID)?|GCLOUD_PROJECT|AZURE_OPENAI_.*|OPENROUTER_API_KEY|AI_GATEWAY_API_KEY|AGY_ACP_CCPA_BASE_URL|ANTIGRAVITY_HARNESS_PATH)$/;

export function subscriptionEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !BILLING_ENV.test(key)));
}

export function billingEnvNames(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env).filter(key => BILLING_ENV.test(key) && env[key]);
}

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function assertProvider(provider: string): asserts provider is Provider {
  if (!isProvider(provider)) throw new Error(`Subscription-only policy: provider ${provider} is not enabled.`);
}

export function assertRoute(model: { provider: string; api?: string; baseUrl?: string }): void {
  assertProvider(model.provider);
  if (model.provider === "openai-codex") {
    if (!model.api?.includes("codex")) throw new Error("GPT must use the Codex subscription transport.");
    const url = new URL(model.baseUrl || "https://chatgpt.com/backend-api/codex");
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") {
      throw new Error("Custom GPT gateway rejected by subscription-only policy.");
    }
  }
}

export function assertPrivateAuthStore(path: string): void {
  if (!existsSync(path)) return;
  const entries = JSON.parse(readFileSync(path, "utf8")) as Record<string, { type?: string }>;
  for (const [name, value] of Object.entries(entries)) {
    if (name !== "openai-codex" || value?.type !== "oauth") {
      throw new Error(`Unexpected credential route in dedicated Pi profile: ${name}. Use ph login.`);
    }
  }
}

export function assertNoGeminiBillingEnvFile(project: string): void {
  const candidates = new Set([join(homedir(), ".gemini/.env")]);
  let current = resolve(project);
  while (true) {
    candidates.add(join(current, ".env"));
    candidates.add(join(current, ".gemini/.env"));
    if (dirname(current) === current) break;
    current = dirname(current);
  }
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const name = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1];
      if (name && BILLING_ENV.test(name)) {
        throw new Error(`Gemini launch blocked: ${name} is present in ${path}. No value was read into the harness environment.`);
      }
    }
  }
}

// Local provider settings can select API billing or execute hooks before our tool checks.
// V1 accepts only the managed provider profile, rather than silently merging these files.
export function assertManagedProject(project: string): void {
  let current = resolve(project);
  while (true) {
    for (const name of [".pi/models.json", ".pi/claude-bridge.json", ".claude/settings.json", ".claude/settings.local.json", ".gemini/settings.json"]) {
      if (existsSync(join(current, name))) throw new Error(`Unmanaged provider settings: ${join(current, name)}. Use a clean project/worktree or review and relocate this configuration before starting ph.`);
    }
    if (dirname(current) === current) break;
    current = dirname(current);
  }
  assertNoGeminiBillingEnvFile(project);
}

export function withinRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

// Resolve existing ancestors to reject symlinks escaping the selected project.
export function confinedPath(root: string, requested: string): string {
  const canonicalRoot = realpathSync(root);
  const candidate = resolve(canonicalRoot, requested);
  if (!withinRoot(canonicalRoot, candidate)) throw new Error("Path is outside the selected project.");
  let resolved = canonicalRoot;
  for (const part of relative(canonicalRoot, candidate).split(sep).filter(Boolean)) {
    resolved = join(resolved, part);
    let entry;
    try { entry = lstatSync(resolved); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (entry.isSymbolicLink()) {
      try { resolved = realpathSync(resolved); }
      catch { throw new Error("Unresolvable or cyclic symlink is not allowed."); }
      if (!withinRoot(canonicalRoot, resolved)) throw new Error("Symlink escapes the selected project.");
    }
  }
  if (!withinRoot(canonicalRoot, resolved)) throw new Error("Symlink escapes the selected project.");
  const segments = relative(canonicalRoot, resolved).split(sep);
  if (segments.some(p => [".git", ".ssh", ".aws", ".codex", ".claude", ".gemini"].includes(p)) ||
      segments.some(p => p === ".env" || p.startsWith(".env."))) {
    throw new Error("Credential/configuration paths are not available through agent file tools.");
  }
  return resolved;
}

// This closes the dangling endpoint case; it is not an OS sandbox against
// another process replacing ancestor directories concurrently.
export function writeConfinedText(root: string, requested: string, content: string): void {
  const target = confinedPath(root, requested);
  mkdirSync(dirname(target), { recursive: true });
  const checked = confinedPath(root, target);
  const fd = openSync(checked, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, content); } finally { closeSync(fd); }
}

export function classifyFailure(message: string): "rate_limit" | "authentication" | "other" {
  if (/\b429\b|resource_exhausted|quota[_ -]?(exceeded|exhausted)|rate[_ -]?limit|usage limit|usage_limit|hit your.*limit|exceeded.*quota|too many requests|out of (extra )?usage|insufficient_quota/i.test(message)) return "rate_limit";
  if (/\b40[13]\b|unauthenticated|unauthorized|authentication|not logged in|login required|invalid.*credential/i.test(message)) return "authentication";
  return "other";
}
