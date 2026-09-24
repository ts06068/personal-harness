import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createManagedShell } from "../src/shell.js";
import { TaskStore } from "../src/state.js";
import { readArtifact } from "../src/artifacts.js";

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "ph-shell-")); const project = join(root, "project"); mkdirSync(project);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new TaskStore(project, join(root, "state"));
  return { project, store };
}
function original(store: TaskStore, id: string): string {
  const artifact = store.task.operations.find(op => op.id === id)!.artifactId!;
  let text = ""; let offset = 0;
  while (true) {
    const page = readArtifact(store.dir, store.task.id, artifact, offset, 4093);
    text += page.text; if (page.eof) return text; offset = page.nextOffset;
  }
}
async function waitForFile(path: string) {
  for (let i = 0; i < 500; i++) { if (existsSync(path)) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error(`Fixture did not start: ${path}`);
}
const partial = "from pathlib import Path\nimport time\nprint('WARNING: PARTIAL_WRITE', flush=True)\nPath('partial.txt').write_text('partial')\ntime.sleep(10)\nPath('finished.txt').write_text('done')\n";

test("managed bash retains exact large UTF-8 output and exit status on success and failure", async t => {
  const { project, store } = fixture(t); const shell = await createManagedShell(store);
  const text = "한글😀 trace\n".repeat(6000) + "WARNING: MIDDLE_FAILURE\n" + "tail\n".repeat(15000) + "END_RESULT\n";
  writeFileSync(join(project, "expected.txt"), text);
  for (const code of [0, 1, 7]) {
    const id = `exit-${code}`;
    const run = shell.definition.execute(id, { command: `cat expected.txt; exit ${code}` });
    if (code) await assert.rejects(run); else await run;
    const op = store.task.operations.at(-1)!; const result = shell.result(id)!;
    assert.equal(op.status, code ? "failed" : "completed"); assert.equal(op.exitCode, code);
    assert.equal(op.terminationReason, "exit"); assert.equal(result.isError, code !== 0);
    assert.equal(original(store, id), text);
    assert.match(result.content[0].text, /MIDDLE_FAILURE/); assert.match(result.content[0].text, /END_RESULT/);
    assert.ok(Buffer.byteLength(result.content[0].text) <= 8192); assert.equal(result.content[0].text.includes("�"), false);
    shell.forget(id);
  }
  for (let i = 0; i < 20; i++) { store.beginOperation(`read-${i}`, "read"); store.endOperation(`read-${i}`, { status: "completed" }, "ok"); }
  assert.match(store.checkpoint(), /MIDDLE_FAILURE/); assert.ok(Buffer.byteLength(store.checkpoint()) <= 16384);
  assert.doesNotThrow(() => store.assertSwitchable());
});

test("cancellation after a partial write stays unknown across late events and restart until reconciliation", async t => {
  const { project, store } = fixture(t); const shell = await createManagedShell(store);
  writeFileSync(join(project, "partial.py"), partial);
  const controller = new AbortController();
  const run = shell.definition.execute("cancel", { command: "python3 partial.py" }, controller.signal);
  const rejected = assert.rejects(run);
  try { await waitForFile(join(project, "partial.txt")); } finally { controller.abort(); }
  await rejected;
  const op = store.task.operations.at(-1)!; const artifact = op.artifactId;
  assert.equal(op.status, "unknown"); assert.equal(op.terminationReason, "cancelled"); assert.equal(op.exitCode, undefined);
  assert.equal(existsSync(join(project, "finished.txt")), false); assert.equal(readFileSync(join(project, "partial.txt"), "utf8"), "partial");
  assert.match(original(store, "cancel"), /PARTIAL_WRITE/);
  assert.match(shell.result("cancel")!.content[0].text, /Status: unknown/);
  assert.equal(store.task.status, "needs_reconciliation"); assert.throws(() => store.assertSwitchable());
  store.endOperation("cancel", { status: "failed" }, "late error"); assert.equal(op.status, "unknown"); assert.equal(op.artifactId, artifact);
  const resumed = new TaskStore(project, store.root); resumed.recoverInterrupted();
  assert.throws(() => resumed.newTask("must remain blocked"));
  resumed.reconcile("cancel", true, "Observed partial.txt; finished.txt absent; child exited");
  assert.doesNotThrow(() => resumed.assertSwitchable()); assert.equal(resumed.task.operations.at(-1)!.artifactId, artifact);
});

test("timeout is an unknown outcome even though the caller signal is not aborted", async t => {
  const { project, store } = fixture(t); const shell = await createManagedShell(store);
  writeFileSync(join(project, "partial.py"), partial);
  const controller = new AbortController();
  await assert.rejects(shell.definition.execute("timeout", { command: "python3 partial.py", timeout: 0.5 }, controller.signal));
  assert.equal(controller.signal.aborted, false); assert.equal(existsSync(join(project, "partial.txt")), true);
  assert.equal(existsSync(join(project, "finished.txt")), false);
  assert.equal(store.task.operations.at(-1)!.terminationReason, "timeout");
  assert.equal(store.task.operations.at(-1)!.status, "unknown"); assert.throws(() => store.assertSwitchable());
  assert.match(original(store, "timeout"), /PARTIAL_WRITE/);
});

test("pre-execution cancellation and invalid timeout do not execute or require reconciliation", async t => {
  const { project, store } = fixture(t); const shell = await createManagedShell(store);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(shell.definition.execute("before", { command: "touch forbidden" }, controller.signal));
  await assert.rejects(shell.definition.execute("invalid", { command: "touch forbidden", timeout: -1 }));
  assert.equal(existsSync(join(project, "forbidden")), false);
  assert.ok(store.task.operations.every(op => op.status === "failed" && op.terminationReason === "not_started"));
  assert.doesNotThrow(() => store.assertSwitchable());
});

test("concurrent calls keep independent output and cancellation does not alter a completed sibling", async t => {
  const { project, store } = fixture(t); const shell = await createManagedShell(store);
  writeFileSync(join(project, "partial.py"), partial);
  const controller = new AbortController();
  const slow = assert.rejects(shell.definition.execute("slow", { command: "python3 partial.py" }, controller.signal));
  try {
    await shell.definition.execute("fast", { command: "printf 'FAST_ONLY'" });
    await waitForFile(join(project, "partial.txt"));
  } finally { controller.abort(); }
  await slow;
  assert.equal(original(store, "fast"), "FAST_ONLY"); assert.doesNotMatch(original(store, "slow"), /FAST_ONLY/);
  assert.equal(store.task.operations.find(op => op.id === "fast")!.status, "completed");
  assert.equal(store.task.operations.find(op => op.id === "slow")!.status, "unknown");
  store.endOperation("fast", { status: "unknown", terminationReason: "cancelled" });
  assert.equal(store.task.operations.find(op => op.id === "fast")!.status, "completed");
});
