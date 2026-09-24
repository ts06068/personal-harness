import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { ALIASES, customModels, validateProvider } from "../src/providers.js";
const cliPath = process.env.PH_TEST_CLI || resolve("dist/cli.js");

test("ChatGPT is the primary alias; additional routes cannot replace subscription transports or hide remote billing", () => {
  assert.equal(ALIASES.chatgpt, "openai-codex"); assert.equal(ALIASES.gpt, ALIASES.chatgpt);
  const local = { id: "local-test", label: "Local", billing: "local", api: "openai-completions", baseUrl: "http://127.0.0.1:1234/v1", models: [{ id: "fixture" }] };
  assert.equal(validateProvider(local).id, "local-test");
  for (const change of [{ id: "openai-codex" }, { id: "chatgpt" }, { baseUrl: "https://paid.example/v1" }, { baseUrl: "http://169.254.169.254/v1" }, { apiKey: "secret" }, { apiKeyEnv: "ANTHROPIC_API_KEY" }, { models: [{ id: "fixture", baseUrl: "https://other.example" }] }]) assert.throws(() => validateProvider({ ...local, ...change }));
  assert.deepEqual(customModels([validateProvider(local)]), { providers: { "local-test": { baseUrl: local.baseUrl, api: local.api, models: local.models, apiKey: "local-no-key" } } });
});

test("CLI registration requires API opt-in and keeps the three subscription routes enabled", { timeout: 60000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "ph-registry-"));
  const env = { ...process.env, PH_INSTALL_HOME: root, PH_DATA_DIR: join(root, "data"), PH_STATE_DIR: join(root, "state") };
  const cli = (...args: string[]) => execFileSync(process.execPath, [cliPath, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.throws(() => cli("providers", "add", "openrouter"), /allow-paid-api/);
  assert.equal(existsSync(join(root, "data/config/providers.json")), false);
  assert.match(cli("providers", "add", "openrouter", "--allow-paid-api"), /Registered/);
  const listing = cli("providers", "list");
  for (const value of ["ChatGPT", "Claude", "Gemini", "openrouter", "charges possible"]) assert.ok(listing.includes(value));
  const registry = JSON.parse(readFileSync(join(root, "data/config/providers.json"), "utf8")); assert.equal(registry.length, 1);
  cli("providers", "remove", "openrouter"); assert.doesNotMatch(cli("providers", "list"), /charges possible/);
});

test("real Pi uses a registered compatible API and pauses on a quota error without fallback", { timeout: 90000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-provider-rpc-")); const project = join(root, "project"); mkdirSync(project);
  const env = { ...process.env, PH_INSTALL_HOME: root, PH_DATA_DIR: join(root, "data"), PH_STATE_DIR: join(root, "state"), PH_MODEL_FIXTURE_KEY: "synthetic-key", ANTHROPIC_API_KEY: "must-not-reach-subscription-runtime" };
  let count = 0; let quota = false;
  const http = createServer((request, response) => {
    count++; assert.equal(request.headers.authorization, "Bearer synthetic-key");
    request.resume();
    if (quota) { response.writeHead(429, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "429 rate limit synthetic fixture", type: "rate_limit_error" } })); return; }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const chunk of [
      { choices: [{ index: 0, delta: { role: "assistant", content: "COMPATIBLE_FIXTURE_OK" }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 } },
    ]) response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", ...chunk })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address() as { port: number };
  const config = join(root, "provider.json");
  writeFileSync(config, JSON.stringify({ id: "compatible-test", label: "Fixture", billing: "api", api: "openai-completions", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnv: "PH_MODEL_FIXTURE_KEY", models: [{ id: "fixture", contextWindow: 32000, maxTokens: 1024 }] }));
  execFileSync(process.execPath, [cliPath, "providers", "add", config, "--allow-paid-api"], { env, stdio: "pipe" });
  const child = spawn(process.execPath, [cliPath, "agent", project, "--rpc"], { env, stdio: "pipe" });
  child.stderr.on("data", () => {});
  let seq = 0; let endTurn: (() => void) | undefined;
  const pending = new Map<string, { resolve: (value: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  const reader = createInterface({ input: child.stdout });
  reader.on("line", line => {
    let event: any; try { event = JSON.parse(line); } catch { return; }
    if (event.type === "response" && pending.has(event.id)) { const p = pending.get(event.id)!; pending.delete(event.id); clearTimeout(p.timer); event.success ? p.resolve(event.data) : p.reject(new Error(event.error)); }
    if (event.type === "agent_end") endTurn?.();
  });
  const request = (type: string, extra = {}): Promise<any> => new Promise((resolve, reject) => {
    const id = String(++seq); const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timed out: ${type}`)); }, 40000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, type, ...extra }) + "\n");
  });
  const turn = async () => {
    let timer: NodeJS.Timeout;
    const ended = new Promise<void>((resolve, reject) => { timer = setTimeout(() => reject(new Error("Turn timed out")), 20000); endTurn = resolve; });
    try { await request("prompt", { message: "Synthetic connection test; reply briefly without tools." }); await ended; }
    finally { clearTimeout(timer!); endTurn = undefined; }
  };
  try {
    await request("get_commands"); await request("prompt", { message: "/switch compatible-test" });
    assert.equal((await request("get_state")).model.provider, "compatible-test");
    await turn(); assert.equal(count, 1);
    assert.match(JSON.stringify(await request("get_messages")), /COMPATIBLE_FIXTURE_OK/);
    quota = true; await turn(); assert.equal(count, 2);
    assert.match(execFileSync(process.execPath, [cliPath, "status", project], { env, encoding: "utf8" }), /rate_limited/);
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    child.kill("SIGTERM"); reader.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()));
  }
});
