import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { confinedPath, writeConfinedText } from "../src/security.js";
import { TaskStore, acquireProjectLock, renderHandoff } from "../src/state.js";
import { readArtifact, resultEnvelope, saveArtifact, detectWarnings } from "../src/artifacts.js";
import { Instructions, stageCheckpoint, pendingCheckpoints, decideCheckpoint } from "../src/workflow.js";
import { assertGoogleProfile, googleWorkspace } from "../src/google-profile.js";
import { HarnessUI } from "../src/ui.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ph-v2-")); const project = join(root, "project"); mkdirSync(project);
  return { root, project, store: new TaskStore(project, join(root, "state")) };
}
test("dangling final/intermediate and cyclic symlinks cannot create files outside project", () => {
  const { root, project } = fixture(); mkdirSync(join(root, "outside"));
  symlinkSync(join(root, "outside/new.txt"), join(project, "output.txt"));
  assert.throws(() => writeConfinedText(project, "output.txt", "must not escape"));
  assert.equal(existsSync(join(root, "outside/new.txt")), false);
  symlinkSync(join(root, "outside/not-yet"), join(project, "dir"));
  assert.throws(() => confinedPath(project, "dir/new.txt"));
  symlinkSync("b", join(project, "a")); symlinkSync("a", join(project, "b"));
  assert.throws(() => confinedPath(project, "a"));
  mkdirSync(join(project, "inside")); symlinkSync("inside", join(project, "alias"));
  writeConfinedText(project, "alias/ok.txt", "inside"); assert.equal(readFileSync(join(project, "inside/ok.txt"), "utf8"), "inside");
});
test("warnings survive the middle of large logs, old operations and a bounded UTF-8 handoff", () => {
  const { store } = fixture();
  const text = "한글 결과\n".repeat(2500) + "WARNING: model did not converge\n" + "x".repeat(20000);
  store.beginOperation("original", "analysis"); store.endOperation("original", true, text, 1);
  for (let i = 0; i < 20; i++) { store.beginOperation(`later-${i}`, "read"); store.endOperation(`later-${i}`, false, "ok"); }
  store.task.goal = "긴 목표".repeat(20000); store.task.decisions.push("긴 결정".repeat(20000));
  const handoff = store.checkpoint(); assert.ok(Buffer.byteLength(handoff) <= 16384); assert.match(handoff, /did not converge/);
  assert.equal(handoff.includes("�"), false);
  const original = store.task.operations[0]!; assert.ok(original.artifactId); assert.equal(original.exitCode, 1);
  let output = ""; let offset = 0;
  while (true) { const page = readArtifact(store.dir, store.task.id, original.artifactId!, offset, 4096); output += page.text; if (page.eof) break; assert.ok(page.nextOffset > offset); offset = page.nextOffset; }
  assert.equal(output, text);
  store.reconcile("original", true, "Inspected output: needs repair"); assert.equal(store.task.operations[0]!.artifactId, original.artifactId);
  assert.match(store.checkpoint(), /did not converge/);
});
test("result compaction retains warnings and an exact retrievable original", () => {
  const { store } = fixture(); const text = "x".repeat(30000) + "\nWARNING: hidden middle\n" + "y".repeat(30000) + "\nVALIDATION_OK";
  const id = store.artifact(text); const result = resultEnvelope(text, id, false);
  assert.ok(Buffer.byteLength(result) <= 8192); assert.match(result, /hidden middle/); assert.match(result, new RegExp(id));
  assert.ok(detectWarnings(text).some(w => w.includes("hidden middle")));
  assert.match(result, /VALIDATION_OK/);
});
test("UTF-8 artifact pages preserve all bytes at small and irregular boundaries", () => {
  const { store } = fixture(); const original = "abc한😀éZ".repeat(53); const id = store.artifact(original);
  for (const limit of [4, 5, 6, 7, 11, 31]) {
    let offset = 0; let text = "";
    while (true) { const page = readArtifact(store.dir, store.task.id, id, offset, limit); text += page.text; assert.ok(Buffer.byteLength(page.text) <= limit); if (page.eof) break; assert.ok(page.nextOffset > offset); offset = page.nextOffset; }
    assert.equal(text, original);
  }
});
test("artifact reader rejects traversal, foreign tasks, invalid paging and stale task IDs", () => {
  const { store } = fixture(); const taskId = store.task.id; const id = store.artifact("private task result");
  assert.throws(() => readArtifact(store.dir, taskId, "../task.json"));
  assert.throws(() => readArtifact(store.dir, taskId, id, -1));
  assert.throws(() => readArtifact(store.dir, taskId, id, 0, 20000));
  store.newTask("another task"); assert.throws(() => readArtifact(store.dir, store.task.id, id));
});
test("legacy state is backed up and warnings beyond the old summary limit are recovered", () => {
  const { store, project, root } = fixture(); store.beginOperation("legacy", "analysis");
  const original = "x".repeat(20000) + "\nWARNING: late legacy warning";
  store.event("operation_end", { id: "legacy", summary: original });
  const legacy: any = { ...store.task, version: 1 }; delete legacy.validations;
  legacy.operations[0].summary = original.slice(0, 12000);
  writeFileSync(store.file, JSON.stringify(legacy));
  const migrated = new TaskStore(project, join(root, "state"));
  assert.equal(migrated.task.version, 2); assert.ok(existsSync(join(store.dir, `task-v1-${legacy.id}.json`)));
  assert.match(migrated.checkpoint(), /late legacy warning/);
});
test("overlapping directories and Git subdirectories share one writer; siblings and worktrees remain independent", () => {
  const { project, root } = fixture(); const sub = join(project, "src"); mkdirSync(sub);
  const release = acquireProjectLock(project, join(root, "locks-state"));
  assert.throws(() => acquireProjectLock(sub, join(root, "locks-state")), /active harness writer/); release();
  execFileSync("git", ["init", "-q", project]);
  const fromChild = acquireProjectLock(sub, join(root, "locks-state")); assert.throws(() => acquireProjectLock(project, join(root, "locks-state")), /active harness writer/); fromChild();
  const sibling = join(root, "sibling"); mkdirSync(sibling);
  const one = acquireProjectLock(project, join(root, "locks-state")); const two = acquireProjectLock(sibling, join(root, "locks-state")); two(); one();
  execFileSync("git", ["-C", project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"]);
  const worktree = join(root, "worktree"); execFileSync("git", ["-C", project, "worktree", "add", "--detach", worktree], { stdio: "ignore" });
  const a = acquireProjectLock(project, join(root, "locks-state")); const b = acquireProjectLock(worktree, join(root, "locks-state")); b(); a();
});
test("instruction approval binds exact contents and imports, with a shared budget", () => {
  const { project, store } = fixture(); const file = join(project, "AGENTS.md"); writeFileSync(file, "PROJECT_SENTINEL: prefer small edits.");
  const instructions = new Instructions(project, store.dir);
  assert.doesNotMatch(instructions.packet(), /PROJECT_SENTINEL/);
  instructions.approve(instructions.preview(file)); assert.match(instructions.packet(), /PROJECT_SENTINEL/);
  writeFileSync(file, "Changed rules"); assert.throws(() => instructions.assertCurrent(), /changed/);
  instructions.remove(); writeFileSync(join(project, "GEMINI.md"), "Import @rules.txt\n"); writeFileSync(join(project, "rules.txt"), "Use the fixture only.");
  assert.throws(() => instructions.assertNative(), /unapproved/);
  instructions.approve(instructions.preview("GEMINI.md")); instructions.assertNative();
  writeFileSync(join(project, "rules.txt"), "different"); assert.throws(() => instructions.assertNative(), /changed/);
  instructions.remove(); writeFileSync(file, "a".repeat(9000)); assert.throws(() => instructions.preview(file), /8 KiB/);
});
test("checkpoint staging never changes decisions, requires approval, and rejects stale proposals", () => {
  const { store } = fixture(); const proposal = { decisions: ["Use existing library"], nextSteps: ["Run checks"], validations: ["Fixture test passed"] };
  stageCheckpoint(store.dir, store.task, proposal); assert.deepEqual(store.task.decisions, []);
  const pending = pendingCheckpoints(store.dir, store.task.id); assert.equal(pending.length, 1);
  decideCheckpoint(store, pending[0]!, true); assert.deepEqual(store.task.decisions, proposal.decisions); assert.equal(pendingCheckpoints(store.dir, store.task.id).length, 0);
  stageCheckpoint(store.dir, store.task, proposal); store.task.goal = "changed goal";
  assert.throws(() => decideCheckpoint(store, pendingCheckpoints(store.dir, store.task.id)[0]!, true), /changed/);
});
test("Google uses an empty native workspace and refuses unmanaged global context", () => {
  const { root, project, store } = fixture();
  writeFileSync(join(project, "GEMINI.md"), "Unapproved project sentinel");
  const native = googleWorkspace(store.dir);
  assert.notEqual(native, project); assert.equal(existsSync(join(native, "GEMINI.md")), false);
  const home = join(root, "google"); mkdirSync(join(home, ".gemini/antigravity-acp"), { recursive: true });
  writeFileSync(join(home, ".gemini/antigravity-acp/settings.json"), JSON.stringify({ auth: { type: "oauth-personal" } }));
  assertGoogleProfile(home);
  writeFileSync(join(home, ".gemini/GEMINI.md"), "Unapproved global context");
  assert.throws(() => assertGoogleProfile(home), /Unmanaged Google context/);
});
test("non-TUI modes never install UI components or timers even when hasUI is true", () => {
  const { store } = fixture();
  const ui = new HarnessUI(store, () => false, () => true);
  ui.attach({ mode: "rpc", hasUI: true, ui: new Proxy({}, { get() { throw new Error("TUI method called in RPC"); } }) } as any);
  ui.start(); assert.equal(ui.animating, false); ui.settled(); assert.equal(ui.animating, false); ui.dispose();
});
test("motion off and shutdown dispose the TUI timer; rendering fits narrow Korean terminals", () => {
  const { store, root } = fixture(); const components: any[] = [];
  const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
  const ui = new HarnessUI(store, () => false, () => true, join(root, "ui.json"));
  const ctx: any = { mode: "tui", hasUI: true, model: { id: "모델" }, getContextUsage: () => ({ percent: 42 }), ui: {
    setWorkingIndicator() {}, setWorkingVisible() {}, setTitle() {},
    setHeader(factory: any) { components.push(factory({}, theme)); },
    setFooter(factory: any) { components.push(factory({ requestRender() {} }, theme, { onBranchChange: () => () => {}, getExtensionStatuses: () => new Map() })); },
  } };
  ui.attach(ctx); ui.start(); assert.equal(ui.animating, true);
  for (const component of components) assert.ok(component.render(30).every((line: string) => !line.includes("�")));
  ui.setMotion("off"); assert.equal(ui.animating, false); ui.start(); assert.equal(ui.animating, false);
  ui.setMotion("full"); assert.equal(ui.animating, true); ui.dispose(); assert.equal(ui.animating, false);
});
