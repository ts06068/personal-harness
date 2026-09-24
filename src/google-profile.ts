import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { privateDir } from "./paths.js";

// Native Gemini settings/hooks/skills must not be inherited around the MCP
// guard. Use an empty metadata workspace and the dedicated Gemini home;
// project access is exclusively through our parent-owned MCP tools.
export function assertGoogleProfile(home: string): void {
  const root = join(home, ".gemini");
  const settings = JSON.parse(readFileSync(join(root, "antigravity-acp/settings.json"), "utf8"));
  if (settings.auth?.type !== "oauth-personal" || settings.gcp) throw new Error("Google must use the managed personal-subscription OAuth profile.");
  const mcp = join(root, "config/mcp_config.json");
  if (existsSync(mcp) && Object.keys(JSON.parse(readFileSync(mcp, "utf8")).mcpServers || {}).length) throw new Error("Unmanaged global Google MCP servers are not allowed.");
  for (const relative of ["GEMINI.md", "AGENTS.md", "config/hooks.json", "config/skills", "config/rules", "config/agents", "antigravity-cli/skills"]) {
    const file = join(root, relative);
    if (!existsSync(file)) continue;
    if (relative.endsWith(".md") || relative.endsWith(".json") || readdirSync(file).length) throw new Error(`Unmanaged Google context/configuration: ${file}. Keep this harness profile dedicated; select project instructions with /instructions.`);
  }
}
export function googleWorkspace(taskDir: string): string {
  return mkdtempSync(join(privateDir(join(taskDir, "google-workspaces")), "segment-"));
}
