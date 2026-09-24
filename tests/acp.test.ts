import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ACPWorker } from "../src/acp.js";
function setup(review = false, managedToolsOnly = false) {
  const dir = mkdtempSync(join(tmpdir(), "ph-acp-")); let output = "";
  const worker = new ACPWorker({ command: process.execPath, args: [resolve("tests/fixtures/acp-server.mjs")], cwd: dir, env: process.env, logDir: join(dir, "logs"), review, timeoutMs: 3000, approve: async () => true,
    managedToolsOnly, sessionMeta: managedToolsOnly ? { agy: { enabledTools: [] } } : undefined, mcpServers: managedToolsOnly ? [{ name: "ph", type: "http", url: "http://127.0.0.1/mcp", headers: [] }] : undefined,
    update: event => { if (event.update.sessionUpdate === "agent_message_chunk" && event.update.content.type === "text") output += event.update.content.text; } });
  return { worker, dir, output: () => output };
}
test("ACP negotiates and handles file and terminal callbacks end-to-end", async () => {
  const f = setup(); try {
    writeFileSync(join(f.dir, "input.txt"), "synthetic only");
    await f.worker.prompt("FILES"); assert.equal(readFileSync(join(f.dir, "output.txt"), "utf8"), "synthetic only");
    await f.worker.prompt("TERMINAL"); assert.match(f.output(), /executed-once/);
    await f.worker.prompt("ESCAPE"); assert.match(f.output(), /denied/);
    assert.equal(readFileSync(join(f.dir, "requests.jsonl"), "utf8").trim().split("\n").length, 3);
  } finally { f.worker.close(); }
});
test("managed ACP disables native callbacks and approves only named harness MCP tools", async () => {
  const f = setup(false, true); try {
    writeFileSync(join(f.dir, "input.txt"), "synthetic");
    // ACP sanitizes callback exceptions to a generic JSON-RPC error. Assert
    // rejected requests and absent side effects, not the internal error text.
    await assert.rejects(f.worker.prompt("FILES"));
    await assert.rejects(f.worker.prompt("WRITE"));
    await assert.rejects(f.worker.prompt("TERMINAL"));
    assert.equal(existsSync(join(f.dir, "output.txt")), false);
    assert.equal(existsSync(join(f.dir, "terminal-ran.txt")), false);
    assert.equal(f.output(), "");
    assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "capabilities.json"), "utf8")), {});
    assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "session-meta.json"), "utf8")), { agy: { enabledTools: [] } });
    await f.worker.prompt("PERMISSIONS"); assert.equal(f.output(), "selected\ncancelled\ncancelled\n");
  } finally { f.worker.close(); }
});
test("read-only ACP blocks writes and terminal execution", async () => {
  const f = setup(true); try {
    writeFileSync(join(f.dir, "input.txt"), "synthetic");
    await assert.rejects(f.worker.prompt("FILES")); assert.equal(existsSync(join(f.dir, "output.txt")), false);
    await assert.rejects(f.worker.prompt("TERMINAL")); assert.equal(existsSync(join(f.dir, "terminal-ran.txt")), false);
  } finally { f.worker.close(); }
});
test("quota failure is surfaced once without retry or provider fallback", async () => {
  const f = setup(); try { await assert.rejects(f.worker.prompt("QUOTA"), /429/); assert.equal(readFileSync(join(f.dir, "requests.jsonl"), "utf8").trim().split("\n").length, 1); } finally { f.worker.close(); }
});
test("cancel terminates the pending ACP request", async () => {
  const f = setup(); try { await f.worker.start(); const abort = new AbortController(); const pending = f.worker.prompt("HANG", abort.signal); setTimeout(() => abort.abort(), 100); await assert.rejects(pending); assert.equal(f.worker.sessionId, undefined); } finally { f.worker.close(); }
});
