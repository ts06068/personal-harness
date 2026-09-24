import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { binDir, configDir, dataRoot, editorApp, privateDir, profileDir, repoRoot } from "./paths.js";
import { atomicJson } from "./state.js";
import { subscriptionEnv, type Provider } from "./security.js";
import { piCLIPath, claudeCLIPath } from "./dependencies.js";
import { customModels, enabledProviders, isSubscription } from "./providers.js";

export const piCLI = piCLIPath;
export const claudeCLI = claudeCLIPath;
export const claudeHome = join(dataRoot, "claude");
export const geminiHome = join(dataRoot, "google");
export const googleACP = join(dataRoot, "tools/antigravity-acp-1.2.1/agy_acp_server.par");

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
    enabledModels: enabledProviders().map(id => `${id}/*`),
    defaultTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
  });
  atomicJson(join(profileDir, "models.json"), customModels());
  atomicJson(join(profileDir, "claude-bridge.json"), {
    askClaude: { enabled: false },
    provider: { strictMcpConfig: true, autoMemoryEnabled: false, longContextExtraUsage: false, plan: "pro", pathToClaudeCodeExecutable: claudeCLI },
  });
  atomicJson(join(privateDir(join(geminiHome, ".gemini/antigravity-acp")), "settings.json"), { auth: { type: "oauth-personal" } });
  atomicJson(join(privateDir(join(geminiHome, ".gemini/config")), "mcp_config.json"), { mcpServers: {} });

}

export function harnessEnv(review = false): NodeJS.ProcessEnv {
  const env = subscriptionEnv();
  delete env.GEMINI_CLI_SYSTEM_SETTINGS_PATH; delete env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH;
  return {
    ...env, PATH: `${binDir}:${process.env.PATH || ""}`,
    PI_CODING_AGENT_DIR: profileDir, CLAUDE_CONFIG_DIR: claudeHome,
    GEMINI_CLI_HOME: geminiHome,
    GEMINI_HOME: join(geminiHome, ".gemini"),
    AGY_CLI_DISABLE_AUTO_UPDATE: "true",
    GEMINI_SYSTEM_MD: "false", GEMINI_WRITE_SYSTEM_MD: "false",
    NO_BROWSER: "true", DISABLE_AUTOUPDATER: "1",
    NVIM_APPNAME: editorApp, CC: join(binDir, "cc"),
    PH_LAUNCHED: "1",
  };
}

export function billingFile(): string { return join(configDir, "billing.json"); }
export function billingConfirmed(provider: Provider): boolean {
  if (!isSubscription(provider)) return enabledProviders().includes(provider);
  if (!existsSync(billingFile())) return false;
  const config = JSON.parse(readFileSync(billingFile(), "utf8"));
  return config[provider]?.extraUsageDisabled === true;
}
export function confirmBilling(provider: Provider): void {
  const config = existsSync(billingFile()) ? JSON.parse(readFileSync(billingFile(), "utf8")) : {};
  config[provider] = { extraUsageDisabled: true, confirmedBy: "user", at: new Date().toISOString() };
  atomicJson(billingFile(), config);
}
