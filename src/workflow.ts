import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { atomicJson, type Task, type TaskStore } from "./state.js";
import { confinedPath, withinRoot } from "./security.js";
import { excerpt, INSTRUCTION_BYTES } from "./artifacts.js";
import { privateDir } from "./paths.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const BASE_RULES = "Inspect the existing implementation before changing it. Prefer minimal changes and explain new dependencies. Separate proposed decisions from user-approved decisions. Report observed validation and uncertainty accurately. Do not infer successful execution from prepared code. Use propose_checkpoint to propose durable decisions, validations and next steps; never claim that a proposal is approved.";
type Approval = { path: string; hash: string; content: string; native: boolean; approvedAt: string; dependencies: { path: string; hash: string }[] };
export class Instructions {
  readonly file: string;
  constructor(readonly project: string, readonly dir: string, readonly googleHome?: string) { this.file = join(dir, "instructions.json"); }
  entries(): Approval[] { return existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : []; }
  private nativeName(path: string): boolean { return /(?:^|\/)(?:GEMINI|PH_GEMINI_CONTEXT)\.md$/.test(path); }
  private checkPath(path: string): string {
    const globals = [join(homedir(), ".gemini/GEMINI.md"), ...(this.googleHome ? [join(this.googleHome, ".gemini/GEMINI.md")] : [])];
    if (globals.includes(path)) { if (realpathSync(path) !== path) throw new Error("Global instruction symlinks are not supported."); return path; }
    return confinedPath(this.project, path);
  }
  preview(requested: string): Approval {
    const path = this.checkPath(resolve(this.project, requested));
    const native = this.nativeName(path);
    const dependencies: { path: string; hash: string }[] = [];
    const visiting = new Set<string>();
    const read = (file: string): string => {
      file = this.checkPath(file);
      if (visiting.has(file)) throw new Error("Cyclic instruction import.");
      if (dependencies.length >= 64) throw new Error("Too many instruction imports.");
      visiting.add(file);
      const content = readFileSync(file, "utf8");
      if (Buffer.byteLength(content) > INSTRUCTION_BYTES) throw new Error("Instruction exceeds 8 KiB. Select a smaller instruction file.");
      dependencies.push({ path: file, hash: hash(content) });
      let expanded = content;
      const code = [...content.matchAll(/(`+)[\s\S]*?\1/g)].map(match => [match.index!, match.index! + match[0].length]);
      if (native) expanded = content.replace(/(^|[ \t\r\n])@([./A-Za-z][^\s]*)/g, (match, prefix: string, name: string, offset: number) => {
        if (code.some(([start, end]) => offset + prefix.length >= start! && offset + prefix.length < end!)) return match;
        const imported = resolve(dirname(file), name);
        if (!withinRoot(this.project, imported)) throw new Error("Instruction imports must remain in this project.");
        return `${match}\n${read(imported)}`;
      });
      visiting.delete(file); return expanded;
    };
    const content = read(path);
    return { path, hash: hash(content), content, native, approvedAt: new Date().toISOString(), dependencies };
  }
  approve(value: Approval): void {
    const current = this.preview(value.path);
    if (current.hash !== value.hash) throw new Error("Instruction changed during preview. Review it again.");
    const entries = [...this.entries().filter(entry => entry.path !== value.path), current];
    // Count headers, base rules and native files too, although native files are not injected twice.
    const total = BASE_RULES + entries.map(entry => `\nApproved project instructions: ${entry.path}\n${entry.content}`).join("\n");
    if (Buffer.byteLength(total) > INSTRUCTION_BYTES) throw new Error("Approved instructions exceed the 8 KiB budget. Remove an entry or approve a smaller file.");
    atomicJson(this.file, entries);
  }
  remove(path?: string): void { atomicJson(this.file, path ? this.entries().filter(entry => entry.path !== resolve(this.project, path)) : []); }
  assertCurrent(): void {
    for (const entry of this.entries()) {
      try { if (this.preview(entry.path).hash !== entry.hash) throw new Error("changed"); }
      catch { throw new Error(`Approved instructions changed or became unavailable: ${entry.path}. Use /instructions to review again.`); }
    }
  }
  packet(gemini = false): string {
    this.assertCurrent();
    const text = BASE_RULES + this.entries().filter(entry => !gemini || !entry.native).map(entry => `\nApproved project instructions: ${entry.path}\n${entry.content}`).join("\n");
    if (Buffer.byteLength(text) > INSTRUCTION_BYTES) throw new Error("Instruction budget exceeded.");
    return text;
  }
  nativeCandidates(accessed?: string): string[] {
    const paths = new Set<string>();
    const add = (dir: string) => { for (const name of ["GEMINI.md", "PH_GEMINI_CONTEXT.md"]) paths.add(join(dir, name)); };
    add(join(homedir(), ".gemini")); if (this.googleHome) add(join(this.googleHome, ".gemini"));
    add(this.project);
    let directory = accessed ? resolve(this.project, accessed) : this.project;
    // A file path is harmless here: checking file/GEMINI.md simply finds nothing.
    while (withinRoot(this.project, directory)) { add(directory); if (directory === this.project) break; directory = dirname(directory); }
    return [...paths].filter(path => existsSync(path));
  }
  assertNative(accessed?: string): void {
    this.assertCurrent();
    const approved = new Set(this.entries().filter(entry => entry.native).map(entry => entry.path));
    for (const file of this.nativeCandidates(accessed)) if (!approved.has(file)) throw new Error(`Gemini would load unapproved instructions: ${file}. Review with /instructions before continuing.`);
  }
  recordNativePath(path: string): void {
    const resolved = resolve(this.project, path);
    if (!withinRoot(this.project, resolved)) throw new Error("Native context path escapes project.");
    appendFileSync(join(this.dir, "native-paths.jsonl"), JSON.stringify(resolved) + "\n", { mode: 0o600 });
  }
  assertNativeHistory(): void {
    this.assertNative();
    const file = join(this.dir, "native-paths.jsonl");
    if (existsSync(file)) for (const path of new Set(readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as string))) this.assertNative(path);
  }
}

export type CheckpointProposal = { decisions: string[]; nextSteps: string[]; validations: string[] };
export type StagedCheckpoint = CheckpointProposal & { id: string; taskId: string; base: string; at: string };
const revision = (task: Task) => hash(JSON.stringify([task.goal, task.decisions, task.nextSteps, task.validations]));
export function validateProposal(value: unknown): CheckpointProposal {
  if (!value || typeof value !== "object") throw new Error("Checkpoint must be an object.");
  const proposal = value as CheckpointProposal;
  for (const key of ["decisions", "nextSteps", "validations"] as const) {
    if (!Array.isArray(proposal[key]) || proposal[key].length > 30 || proposal[key].some(text => typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > 8000)) throw new Error(`Invalid ${key}: at most 30 nonempty strings, each <= 8 KiB.`);
  }
  if (Buffer.byteLength(JSON.stringify(proposal)) > 32 * 1024) throw new Error("Checkpoint proposal exceeds 32 KiB.");
  return { decisions: proposal.decisions, nextSteps: proposal.nextSteps, validations: proposal.validations };
}
export function stageCheckpoint(dir: string, task: Task, value: unknown): string {
  const proposal: StagedCheckpoint = { ...validateProposal(value), id: randomUUID(), taskId: task.id, base: revision(task), at: new Date().toISOString() };
  atomicJson(join(privateDir(join(dir, "proposals")), `${proposal.id}.json`), proposal);
  return proposal.id;
}
export function pendingCheckpoints(dir: string, taskId: string): StagedCheckpoint[] {
  const root = join(dir, "proposals"); if (!existsSync(root)) return [];
  return readdirSync(root).filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).map(file => JSON.parse(readFileSync(join(root, file), "utf8")) as StagedCheckpoint).filter(p => p.taskId === taskId).sort((a, b) => a.at.localeCompare(b.at));
}
export function decideCheckpoint(store: TaskStore, proposal: StagedCheckpoint, accept: boolean, edited?: unknown): void {
  if (proposal.taskId !== store.task.id) throw new Error("Checkpoint belongs to another task.");
  if (accept) {
    if (proposal.base !== revision(store.task)) throw new Error("Task decisions changed after this proposal. Reject it and request a fresh proposal.");
    const change = validateProposal(edited || proposal);
    store.task.decisions = [...new Set([...store.task.decisions, ...change.decisions])];
    store.task.nextSteps = change.nextSteps;
    store.task.validations = [...new Set([...store.task.validations, ...change.validations])];
    store.checkpoint();
  }
  store.event(accept ? "checkpoint_approved" : "checkpoint_rejected", { ...proposal, edited });
  rmSync(join(store.dir, "proposals", `${proposal.id}.json`));
}
export function usageReport(store: TaskStore): string {
  const path = join(store.dir, "usage.jsonl");
  const rows: Record<string, unknown>[] = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  const taskRows = rows.filter(row => row.taskId === store.task.id);
  const totals = ["input", "output", "cacheRead", "cacheWrite"].map(key => {
    const values = taskRows.map(row => row[key]).filter((value): value is number => typeof value === "number");
    return `${key}: ${values.length ? values.reduce((a, b) => a + b, 0) : "unknown"}${values.length && values.length < taskRows.length ? " (partially reported)" : ""}`;
  });
  const reads = store.task.operations.filter(op => /read|grep|find|search/i.test(op.tool)).length;
  return [`Task ${store.task.id}`, `Provider responses: ${taskRows.length} (not internal SDK request count)`, ...totals,
    `Read/search operations: ${reads}; failed operations: ${store.task.operations.filter(op => op.status === "failed").length}`,
    `Accepted validation records: ${store.task.validations.length}; open warning operations: ${store.openWarnings().length}`,
    `Observed model: ${store.task.provider === "gemini-cli-acp" ? store.task.observedModel || "unknown (cli-default is a route alias)" : store.task.model || "unknown"}`,
    "Account quota, charges and internal retries: unknown unless separately reported. Legacy usage without a task ID is excluded.",
  ].join("\n");
}
