#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { billingConfirmed, claudeCLI, claudeHome, configure, confirmBilling, geminiCLI, geminiHome, harnessEnv, piCLI } from "./config.js";
import { binDir, configDir, profileDir, projectPath, repoRoot } from "./paths.js";
import { assertManagedProject, assertPrivateAuthStore, assertProvider, billingEnvNames, PROVIDERS, type Provider } from "./security.js";
import { acquireProjectLock, projectId, renderHandoff, TaskStore } from "./state.js";

const aliases: Record<string, Provider> = { gpt: "openai-codex", claude: "claude-bridge", gemini: "gemini-cli-acp" };
function provider(value?: string): Provider { const p = aliases[value || ""] || value || ""; assertProvider(p); return p; }
async function run(command: string, args: string[], cwd: string, env = harnessEnv(), track?: (pid: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    if (child.pid && track) track(child.pid);
    child.once("error", reject); child.once("exit", code => resolve(code ?? 1));
    const signal = () => child.kill("SIGTERM"); process.once("SIGTERM", signal);
    child.once("exit", () => process.removeListener("SIGTERM", signal));
  });
}
function version(command: string, args = ["--version"]): string {
  try { return execFileSync(command, args, { env: harnessEnv(), encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0] || "unknown"; }
  catch { return "MISSING / FAILED"; }
}
function authStatus(): Record<string, boolean | null> {
  let gpt = false;
  const file = join(profileDir, "auth.json");
  if (existsSync(file)) { try { assertPrivateAuthStore(file); gpt = Boolean(JSON.parse(readFileSync(file, "utf8"))["openai-codex"]); } catch { /* doctor shows unverified */ } }
  // File presence is only a local storage hint. Gemini can also use the OS
  // keychain, so no file means unknown, not necessarily logged out.
  const googleStore = ["oauth_creds.json", "gemini-credentials.json"].some(name => existsSync(join(geminiHome, ".gemini", name)));
  return { "openai-codex": gpt, "claude-bridge": existsSync(join(claudeHome, ".credentials.json")), "gemini-cli-acp": googleStore ? true : null };
}

async function main(): Promise<number> {
  const [command = "help", arg, ...rest] = process.argv.slice(2);
  configure();
  if (command === "doctor") {
    const report = { at: new Date().toISOString(), repo: repoRoot, tools: {
      node: process.version, pi: version(process.execPath, [piCLI, "--version"]),
      claude: version(claudeCLI), gemini: version(process.execPath, [geminiCLI, "--version"]),
      neovim: version(join(binDir, "nvim")), zellij: version(join(binDir, "zellij")),
      compiler: version(join(binDir, "cc")), treesitter: version(join(binDir, "tree-sitter")),
    }, credentialsPresent: authStatus(), billingConfirmed: Object.fromEntries(PROVIDERS.map(p => [p, billingConfirmed(p)])), excludedEnvironmentVariableNames: billingEnvNames(),
      authenticationCheck: "Local storage markers only; Gemini's official CLI validates its encrypted/keychain credentials during connection. null means unknown.",
      liveProviderValidation: "Not inferred from installation or credentials. Run the verification protocol in docs/VERIFICATION.md.",
    };
    console.log(JSON.stringify(report, null, 2)); return Object.values(report.tools).includes("MISSING / FAILED") ? 1 : 0;
  }
  if (command === "billing" && arg === "confirm") {
    const p = provider(rest[0]);
    if (rest[1] !== "--extra-usage-off") throw new Error("First disable/check extra usage, paid credits and auto-refill in the account; then pass --extra-usage-off.");
    confirmBilling(p); console.log(`Recorded your account-side confirmation for ${p}. This is not an automatic billing audit.`); return 0;
  }
  if (command === "login") {
    const p = provider(arg);
    if (p === "openai-codex") {
      console.log("In Pi, run /login and select OpenAI Codex (ChatGPT), then /quit. Do not choose an API-key provider.");
      return run(process.execPath, [piCLI, "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-tools", "--no-approve", "--provider", p], repoRoot);
    }
    if (p === "claude-bridge") return run(claudeCLI, ["auth", "login"], repoRoot);
    console.log("Choose Sign in with Google for your subscription account, complete browser login, then exit. API-key and Vertex routes are disabled.");
    return run(process.execPath, [geminiCLI, "--extensions", "none"], repoRoot);
  }
  if (["agent", "open", "status", "reconcile", "context"].includes(command)) {
    const project = projectPath(arg || process.cwd());
    if (command === "open") {
      const suffix = `${basename(project).replace(/[^a-zA-Z0-9_-]/g, "_")}-${projectId(project).slice(0, 6)}`;
      const session = `ph-${suffix}`;
      // attach --create recreates a missing workspace and reattaches a live one.
      return run(join(binDir, "zellij"), ["--config", join(configDir, "zellij.kdl"), "attach", "--create", session, "options", "--default-layout", join(repoRoot, "config/zellij/personal.kdl"), "--default-mode", "locked", "--default-cwd", project], project, { ...harnessEnv(), PH_PROJECT: project, PH_REPO: repoRoot });
    }
    if (command === "status") { const store = new TaskStore(project); console.log(renderHandoff(store.task)); console.log(`State: ${store.dir}`); return 0; }
    const release = acquireProjectLock(project);
    try {
      const store = new TaskStore(project);
      if (command === "reconcile") {
        const [id, status, ...note] = rest;
        const operation = store.task.operations.find(op => op.id === id);
        if (!operation || !["completed", "failed"].includes(status || "") || !note.length) throw new Error("Usage: ph reconcile PROJECT OPERATION_ID completed|failed 'observed result'");
        store.endOperation(id!, status === "failed", note.join(" ")); if (!store.unresolved().length) store.task.status = "paused"; store.checkpoint(); return 0;
      }
      if (command === "context") {
        const [file] = rest; if (!file) throw new Error("Usage: ph context PROJECT FILE");
        const { confinedPath } = await import("./security.js");
        const path = confinedPath(project, file); if (!existsSync(path)) throw new Error("Input file does not exist.");
        if (!store.task.inputs.includes(path)) store.task.inputs.push(path); store.checkpoint(); console.log("Input selected; use /task add while the agent is running."); return 0;
      }
      assertManagedProject(project); assertPrivateAuthStore(join(profileDir, "auth.json")); store.recoverInterrupted();
      const args = [piCLI, "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve",
        "--extension", join(repoRoot, "dist/extension.js"), "--extension", join(repoRoot, "node_modules/pi-claude-bridge/src/index.ts"),
        "--session-dir", join(store.dir, "sessions"), "--models", "openai-codex/*,claude-bridge/*,gemini-cli-acp/*", "--tools", "read,bash,edit,write,grep,find,ls"];
      if (rest.includes("--rpc")) args.push("--mode", "rpc");
      else console.log("Personal Harness: /switch selects the primary worker; /task shows saved state. Escape cancels the active turn.");
      return await run(process.execPath, args, project, harnessEnv(), release.track);
    } finally { release(); }
  }
  console.log(`Personal Harness — code, research, writing, and personal projects\n  ph doctor\n  ph login gpt|claude|gemini\n  ph billing confirm gpt|claude|gemini --extra-usage-off\n  ph open PROJECT          Zellij + LazyVim + agent\n  ph agent PROJECT         Agent only\n  ph status PROJECT        Task and handoff\n  ph reconcile PROJECT ID completed|failed 'observed result'\n  ph context PROJECT FILE  Select input before starting an agent\n\nIn Pi: /switch, /review, /task, /handoff, /usage. No automatic paid fallback.`);
  return 0;
}
main().then(code => { process.exitCode = code; }).catch(error => { console.error(String(error)); process.exitCode = 1; });
