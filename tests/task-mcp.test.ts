import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TaskStore } from "../src/state.js";
import { Instructions, pendingCheckpoints } from "../src/workflow.js";
import { startGeminiTools } from "../src/gemini-tools.js";
import { readArtifact } from "../src/artifacts.js";

test("real Gemini MCP enforces review mode, token and task isolation, and stages unapproved checkpoints", { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-mcp-")); const store = new TaskStore(root, root);
  const artifact = store.artifact("Exact synthetic result: 42");
  const before = JSON.stringify(store.task.decisions);
  const host = await startGeminiTools(store, { review: true, instructions: new Instructions(root, store.dir), signal: () => undefined, approve: async () => { throw new Error("Review must not request shell approval"); } });
  assert.ok("url" in host.server);
  const url = (host.server as any).url; const headers = Object.fromEntries((host.server as any).headers.map((h: any) => [h.name, h.value]));
  const client = new Client({ name: "ph-fixture", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  try {
    await client.connect(transport);
    assert.equal((await fetch(url)).status, 403);
    const list = await client.listTools(); assert.ok(list.tools.some(tool => tool.name === "read_task_artifact"));
    assert.ok(!list.tools.some(tool => ["bash", "write", "edit"].includes(tool.name)));
    const blocked: any = await client.callTool({ name: "bash", arguments: { command: "touch forbidden" } }); assert.equal(blocked.isError, true);
    const result: any = await client.callTool({ name: "read_task_artifact", arguments: { artifact_id: artifact } });
    assert.equal(JSON.parse(result.content[0].text).text, "Exact synthetic result: 42");
    const rejected: any = await client.callTool({ name: "read_task_artifact", arguments: { artifact_id: "../task.json" } }); assert.equal(rejected.isError, true);
    const proposed: any = await client.callTool({ name: "propose_checkpoint", arguments: { decisions: ["Fixture only"], nextSteps: ["Review"], validations: [] } });
    assert.equal(JSON.parse(proposed.content[0].text).status, "pending_user_approval");
    assert.equal(JSON.stringify(store.task.decisions), before); assert.equal(pendingCheckpoints(store.dir, store.task.id).length, 1);
    store.newTask("new task");
    const stale: any = await client.callTool({ name: "read_task_artifact", arguments: { artifact_id: artifact } }); assert.equal(stale.isError, true);
  } finally { await client.close(); await host.close(); }
});

test("Gemini MCP preserves full successful and failed command output before compaction", { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-mcp-output-")); const store = new TaskStore(root, root);
  writeFileSync(join(root, "verify.py"), "import sys\nfor i in range(1800):\n print('WARNING: MIDDLE_SIGNAL' if i == 900 else 'trace:' + 'x'*45)\nprint('END_RESULT')\nsys.exit(int(sys.argv[1]))\n");
  const commands: string[] = [];
  const host = await startGeminiTools(store, { review: false, instructions: new Instructions(root, store.dir), signal: () => undefined,
    approve: async command => { commands.push(command); return ["python3 verify.py 0", "python3 verify.py 7"].includes(command); } });
  const server = host.server as any;
  const client = new Client({ name: "ph-output-fixture", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: Object.fromEntries(server.headers.map((h: any) => [h.name, h.value])) } }));
    for (const code of [0, 7]) {
      const result: any = await client.callTool({ name: "bash", arguments: { command: `python3 verify.py ${code}` } });
      assert.equal(Boolean(result.isError), code !== 0);
      assert.ok(Buffer.byteLength(result.content[0].text) <= 8192);
      assert.match(result.content[0].text, /MIDDLE_SIGNAL/);
      const op = store.task.operations.at(-1)!;
      assert.equal(op.exitCode, code); assert.equal(op.status, code ? "failed" : "completed");
      const raw = readFileSync(join(store.dir, "artifacts", store.task.id, `${op.artifactId}.txt`), "utf8");
      assert.match(raw, /MIDDLE_SIGNAL/); assert.match(raw, /END_RESULT/); assert.ok(raw.length > 80000);
    }
    assert.equal(commands.length, 2);
    const denied: any = await client.callTool({ name: "read", arguments: { path: "/etc/passwd" } }); assert.equal(denied.isError, true);
  } finally { await client.close(); await host.close(); }
});

test("Gemini MCP distinguishes denied/pre-start calls from cancellation and timeout after partial writes", { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-mcp-cancel-")); const store = new TaskStore(root, join(root, "state"));
  writeFileSync(join(root, "partial.py"), "from pathlib import Path\nimport time\nprint('WARNING: MCP_PARTIAL', flush=True)\nPath('partial.txt').write_text('partial')\ntime.sleep(10)\nPath('finished.txt').write_text('done')\n");
  let allowed = false; let controller = new AbortController();
  const host = await startGeminiTools(store, { review: false, instructions: new Instructions(root, store.dir), signal: () => controller.signal, approve: async () => allowed });
  const server = host.server as any; const client = new Client({ name: "ph-cancel-fixture", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: Object.fromEntries(server.headers.map((h: any) => [h.name, h.value])) } }));
    await client.callTool({ name: "bash", arguments: { command: "python3 partial.py" } });
    assert.equal(store.task.operations.at(-1)!.status, "failed"); assert.equal(store.task.operations.at(-1)!.terminationReason, "not_started");
    assert.equal(existsSync(join(root, "partial.txt")), false); assert.doesNotThrow(() => store.assertSwitchable());
    allowed = true; controller.abort();
    await client.callTool({ name: "bash", arguments: { command: "python3 partial.py" } });
    assert.equal(store.task.operations.at(-1)!.status, "failed"); assert.equal(existsSync(join(root, "partial.txt")), false);
    for (const mode of ["cancelled", "timeout"]) {
      controller = new AbortController(); rmSync(join(root, "partial.txt"), { force: true });
      const run = client.callTool({ name: "bash", arguments: { command: "python3 partial.py", ...(mode === "timeout" ? { timeout: 0.5 } : {}) } });
      if (mode === "cancelled") {
        for (let i = 0; i < 500 && !existsSync(join(root, "partial.txt")); i++) await new Promise(resolve => setTimeout(resolve, 10));
        controller.abort();
      }
      const result: any = await run; const op = store.task.operations.at(-1)!;
      assert.equal(result.isError, true); assert.match(result.content[0].text, /Status: unknown/);
      assert.equal(op.status, "unknown"); assert.equal(op.terminationReason, mode); assert.equal(store.task.status, "needs_reconciliation");
      assert.equal(existsSync(join(root, "partial.txt")), true); assert.equal(existsSync(join(root, "finished.txt")), false);
      assert.match(readArtifact(store.dir, store.task.id, op.artifactId!).text, /MCP_PARTIAL/);
      controller = new AbortController();
      const blocked: any = await client.callTool({ name: "write", arguments: { path: "forbidden", content: "blocked" } });
      assert.equal(blocked.isError, true); assert.equal(existsSync(join(root, "forbidden")), false); assert.throws(() => store.assertSwitchable());
      store.reconcile(op.id, true, "Observed partial file and no final file; command stopped");
      assert.doesNotThrow(() => store.assertSwitchable());
    }
  } finally { controller.abort(); await client.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("closing Gemini MCP waits for a running command's partial artifact before returning", { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ph-mcp-drain-")); const store = new TaskStore(root, join(root, "state"));
  writeFileSync(join(root, "partial.py"), "from pathlib import Path\nimport time\nprint('WARNING: CLOSE_PARTIAL', flush=True)\nPath('partial.txt').write_text('partial')\ntime.sleep(10)\nPath('finished.txt').write_text('done')\n");
  let interrupted = 0;
  const host = await startGeminiTools(store, { review: false, instructions: new Instructions(root, store.dir), signal: () => undefined, approve: async () => true, interrupt: () => { interrupted++; } });
  const server = host.server as any; const client = new Client({ name: "ph-drain-fixture", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: Object.fromEntries(server.headers.map((h: any) => [h.name, h.value])) } }));
    const request = client.callTool({ name: "bash", arguments: { command: "python3 partial.py" } }).catch(() => undefined);
    for (let i = 0; i < 500 && !existsSync(join(root, "partial.txt")); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(existsSync(join(root, "partial.txt")), true);
    await host.close(); await client.close(); await request;
    const op = store.task.operations.find(op => op.tool === "bash")!;
    assert.equal(op.status, "unknown"); assert.equal(op.terminationReason, "cancelled");
    assert.match(readArtifact(store.dir, store.task.id, op.artifactId!).text, /CLOSE_PARTIAL/);
    assert.equal(store.task.status, "needs_reconciliation"); assert.equal(interrupted, 1);
    assert.equal(existsSync(join(root, "finished.txt")), false);
  } finally { await client.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});
