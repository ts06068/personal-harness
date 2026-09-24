import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { privateDir, stateRoot } from "./paths.js";
import { withinRoot, type Provider } from "./security.js";
import { detectWarnings, excerpt, HANDOFF_BYTES, saveArtifact } from "./artifacts.js";

export type Status = "idle" | "running" | "paused" | "rate_limited" | "needs_reconciliation" | "complete";
export interface Operation {
  id: string; tool: string; startedAt: string; status: "running" | "completed" | "failed" | "unknown";
  summary?: string; artifactId?: string; warnings?: string[]; exitCode?: number;
  reconciliation?: { at: string; note: string }[]; warningsResolved?: { at: string; note: string };
}
export interface Snapshot { at: string; head: string | null; status: string; diffStat: string }
export interface Usage { id: string; provider: string; model: string; kind: "reported" | "estimated" | "unknown"; input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
export interface Task {
  version: 2; id: string; project: string; goal: string; status: Status;
  createdAt: string; updatedAt: string; provider?: Provider; model?: string;
  decisions: string[]; nextSteps: string[]; inputs: string[];
  operations: Operation[]; sessions: { provider: string; model: string; path?: string; at: string }[];
  baseline: Snapshot; snapshot: Snapshot; lastResult?: string; error?: string;
  nextSegment?: { provider: Provider; model: string; review: boolean };
  validations: string[];
  references?: { state: string; warnings: string };
  observedModel?: string;
  contextGauge?: { used: number; size: number };
}

export function atomicJson(path: string, value: unknown): void {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

function git(project: string, args: string[]): string {
  try { return execFileSync("git", ["-C", project, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, maxBuffer: 1024 * 1024 }).trim(); }
  catch { return ""; }
}

export function snapshot(project: string): Snapshot {
  return {
    at: new Date().toISOString(), head: git(project, ["rev-parse", "HEAD"]) || null,
    status: git(project, ["status", "--short"]),
    diffStat: git(project, ["diff", "--stat", "HEAD"]) || git(project, ["diff", "--stat"]),
  };
}

export function projectId(project: string): string { return createHash("sha256").update(project).digest("hex").slice(0, 16); }

export class TaskStore {
  readonly dir: string;
  readonly file: string;
  task: Task;
  constructor(readonly project: string, readonly root = stateRoot) {
    this.dir = privateDir(join(root, "projects", projectId(project)));
    this.file = join(this.dir, "task.json");
    if (existsSync(this.file)) {
      this.task = JSON.parse(readFileSync(this.file, "utf8")) as Task;
      if (this.task.project !== project || ![1, 2].includes(this.task.version)) throw new Error("Incompatible task state.");
      if (Number(this.task.version) === 1) {
        const backup = join(this.dir, `task-v1-${this.task.id}.json`);
        if (!existsSync(backup)) writeFileSync(backup, readFileSync(this.file), { flag: "wx", mode: 0o600 });
        const outputs = new Map<string, string>();
        const events = join(this.dir, "events.jsonl");
        if (existsSync(events)) for (const line of readFileSync(events, "utf8").split("\n").filter(Boolean)) {
          try { const row = JSON.parse(line); if (row.taskId === this.task.id && row.type === "operation_end" && typeof row.data?.summary === "string") {
            const old = outputs.get(row.data.id); if (!old || old.length < row.data.summary.length) outputs.set(row.data.id, row.data.summary);
          } } catch { /* retain damaged legacy journal for inspection */ }
        }
        for (const op of this.task.operations) {
          const text = outputs.get(op.id) || op.summary;
          if (text) { op.artifactId = this.artifact(text); op.warnings = detectWarnings(text); op.summary = excerpt(text, 2000); }
        }
        this.task.version = 2; this.task.validations = []; this.save();
      }
    } else {
      const now = new Date().toISOString();
      const baseline = snapshot(project);
      this.task = { version: 2, id: randomUUID(), project, goal: "", status: "idle", createdAt: now, updatedAt: now, decisions: [], nextSteps: [], inputs: [], operations: [], sessions: [], validations: [], baseline, snapshot: baseline };
      this.save();
    }
  }
  save(): void { this.task.updatedAt = new Date().toISOString(); atomicJson(this.file, this.task); }
  newTask(goal: string): void {
    this.assertSwitchable();
    const archives = privateDir(join(this.dir, "archive"));
    atomicJson(join(archives, `${this.task.id}.json`), this.task);
    const now = new Date().toISOString(); const baseline = snapshot(this.project);
    this.task = { version: 2, id: randomUUID(), project: this.project, goal, status: "idle", createdAt: now, updatedAt: now, decisions: [], nextSteps: [], inputs: [], operations: [], sessions: [], validations: [], baseline, snapshot: baseline };
    this.checkpoint();
  }
  event(type: string, data: unknown): void {
    appendFileSync(join(this.dir, "events.jsonl"), JSON.stringify({ at: new Date().toISOString(), taskId: this.task.id, type, data }) + "\n", { mode: 0o600 });
  }
  checkpoint(status?: Status): string {
    this.task.snapshot = snapshot(this.project);
    if (status) this.task.status = status;
    const { references: _refs, ...state } = this.task;
    this.task.references = {
      state: this.artifact(JSON.stringify(state, null, 2)),
      warnings: this.artifact(JSON.stringify(this.openWarnings(), null, 2)),
    };
    this.save();
    const text = renderHandoff(this.task);
    writeFileSync(join(this.dir, "handoff.md"), text, { mode: 0o600 });
    return text;
  }
  artifact(text: string): string { return saveArtifact(this.dir, this.task.id, text); }
  openWarnings(): { operation: string; artifactId?: string; warnings: string[] }[] {
    return this.task.operations.filter(op => op.warnings?.length && !op.warningsResolved).map(op => ({ operation: op.id, artifactId: op.artifactId, warnings: op.warnings! }));
  }
  beginOperation(id: string, tool: string, summary?: string): void {
    if (this.task.operations.some(op => op.id === id)) return;
    this.task.operations.push({ id, tool, summary, startedAt: new Date().toISOString(), status: "running" });
    this.save(); this.event("operation_start", { id, tool, summary });
  }
  endOperation(id: string, failed = false, summary?: string, exitCode?: number): void {
    const operation = this.task.operations.find(op => op.id === id);
    if (operation) {
      operation.status = failed ? "failed" : "completed";
      if (summary !== undefined) {
        operation.artifactId = this.artifact(summary); operation.summary = excerpt(summary, 2000);
        operation.warnings = [...new Set([...(operation.warnings || []), ...detectWarnings(summary)])];
      }
      if (exitCode !== undefined) operation.exitCode = exitCode;
    }
    this.save(); this.event("operation_end", { id, failed, summary });
  }
  reconcile(id: string, failed: boolean, note: string): void {
    const op = this.task.operations.find(item => item.id === id);
    if (!op || !note.trim()) throw new Error("An operation and observed result are required.");
    op.status = failed ? "failed" : "completed";
    (op.reconciliation ||= []).push({ at: new Date().toISOString(), note });
    if (!this.unresolved().length) this.task.status = "paused";
    this.save(); this.event("operation_reconciled", { id, failed, note });
  }
  unresolved(): Operation[] { return this.task.operations.filter(op => op.status === "running" || op.status === "unknown"); }
  recoverInterrupted(): void {
    for (const operation of this.task.operations) if (operation.status === "running") operation.status = "unknown";
    if (this.unresolved().length) this.task.status = "needs_reconciliation";
    else if (this.task.status === "running") this.task.status = "paused";
    this.checkpoint();
  }
  assertSwitchable(): void {
    if (this.unresolved().length) throw new Error("Unresolved operations remain. Inspect them with /task; record their outcome with ph reconcile before switching.");
  }
  usage(entry: Usage): void {
    const path = join(this.dir, "usage.jsonl");
    const previous = existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Usage) : [];
    if (previous.some(row => row.id === entry.id)) return;
    appendFileSync(path, JSON.stringify({ ...entry, taskId: this.task.id, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
  }
}

export function renderHandoff(task: Task): string {
  const pending = task.operations.filter(op => ["running", "unknown"].includes(op.status));
  const warnings = task.operations.filter(op => op.warnings?.length && !op.warningsResolved);
  const warningCount = warnings.reduce((sum, op) => sum + op.warnings!.length, 0);
  const section = (name: string, text: string, bytes: number) => `\n## ${name}\n${excerpt(text || "None recorded.", bytes)}\n`;
  const recent = task.operations.slice(-8).map(op => `${op.id} [${op.status}] ${op.tool}; exit=${op.exitCode ?? "unknown"}; result=${op.artifactId ?? "unavailable"}\n${excerpt(op.summary || "", 440)}`).join("\n");
  const text = [
    "# Task handoff", `Task: ${task.id}`, `Project: ${excerpt(task.project, 600)}`, `Status: ${task.status}`,
    `Full state: ${task.references?.state || "unavailable"}; complete open-warning index: ${task.references?.warnings || "unavailable"}`,
    "Read referenced content with read_task_artifact. Excerpts are NOT the full record. Retrieve omitted warnings before concluding a review.",
    `Unresolved operations: ${pending.length}; open warning signals: ${warningCount} across ${warnings.length} operations (heuristic).`,
    section("Unresolved operations", pending.map(op => `${op.id}: ${op.tool} [${op.status}]`).join("\n"), 900),
    section("Open warnings, including older operations", warnings.map(op => `${op.id} (${op.artifactId || "original unavailable"}):\n${op.warnings!.join("\n")}`).join("\n"), 3000),
    section("Goal", task.goal || "Awaiting user request.", 1300),
    section(`Approved decisions (${task.decisions.length})`, task.decisions.join("\n"), 1800),
    section("Next steps", task.nextSteps.join("\n"), 1000),
    section("Validation records (user-confirmed, not independently proved)", (task.validations || []).join("\n"), 900),
    section("Selected inputs", task.inputs.join("\n"), 600),
    section("Existing changes at task start", task.baseline.status, 600),
    section("Current Git state", task.snapshot.status + "\n" + task.snapshot.diffStat, 900),
    section("Recent operations", recent, 1800),
    section("Last response (possibly partial)", task.lastResult || "", 1100),
    section("Error / uncertainty", task.error || "", 400),
    "Do not replay completed commands. Unknown operations require observed reconciliation. Use propose_checkpoint for decisions, validation and next steps; only the user can approve it.",
  ].join("\n");
  return excerpt(text, HANDOFF_BYTES);
}

export type ProjectLease = (() => void) & { track: (pid: number) => void };
export function acquireProjectLock(project: string, root = stateRoot): ProjectLease {
  const locks = privateDir(join(root, "locks"));
  project = realpathSync(project);
  const scope = git(project, ["rev-parse", "--show-toplevel"]) || project;
  const path = join(locks, projectId(scope) + ".lock");
  const token = randomUUID();
  const mutex = join(locks, ".registry");
  const alive = (pid: number) => { if (!Number.isSafeInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
  const enter = () => {
    try { mkdirSync(mutex); writeFileSync(join(mutex, "owner"), String(process.pid), { mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = join(mutex, "owner");
      if (existsSync(owner) ? !alive(Number(readFileSync(owner, "utf8"))) : Date.now() - statSync(mutex).mtimeMs > 60_000) throw new Error(`Interrupted registry operation: inspect ${mutex} before removing this stale registry mutex. Writer leases remain intact.`);
      throw new Error("Another project lock operation is in progress; retry.");
    }
  };
  enter();
  try {
    for (const name of readdirSync(locks).filter(name => name.endsWith(".lock"))) {
      const file = join(locks, name);
      let owner: { pid: number; token: string; children?: number[]; project: string; scope?: string };
      try { owner = JSON.parse(readFileSync(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw new Error(`Unrecognized project lock: ${name}`); }
      const livePid = [owner.pid, ...(owner.children || [])].find(alive);
      if (!livePid) { renameSync(file, `${file}.stale-${owner.token}`); continue; }
      const occupied = owner.scope || (git(owner.project, ["rev-parse", "--show-toplevel"]) || owner.project);
      if (withinRoot(scope, occupied) || withinRoot(occupied, scope)) throw new Error(`Project already has an active harness writer (PID ${livePid}) in an overlapping workspace.`);
    }
    const fd = openSync(path, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, token, project, scope })); } finally { closeSync(fd); }
  } finally { rmSync(mutex, { recursive: true }); }
  const release = () => {
    if (existsSync(path) && (JSON.parse(readFileSync(path, "utf8")) as { token: string }).token === token) rmSync(path);
  };
  return Object.assign(release, { track(pid: number) {
    const owner = JSON.parse(readFileSync(path, "utf8"));
    if (owner.token !== token) throw new Error("Project lease changed before child launch.");
    atomicJson(path, { ...owner, children: [...(owner.children || []), pid] });
  } });
}
