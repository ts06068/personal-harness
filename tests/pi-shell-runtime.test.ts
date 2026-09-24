import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { piCLIPath } from "../src/dependencies.js";

test("real Pi event pipeline preserves failed shell results and enforces interruption recovery without inference", { timeout: 90000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-pi-shell-")); const project = join(root, "project"); mkdirSync(project);
  const data = join(root, "data"); mkdirSync(join(data, "config"), { recursive: true });
  const profile = join(data, "pi"); mkdirSync(profile);
  writeFileSync(join(data, "config/billing.json"), JSON.stringify({ "openai-codex": { extraUsageDisabled: true } }));
  writeFileSync(join(profile, "settings.json"), JSON.stringify({ retry: { enabled: false }, compaction: { enabled: false }, cacheWarming: "off", enableAnalytics: false, enableInstallTelemetry: false, defaultProjectTrust: "never" }));
  const source = "prefix\n".repeat(13000) + "WARNING: PI_MIDDLE_FAILURE\n" + "tail\n".repeat(15000);
  writeFileSync(join(project, "large.txt"), source);
  writeFileSync(join(project, "partial.py"), "from pathlib import Path\nimport time\nprint('WARNING: PARTIAL_EFFECT', flush=True)\nPath('partial.txt').write_text('partial')\ntime.sleep(10)\nPath('finished.txt').write_text('done')\n");
  const callsFile = join(root, "model-calls.txt");
  // Replace only the model transport with a deterministic tool-call producer.
  // Pi loads the real harness extension, executes real tools and emits its real events.
  const fakeProvider = join(root, "fixture-provider.mjs");
  writeFileSync(fakeProvider, `
import { createAssistantMessageEventStream } from ${JSON.stringify(fileURLToPath(import.meta.resolve("@earendil-works/pi-ai")))};
import { appendFileSync } from 'node:fs';
export default function(pi) {
  pi.registerProvider('openai-codex', { name: 'Offline fixture', api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api/codex', apiKey: 'offline-fixture',
    models: [{ id: 'fixture', name: 'fixture', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 1000 }],
    streamSimple(model, context) {
      appendFileSync(${JSON.stringify(callsFile)}, 'call\\n');
      const stream = createAssistantMessageEventStream();
      const last = context.messages.at(-1);
      const input = context.messages.filter(m => m.role === 'user').flatMap(m => typeof m.content === 'string' ? [m.content] : m.content.filter(p => p.type === 'text').map(p => p.text)).findLast(t => t.startsWith('FIXTURE_CMD:'));
      const command = input && JSON.parse(input.slice('FIXTURE_CMD:'.length));
      const call = command && last?.role !== 'toolResult';
      const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), stopReason: call ? 'toolUse' : 'stop',
        content: call ? [{ type: 'toolCall', id: crypto.randomUUID(), name: 'bash', arguments: command }] : [{ type: 'text', text: 'Fixture complete' }],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      stream.push({ type: 'done', reason: message.stopReason, message }); stream.end(); return stream;
    }
  });
}
`);
  const state = join(root, "state");
  const taskFile = join(state, "projects", createHash("sha256").update(project).digest("hex").slice(0, 16), "task.json");
  const child = spawn(process.execPath, [piCLIPath, "--mode", "rpc", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve", "--extension", resolve("dist/extension.js"), "--extension", fakeProvider, "--provider", "openai-codex", "--model", "fixture", "--session-dir", join(root, "sessions")], {
    cwd: project, env: { ...process.env, PH_LAUNCHED: "1", PH_DATA_DIR: data, PH_STATE_DIR: state, PI_CODING_AGENT_DIR: profile }, stdio: "pipe",
  });
  let seq = 0; const pending = new Map<string, { resolve: (x: any) => void; reject: (e: Error) => void }>();
  const notices: string[] = []; const errors: string[] = []; const results: any[] = []; let stderr = ""; let otherOutput = "";
  const reader = createInterface({ input: child.stdout }); child.stderr.on("data", data => { stderr += data; });
  function request(type: string, more = {}): Promise<any> {
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC ${type} timed out: ${stderr.slice(-1500)} ${otherOutput.slice(-1500)} ${errors.join("; ")}`)); }, 45000);
      pending.set(id, { resolve: data => { clearTimeout(timer); resolve(data); }, reject: error => { clearTimeout(timer); reject(error); } });
      child.stdin.write(JSON.stringify({ id, type, ...more }) + "\n");
    });
  }
  reader.on("line", line => {
    let event: any; try { event = JSON.parse(line); } catch { otherOutput += line + "\n"; return; }
    if (event.type === "extension_error") errors.push(event.error);
    if (event.type === "tool_execution_end") results.push(event);
    if (event.type === "response" && pending.has(event.id)) { const p = pending.get(event.id)!; pending.delete(event.id); event.success ? p.resolve(event.data) : p.reject(new Error(event.error)); }
    if (event.type === "extension_ui_request") {
      if (event.method === "notify") notices.push(event.message);
      if (event.method === "confirm") child.stdin.write(JSON.stringify({ type: "extension_ui_response", id: event.id, confirmed: ["cat large.txt; exit 1", "python3 partial.py"].includes(event.message) }) + "\n");
      if (event.method === "select") child.stdin.write(JSON.stringify({ type: "extension_ui_response", id: event.id, value: event.options.find((x: string) => x === "fixture") }) + "\n");
    }
  });
  const task = () => JSON.parse(readFileSync(taskFile, "utf8"));
  async function idle() {
    for (let i = 0; i < 300; i++) { if (!(await request("get_state")).isStreaming) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw new Error("Pi did not settle");
  }
  const prompt = (message: string) => request("prompt", { message });
  try {
    await request("get_commands"); await prompt("/switch chatgpt");
    await prompt('FIXTURE_CMD:{"command":"cat large.txt; exit 1"}'); await idle();
    const failed = task().operations.find((op: any) => op.tool === "bash");
    assert.equal(failed.status, "failed"); assert.equal(failed.exitCode, 1);
    assert.equal(readFileSync(join(state, "projects", createHash("sha256").update(project).digest("hex").slice(0, 16), "artifacts", task().id, `${failed.artifactId}.txt`), "utf8"), source);
    const ended = results.find(event => event.toolCallId === failed.id);
    assert.equal(ended.isError, true); assert.match(ended.result.content[0].text, /PI_MIDDLE_FAILURE/);
    assert.equal(ended.result.details.artifactId, failed.artifactId); assert.ok(Buffer.byteLength(ended.result.content[0].text) <= 8192);
    await prompt('FIXTURE_CMD:{"command":"python3 partial.py"}');
    for (let i = 0; i < 500 && !existsSync(join(project, "partial.txt")); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(existsSync(join(project, "partial.txt")), true);
    await request("abort"); await idle();
    const interrupted = task().operations.findLast((op: any) => op.tool === "bash");
    assert.equal(interrupted.status, "unknown"); assert.equal(task().status, "needs_reconciliation");
    assert.equal(existsSync(join(project, "finished.txt")), false);
    const before = await request("get_state"); const taskId = task().id; const calls = readFileSync(callsFile, "utf8");
    await prompt("/switch chatgpt"); await prompt("/review chatgpt"); await prompt("/task new blocked");
    await prompt('FIXTURE_CMD:{"command":"touch forbidden"}');
    assert.equal((await request("get_state")).sessionId, before.sessionId); assert.equal(task().id, taskId);
    assert.equal(readFileSync(callsFile, "utf8"), calls); assert.equal(existsSync(join(project, "forbidden")), false);
    assert.ok(notices.some(message => /Unresolved|reconciliation/.test(message)));
    await prompt(`/task reconcile ${interrupted.id} failed Observed partial file, no final file, terminated command`);
    await prompt("/review chatgpt"); assert.notEqual((await request("get_state")).sessionId, before.sessionId);
    await prompt('FIXTURE_CMD:{"command":"touch forbidden"}'); await idle();
    assert.equal(existsSync(join(project, "forbidden")), false); assert.deepEqual(errors, []);
  } finally {
    await request("abort").catch(() => {}); child.kill("SIGTERM"); reader.close();
    await new Promise<void>(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once("exit", () => resolve()); });
    rmSync(root, { recursive: true, force: true });
  }
});
