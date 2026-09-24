import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { binDir, configDir, dataRoot, editorApp, privateDir, profileDir, repoRoot } from "./paths.js";
import { atomicJson } from "./state.js";
import { subscriptionEnv, type Provider } from "./security.js";

export const piCLI = join(repoRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
export const geminiCLI = join(repoRoot, "node_modules/@google/gemini-cli/bundle/gemini.js");
export const claudeCLI = join(repoRoot, "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude");
export const claudeHome = join(dataRoot, "claude");
export const geminiHome = join(dataRoot, "google");

export function configure(): void {
  for (const dir of [configDir, profileDir, claudeHome, join(geminiHome, ".gemini")]) privateDir(dir);
  // These files belong exclusively to this launcher. Existing external profiles are untouched.
  const path = join(profileDir, "settings.json");
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  atomicJson(path, {
    ...previous, packages: [], extensions: [], skills: [], prompts: [], themes: [],
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    cacheWarming: "off", enableAnalytics: false, enableInstallTelemetry: false,
    compaction: { enabled: false }, defaultProjectTrust: "never",
    enabledModels: ["openai-codex/*", "claude-bridge/*", "gemini-cli-acp/*"],
    defaultTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
  });
  atomicJson(join(profileDir, "claude-bridge.json"), {
    askClaude: { enabled: false },
    provider: { strictMcpConfig: true, autoMemoryEnabled: false, longContextExtraUsage: false, plan: "pro", pathToClaudeCodeExecutable: claudeCLI },
  });
  for (const review of [false, true]) {
    atomicJson(join(configDir, review ? "gemini-review.json" : "gemini.json"), {
      security: { auth: { selectedType: "oauth-personal", enforcedType: "oauth-personal" } },
      telemetry: { enabled: false },
      general: { enableAutoUpdate: false, previewFeatures: false, maxAttempts: 1, retryFetchErrors: false, plan: { modelRouting: false } },
      context: { fileName: "PH_GEMINI_CONTEXT.md" },
      tools: { exclude: review ? ["run_shell_command", "write_file", "replace", "save_memory"] : ["save_memory"] },
      hooksConfig: { enabled: false }, mcpServers: {},
    });
  }
}

export function harnessEnv(review = false): NodeJS.ProcessEnv {
  return {
    ...subscriptionEnv(), PATH: `${binDir}:${process.env.PATH || ""}`,
    PI_CODING_AGENT_DIR: profileDir, CLAUDE_CONFIG_DIR: claudeHome,
    GEMINI_CLI_HOME: geminiHome,
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(configDir, review ? "gemini-review.json" : "gemini.json"),
    GEMINI_CLI_SYSTEM_DEFAULTS_PATH: join(configDir, "gemini.json"),
    NO_BROWSER: "true", DISABLE_AUTOUPDATER: "1",
    NVIM_APPNAME: editorApp, CC: join(binDir, "cc"),
    PH_LAUNCHED: "1",
  };
}

export function billingFile(): string { return join(configDir, "billing.json"); }
export function billingConfirmed(provider: Provider): boolean {
  if (!existsSync(billingFile())) return false;
  const config = JSON.parse(readFileSync(billingFile(), "utf8"));
  return config[provider]?.extraUsageDisabled === true;
}
export function confirmBilling(provider: Provider): void {
  const config = existsSync(billingFile()) ? JSON.parse(readFileSync(billingFile(), "utf8")) : {};
  config[provider] = { extraUsageDisabled: true, confirmedBy: "user", at: new Date().toISOString() };
  atomicJson(billingFile(), config);
}
