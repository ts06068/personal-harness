import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { privateDir, stateRoot } from "./paths.js";
import type { Provider } from "./security.js";

export type Status = "idle" | "running" | "paused" | "rate_limited" | "needs_reconciliation" | "complete";
export interface Operation { id: string; tool: string; startedAt: string; status: "running" | "completed" | "failed" | "unknown"; summary?: string }
export interface Snapshot { at: string; head: string | null; status: string; diffStat: string }
export interface Usage { id: string; provider: string; model: string; kind: "reported" | "estimated" | "unknown"; input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
export interface Task {
  version: 1; id: string; project: string; goal: string; status: Status;
  createdAt: string; updatedAt: string; provider?: Provider; model?: string;
  decisions: string[]; nextSteps: string[]; inputs: string[];
  operations: Operation[]; sessions: { provider: string; model: string; path?: string; at: string }[];
  baseline: Snapshot; snapshot: Snapshot; lastResult?: string; error?: string;
  nextSegment?: { provider: Provider; model: string; review: boolean };
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
      if (this.task.project !== project || this.task.version !== 1) throw new Error("Incompatible task state.");
    } else {
      const now = new Date().toISOString();
      const baseline = snapshot(project);
      this.task = { version: 1, id: randomUUID(), project, goal: "", status: "idle", createdAt: now, updatedAt: now, decisions: [], nextSteps: [], inputs: [], operations: [], sessions: [], baseline, snapshot: baseline };
      this.save();
    }
  }
  save(): void { this.task.updatedAt = new Date().toISOString(); atomicJson(this.file, this.task); }
  newTask(goal: string): void {
    this.assertSwitchable();
    const archives = privateDir(join(this.dir, "archive"));
    atomicJson(join(archives, `${this.task.id}.json`), this.task);
    const now = new Date().toISOString(); const baseline = snapshot(this.project);
    this.task = { version: 1, id: randomUUID(), project: this.project, goal, status: "idle", createdAt: now, updatedAt: now, decisions: [], nextSteps: [], inputs: [], operations: [], sessions: [], baseline, snapshot: baseline };
    this.checkpoint();
  }
  event(type: string, data: unknown): void {
    appendFileSync(join(this.dir, "events.jsonl"), JSON.stringify({ at: new Date().toISOString(), taskId: this.task.id, type, data }) + "\n", { mode: 0o600 });
  }
  checkpoint(status?: Status): string {
    this.task.snapshot = snapshot(this.project);
    if (status) this.task.status = status;
    this.save();
    const text = renderHandoff(this.task);
    writeFileSync(join(this.dir, "handoff.md"), text, { mode: 0o600 });
    return text;
  }
  beginOperation(id: string, tool: string, summary?: string): void {
    if (this.task.operations.some(op => op.id === id)) return;
    this.task.operations.push({ id, tool, summary, startedAt: new Date().toISOString(), status: "running" });
    this.save(); this.event("operation_start", { id, tool, summary });
  }
  endOperation(id: string, failed = false, summary?: string): void {
    const operation = this.task.operations.find(op => op.id === id);
    if (operation) { operation.status = failed ? "failed" : "completed"; if (summary) operation.summary = summary.slice(0, 12000); }
    this.save(); this.event("operation_end", { id, failed, summary });
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
    appendFileSync(path, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
  }
}

export function renderHandoff(task: Task): string {
  const recent = task.operations.slice(-8).map(op => {
    const summary = op.summary || "No result recorded";
    const excerpt = summary.length <= 1500 ? summary : `${summary.slice(0, 650)}\n[Excerpt only; full output is in the task events.jsonl]\n${summary.slice(-650)}`;
    return `- ${op.id} [${op.status}] ${op.tool}: ${excerpt}`;
  }).join("\n");
  return [
    "# Task handoff", `Task: ${task.id}`, `Project: ${task.project}`, `Status: ${task.status}`,
    "", "## Goal", task.goal || "Awaiting user request.",
    "", "## Decisions", task.decisions.map(x => `- ${x}`).join("\n") || "No decisions recorded.",
    "", "## Next steps", task.nextSteps.map(x => `- ${x}`).join("\n") || "Ask the user for the next action if it is unclear.",
    "", "## Selected input files", task.inputs.join("\n") || "None selected.",
    "", "## Existing changes at task start", task.baseline.status || "No Git changes reported (or not a Git repository).",
    "", "## Current Git state", task.snapshot.status || "No Git changes reported (or not a Git repository).", task.snapshot.diffStat,
    "", "## Recent operations", recent || "No recorded operations.",
    "", "## Last assistant response (check status; it may be partial)", (task.lastResult || "None.").slice(0, 10000),
    "", "## Error / uncertainty", task.error || "None recorded.",
    "", "Continue from observed files and results. Do not repeat completed commands. An unknown operation requires reconciliation, not a retry.", "",
  ].join("\n");
}

export type ProjectLease = (() => void) & { track: (pid: number) => void };
export function acquireProjectLock(project: string, root = stateRoot): ProjectLease {
  const locks = privateDir(join(root, "locks"));
  const path = join(locks, projectId(project) + ".lock");
  const token = randomUUID();
  try {
    const fd = openSync(path, "wx", 0o600);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, token, project })); closeSync(fd);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const owner = JSON.parse(readFileSync(path, "utf8")) as { pid: number; token: string; children?: number[] };
    const livePid = [owner.pid, ...(owner.children || [])].find(pid => {
      try { process.kill(pid, 0); return true; } catch (cause) { return (cause as NodeJS.ErrnoException).code !== "ESRCH"; }
    });
    if (livePid) throw new Error(`Project already has an active harness writer (PID ${livePid}).`);
    // A stale lock is retained for diagnosis; the atomic rename wins or fails.
    const recovery = `${path}.recovery`;
    try { mkdirSync(recovery); } catch { throw new Error("Another process is recovering this project lock. Try again after it finishes."); }
    try {
      const latest = JSON.parse(readFileSync(path, "utf8")) as { token: string };
      if (latest.token !== owner.token) throw new Error("Project lock changed during recovery. Try again.");
      renameSync(path, `${path}.stale-${owner.token}`);
    } finally { rmSync(recovery, { recursive: true }); }
    return acquireProjectLock(project, root);
  }
  const release = () => {
    if (existsSync(path) && (JSON.parse(readFileSync(path, "utf8")) as { token: string }).token === token) rmSync(path);
  };
  return Object.assign(release, { track(pid: number) {
    const owner = JSON.parse(readFileSync(path, "utf8"));
    if (owner.token !== token) throw new Error("Project lease changed before child launch.");
    atomicJson(path, { ...owner, children: [...(owner.children || []), pid] });
  } });
}
