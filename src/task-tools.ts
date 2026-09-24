import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "./state.js";
import { readArtifact } from "./artifacts.js";
import { stageCheckpoint } from "./workflow.js";

export const artifactParams = Type.Object({
  artifact_id: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 4, maximum: 16384 })),
});
const strings = () => Type.Array(Type.String({ minLength: 1, maxLength: 8000 }), { maxItems: 30 });
export const checkpointParams = Type.Object({ decisions: strings(), nextSteps: strings(), validations: strings() });
export const taskTools = [
  { name: "read_task_artifact", description: "Read a registered result or handoff artifact for this task. Offsets and limits are UTF-8 bytes. Use nextOffset to continue. No arbitrary file paths.", inputSchema: artifactParams, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: "propose_checkpoint", description: "Propose new decisions, replacement next steps and observed validations. This only stages a proposal; the user approves it with /checkpoint. Never call it an approved decision.", inputSchema: checkpointParams, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
];
export function taskFromDisk(dir: string, taskId: string): Task {
  const task = JSON.parse(readFileSync(join(dir, "task.json"), "utf8")) as Task;
  if (task.version !== 2 || task.id !== taskId) throw new Error("Task session changed. Reconnect through the harness.");
  return task;
}
export function callTaskTool(dir: string, task: Task, name: string, args: Record<string, unknown>): unknown {
  if (name === "read_task_artifact") return readArtifact(dir, task.id, String(args.artifact_id), args.offset === undefined ? undefined : Number(args.offset), args.limit === undefined ? undefined : Number(args.limit));
  if (name === "propose_checkpoint") return { proposal_id: stageCheckpoint(dir, task, args), status: "pending_user_approval", message: "The user must review /checkpoint; no approved state was changed." };
  throw new Error("Unknown task tool.");
}
