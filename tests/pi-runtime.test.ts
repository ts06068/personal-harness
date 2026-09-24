import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("real Pi runtime reloads the harness and starts fresh worker/review sessions without inference", { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-pi-"));
  const data = join(root, "data"); mkdirSync(join(data, "config"), { recursive: true });
  // Fixture attestation applies only to this temporary profile. No credentials, no model request.
  writeFileSync(join(data, "config/billing.json"), JSON.stringify({ "gemini-cli-acp": { extraUsageDisabled: true } }));
  const project = join(root, "project"); mkdirSync(project);
  const child = spawn(process.execPath, [process.env.PH_TEST_CLI || resolve("dist/cli.js"), "agent", project, "--rpc"], {
    env: { ...process.env, PH_DATA_DIR: data, PH_STATE_DIR: join(root, "state") }, stdio: "pipe",
  });
  let seq = 0; const pending = new Map<string, { resolve: (x: any) => void; reject: (error: Error) => void }>(); const errors: string[] = [];
  child.stderr.on("data", () => {});
  const reader = createInterface({ input: child.stdout });
  reader.on("line", line => {
    let value: any; try { value = JSON.parse(line); } catch { return; }
    if (value.type === "extension_error") errors.push(value.error);
    if (value.type === "response" && pending.has(value.id)) { const promise = pending.get(value.id)!; pending.delete(value.id); value.success ? promise.resolve(value.data) : promise.reject(new Error(value.error)); }
  });
  function request(type: string, extra = {}): Promise<any> {
    const id = String(++seq);
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, type, ...extra }) + "\n"); });
  }
  try {
    const commands = await request("get_commands"); assert.ok(commands.commands.some((c: any) => c.name === "switch"));
    const initial = await request("get_state");
    await request("prompt", { message: "/switch gemini" });
    const first = await request("get_state");
    assert.equal(first.model.provider, "gemini-cli-acp"); assert.notEqual(first.sessionId, initial.sessionId); assert.equal(first.messageCount, 0);
    await request("prompt", { message: "/review gemini" });
    const review = await request("get_state");
    assert.notEqual(review.sessionId, first.sessionId); assert.equal(review.messageCount, 0); assert.equal(review.isStreaming, false);
    assert.deepEqual(errors, []);
  } finally { child.kill("SIGTERM"); reader.close(); }
});
