import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privateDir } from "./paths.js";

export const RESULT_BYTES = 8 * 1024;
export const HANDOFF_BYTES = 16 * 1024;
export const INSTRUCTION_BYTES = 8 * 1024;
export function utf8Prefix(text: string, bytes: number): string {
  const data = Buffer.from(text); let end = Math.max(0, Math.min(bytes, data.length));
  while (end < data.length && end > 0 && (data[end]! & 0xc0) === 0x80) end--;
  return data.subarray(0, end).toString("utf8");
}
export function excerpt(text: string, bytes: number): string {
  return Buffer.byteLength(text) <= bytes ? text : utf8Prefix(text, bytes - 32) + "\n[Excerpt; retrieve artifact]";
}
function artifactDir(dir: string, taskId: string): string {
  if (!/^[a-f0-9-]{36}$/.test(taskId)) throw new Error("Invalid task ID.");
  return join(dir, "artifacts", taskId);
}
export function saveArtifact(dir: string, taskId: string, text: string): string {
  const id = createHash("sha256").update(text).digest("hex");
  const path = join(privateDir(artifactDir(dir, taskId)), `${id}.txt`);
  try { writeFileSync(path, text, { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return id;
}
export function readArtifact(dir: string, taskId: string, id: string, offset = 0, limit = RESULT_BYTES) {
  if (!/^[a-f0-9]{64}$/.test(id) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 4 || limit > HANDOFF_BYTES) throw new Error("Invalid artifact ID, byte offset or limit (4..16384).");
  const path = join(artifactDir(dir, taskId), `${id}.txt`);
  if (!existsSync(path)) throw new Error("Artifact is not available for this task.");
  const fd = openSync(path, "r");
  try {
    const total = fstatSync(fd).size;
    if (offset > total) throw new Error("Offset exceeds artifact length.");
    const data = Buffer.alloc(Math.min(limit + 4, total - offset));
    const size = readSync(fd, data, 0, data.length, offset);
    let start = 0; while (start < size && (data[start]! & 0xc0) === 0x80) start++;
    let end = Math.min(start + limit, size);
    // Cut bytes before decoding: a partial trailing code point must not become
    // a replacement character or make the next byte offset skip original data.
    while (end < size && end > start && (data[end]! & 0xc0) === 0x80) end--;
    const text = data.subarray(start, end).toString("utf8");
    const nextOffset = offset + end;
    return { artifact_id: id, offset, nextOffset, totalBytes: total, eof: nextOffset >= total, text };
  } finally { closeSync(fd); }
}
// Heuristic signals, not a claim that every warning or scientific error is detected.
export function detectWarnings(text: string): string[] {
  const warnings = new Set<string>();
  for (const match of text.matchAll(/\b(?:warn(?:ing)?s?|error|failed|failure|non[- ]?convergence|did not converge|singular|duplicate rows?|missing values?)\b|경고|수렴\s*실패|오류/gi)) {
    const at = match.index!;
    const begin = Math.max(text.lastIndexOf("\n", at) + 1, at - 80);
    const end = text.indexOf("\n", at);
    warnings.add(excerpt(text.slice(begin, end < 0 ? at + 360 : Math.min(end, at + 360)).trim(), 480));
  }
  return [...warnings];
}
export function resultEnvelope(text: string, id: string, failed: boolean, warnings = detectWarnings(text)): string {
  const heading = `Status: ${failed ? "failed" : "completed"}\nWarnings detected: ${warnings.length}\nFull result: read_task_artifact(artifact_id="${id}")\n`;
  const warningText = excerpt(warnings.join("\n"), 2200);
  const prefix = heading + (warningText ? `Warning excerpts (heuristic):\n${warningText}\n` : "") + "Result excerpt:\n";
  const budget = RESULT_BYTES - Buffer.byteLength(prefix);
  if (Buffer.byteLength(text) <= budget) return prefix + text;
  const marker = "\n[Middle omitted; retrieve artifact]\n";
  const headBytes = Math.floor((budget - Buffer.byteLength(marker)) / 2);
  const tailBytes = budget - Buffer.byteLength(marker) - headBytes;
  const bytes = Buffer.from(text); let start = Math.max(0, bytes.length - tailBytes);
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  return prefix + utf8Prefix(text, headBytes) + marker + bytes.subarray(start).toString("utf8");
}
