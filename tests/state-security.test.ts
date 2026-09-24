import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireProjectLock, projectId, TaskStore } from "../src/state.js";
import { assertManagedProject, assertPrivateAuthStore, assertRoute, classifyFailure, confinedPath, subscriptionEnv } from "../src/security.js";

test("subscription environment strips keys and gateways without modifying the parent", () => {
  const env = { OPENAI_API_KEY: "secret", ANTHROPIC_BASE_URL: "https://gateway.invalid", GOOGLE_APPLICATION_CREDENTIALS: "/secret", PATH: "/bin", TERM: "xterm" };
  assert.deepEqual(subscriptionEnv(env), { PATH: "/bin", TERM: "xterm" }); assert.equal(env.OPENAI_API_KEY, "secret");
  assert.throws(() => assertRoute({ provider: "openai" }));
  assert.throws(() => assertRoute({ provider: "openai-codex", api: "openai-responses" }));
  assert.throws(() => assertRoute({ provider: "openai-codex", api: "openai-codex-responses", baseUrl: "https://other.invalid" }));
});
test("API-key stores and project overrides fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-auth-")); const file = join(dir, "auth.json");
  writeFileSync(file, JSON.stringify({ "openai-codex": { type: "api_key", key: "not-a-real-key" } }));
  assert.throws(() => assertPrivateAuthStore(file));
  writeFileSync(file, JSON.stringify({ "openai-codex": { type: "oauth" } })); assertPrivateAuthStore(file);
  mkdirSync(join(dir, ".claude")); writeFileSync(join(dir, ".claude/settings.json"), "{}"); assert.throws(() => assertManagedProject(dir));
});
test("file tools reject traversal, secret paths and symlink escapes", () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-fs-"));
  symlinkSync(tmpdir(), join(dir, "escape"));
  assert.throws(() => confinedPath(dir, "../secret"));
  assert.throws(() => confinedPath(dir, "escape/file"));
  assert.throws(() => confinedPath(dir, ".env"));
  assert.equal(confinedPath(dir, "outputs/new/file.txt"), join(dir, "outputs/new/file.txt"));
});
test("interrupted operations require observed reconciliation, without replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-state-")); const project = join(dir, "project"); mkdirSync(project);
  const store = new TaskStore(project, dir); store.task.goal = "Inspect synthetic cohort"; store.beginOperation("run-1", "analysis");
  const resumed = new TaskStore(project, dir); resumed.recoverInterrupted();
  assert.equal(resumed.task.status, "needs_reconciliation"); assert.equal(resumed.task.operations[0]?.status, "unknown");
  assert.throws(() => resumed.assertSwitchable());
  resumed.endOperation("run-1", { status: "failed" }, "Late event must not resolve uncertainty");
  assert.throws(() => resumed.assertSwitchable());
  resumed.reconcile("run-1", false, "Output inspected; exit 0"); resumed.assertSwitchable();
  const old = resumed.task.id; resumed.newTask("Review figure"); assert.notEqual(resumed.task.id, old);
  assert.equal(JSON.parse(readFileSync(join(resumed.dir, "archive", `${old}.json`), "utf8")).goal, "Inspect synthetic cohort");
});
test("single writer lock excludes concurrent launch and releases cleanly", () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-lock-"));
  const release = acquireProjectLock(dir, dir); assert.throws(() => acquireProjectLock(dir, dir), /active harness writer/); release(); acquireProjectLock(dir, dir)();
});
test("an orphaned live worker still holds the project lease after its launcher dies", () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-orphan-")); const release = acquireProjectLock(dir, dir);
  release.track(process.pid);
  const file = join(dir, "locks", projectId(dir) + ".lock"); const owner = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...owner, pid: 2147483647 }));
  assert.throws(() => acquireProjectLock(dir, dir), /active harness writer/); release();
});
test("rate limits and auth failures are classified only as errors", () => {
  for (const text of ["429 too many requests", "RESOURCE_EXHAUSTED", "usage limit reached", "quota_exceeded"]) assert.equal(classifyFailure(text), "rate_limit");
  assert.equal(classifyFailure("401 Unauthorized"), "authentication"); assert.equal(classifyFailure("File not found"), "other");
});
test("usage deduplication and bounded handoff preserve full local outputs", () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-usage-")); const store = new TaskStore(dir, dir);
  const row = { id: "response-1", provider: "gemini-cli-acp", model: "default", kind: "unknown" as const };
  store.usage(row); store.usage(row); assert.equal(readFileSync(join(store.dir, "usage.jsonl"), "utf8").trim().split("\n").length, 1);
  store.beginOperation("1", "analysis"); store.endOperation("1", { status: "failed" }, "Warning: convergence failed\n" + "x".repeat(20000));
  assert.ok(store.checkpoint().length < 16000); assert.match(readFileSync(join(store.dir, "events.jsonl"), "utf8"), /convergence failed/);
});
