import { basename } from "node:path";
import { projectId } from "./state.js";

export function workspaceName(project: string): string { return `ph-${basename(project).replace(/[^a-zA-Z0-9_-]/g, "_")}-${projectId(project).slice(0, 6)}`; }
