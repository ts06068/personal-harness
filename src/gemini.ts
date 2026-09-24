import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createAssistantMessageEventStream, type AssistantMessage, type TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ACPWorker, type ACPOptions } from "./acp.js";
import { googleACP, geminiHome, harnessEnv } from "./config.js";
import { assertManagedProject } from "./security.js";
import { TaskStore } from "./state.js";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { Instructions } from "./workflow.js";
import { excerpt, HANDOFF_BYTES, resultEnvelope } from "./artifacts.js";
import type { startGeminiTools } from "./gemini-tools.js";
import { assertGoogleProfile, googleWorkspace } from "./google-profile.js";

// ACP owns Gemini's tool loop. Notifications are journaled, never returned as Pi
// tool calls (which would execute the same operation twice).
export function registerGemini(pi: ExtensionAPI, store: TaskStore, getContext: () => ExtensionContext | undefined, isReview: () => boolean, makeWorker: (options: ACPOptions) => Pick<ACPWorker, "prompt" | "close" | "sessionId"> = options => {
  assertGoogleProfile(geminiHome);
  if (!existsSync(join(geminiHome, ".gemini/antigravity-acp/acp_token.json"))) throw new Error("Run ph login gemini once for the official Antigravity ACP server. Legacy Gemini CLI credentials are separate.");
  return new ACPWorker(options);
}) {
  let worker: Pick<ACPWorker, "prompt" | "close" | "sessionId"> | undefined;
  let cursor: string[] = [];
  let receiveUpdate: ((notification: SessionNotification) => void) | undefined;
  let previousUsage: { input: number; output: number; total: number } | undefined;
  let packetPending = true;
  let localTools: Awaited<ReturnType<typeof startGeminiTools>> | undefined;
  let activeSignal: AbortSignal | undefined;
  const instructions = new Instructions(store.project, store.dir, geminiHome);
  const reset = () => { worker?.close(); localTools?.close(); localTools = undefined; worker = undefined; cursor = []; previousUsage = undefined; packetPending = true; delete store.task.contextGauge; };
  pi.registerProvider("gemini-cli-acp", {
    // Retain the provider/route IDs for existing task and billing records.
    name: "Google Antigravity subscription", api: "gemini-cli-acp", baseUrl: "gemini-cli-acp", apiKey: "local-cli-oauth",
    models: [{ id: "cli-default", name: "Gemini account default (official Antigravity ACP)", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 32000 }],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "" }], api: model.api, provider: model.provider, model: model.id, responseId: randomUUID(), timestamp: Date.now(), stopReason: "stop", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      void (async () => {
        try {
          assertManagedProject(store.project);
          instructions.assertCurrent();
          const { hashes, text } = incrementalUserInput(context, cursor);
          if (!text) throw new Error("No new user input; use /switch to start a fresh Gemini segment.");
          const payload = { text: packetPending ? `${instructions.packet()}\n${excerpt(store.checkpoint(), HANDOFF_BYTES - 256)}\n\nProject tools are rooted at ${store.project}. Use relative paths with the ph MCP tools. The native session directory stores metadata only.\n${isReview() ? "Review only. Do not change project files or run commands. You may propose a checkpoint for user review." : "Continue the task within the selected project."}\n\nUser request:\n${text}` : text };
          const replacement = await options?.onPayload?.(payload, model);
          const prompt = replacement === undefined ? payload : replacement as typeof payload;
          if (!prompt || typeof prompt.text !== "string") throw new Error("Invalid ACP prompt payload.");
          receiveUpdate = notification => {
                const update = notification.update;
                if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
                  const part = message.content[0]; if (part?.type !== "text") return;
                  part.text += update.content.text;
                  stream.push({ type: "text_delta", contentIndex: 0, delta: update.content.text, partial: message });
                } else if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
                  const id = `gemini:${notification.sessionId}:${update.toolCallId}`;
                  // Managed MCP journals its actual execution in the parent.
                  // Other protocol workers may omit the initial tool_call.
                  if (!localTools) store.beginOperation(id, update.title || update.kind || "Gemini tool");
                  if (update.status === "completed" || update.status === "failed") {
                    let result = JSON.stringify(update.content ?? update.rawOutput ?? "Result available in Gemini session log.");
                    const ref = /Full result: read_task_artifact\(artifact_id="([a-f0-9]{64})"/.exec(result.replaceAll('\\"', '"'))?.[1];
                    if (ref) { const path = join(store.dir, "artifacts", store.task.id, `${ref}.txt`); if (existsSync(path)) result = readFileSync(path, "utf8"); }
                    if (!localTools) store.endOperation(id, update.status === "failed", result);
                  }
                  getContext()?.ui.setStatus("ph-tool", `Gemini: ${update.status || "running"} ${"title" in update ? update.title || "" : ""}`);
                } else if (update.sessionUpdate === "usage_update") {
                  // This is a context gauge/cumulative cost, NOT incremental token usage.
                  store.event("gemini_context_gauge", update);
                  const gauge = update as unknown as { used?: number; size?: number };
                  if (typeof gauge.used === "number" && typeof gauge.size === "number" && gauge.size > 0) store.task.contextGauge = { used: gauge.used, size: gauge.size };
                }
          };
          if (!worker) {
            const { startGeminiTools } = await import("./gemini-tools.js");
            localTools = await startGeminiTools(store, { review: isReview(), instructions, signal: () => activeSignal,
              approve: async (command, signal) => { const ctx = getContext(); return !!ctx?.hasUI && !signal.aborted && ctx.ui.confirm("Run command in project", command, { signal }); },
              activity: name => getContext()?.ui.setStatus("ph-tool", `Gemini: ${name}`),
            });
            worker = makeWorker({ command: googleACP, args: ["--uid="], cwd: googleWorkspace(store.dir), env: { ...harnessEnv(isReview()), PH_TASK_DIR: store.dir, PH_TASK_ID: store.task.id, PH_REVIEW: isReview() ? "1" : "0" }, logDir: join(store.dir, "logs"), review: isReview(),
              managedToolsOnly: true, sessionMeta: { agy: { enabledTools: [] } },
              ready: session => {
                const option = session.configOptions?.find(option => option.category === "model");
                if (option && "currentValue" in option && typeof option.currentValue === "string") store.task.observedModel = option.currentValue;
              },
              mcpServers: [localTools.server],
              terminalResult: (terminalId, path, exitCode) => {
                const text = existsSync(path) ? readFileSync(path, "utf8") : "";
                const id = `terminal:${terminalId}`; store.beginOperation(id, "Gemini terminal");
                const ref = store.artifact(text);
                if (exitCode !== undefined && store.task.operations.find(op => op.id === id)?.status === "running") store.endOperation(id, exitCode !== 0, text, exitCode ?? undefined);
                return (exitCode === undefined ? "Terminal is still running; output is partial.\n" : `Exit code: ${exitCode ?? "unknown (signal)"}\n`) + resultEnvelope(text, ref, exitCode !== undefined && exitCode !== 0);
              },
              approve: async (title, detail, signal) => {
                const ctx = getContext(); if (!ctx?.hasUI || signal?.aborted) return false;
                return ctx.ui.confirm(title, detail, { signal });
              }, update: notification => receiveUpdate?.(notification),
            });
          }
          stream.push({ type: "start", partial: message });
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          activeSignal = options?.signal;
          const result = await worker.prompt(prompt.text, options?.signal);
          packetPending = false;
          cursor = hashes;
          await options?.onResponse?.({ status: 200, headers: {} }, model);
          store.event("gemini_turn", { sessionId: worker.sessionId, stopReason: result.stopReason, usage: result.usage ?? null });
          const usage = result.usage;
          const quota = (result._meta as { quota?: { token_count?: { input_tokens: number; output_tokens: number }; model_usage?: { model: string }[] } } | undefined)?.quota;
          const reportedModels = [...new Set(quota?.model_usage?.map(row => row.model) || [])];
          if (reportedModels.length) store.task.observedModel = reportedModels.join(", ");
          if (usage) {
            // ACP 1.5 Usage fields are cumulative across the session. Never sum snapshots.
            message.usage.input = Math.max(0, usage.inputTokens - (previousUsage?.input ?? 0));
            message.usage.output = Math.max(0, usage.outputTokens - (previousUsage?.output ?? 0));
            message.usage.totalTokens = Math.max(0, usage.totalTokens - (previousUsage?.total ?? 0));
            previousUsage = { input: usage.inputTokens, output: usage.outputTokens, total: usage.totalTokens };
          } else if (quota?.token_count) {
            // Gemini 0.61's extension is per prompt, unlike standard ACP's
            // cumulative usage. Do not subtract the preceding prompt's count.
            message.usage.input = quota.token_count.input_tokens;
            message.usage.output = quota.token_count.output_tokens;
            message.usage.totalTokens = message.usage.input + message.usage.output;
          }
          store.usage({ id: message.responseId!, provider: model.provider, model: store.task.observedModel || "unknown", kind: usage || quota?.token_count ? "reported" : "unknown", ...(usage || quota?.token_count ? { input: message.usage.input, output: message.usage.output } : {}) });
          message.stopReason = result.stopReason === "cancelled" ? "aborted" : result.stopReason === "max_tokens" ? "length" : "stop";
          if (message.stopReason === "aborted") { stream.push({ type: "error", reason: "aborted", error: message }); reset(); }
          else {
            stream.push({ type: "text_end", contentIndex: 0, content: message.content[0]?.type === "text" ? message.content[0].text : "", partial: message });
            stream.push({ type: "done", reason: message.stopReason, message });
          }
        } catch (error) {
          message.stopReason = options?.signal?.aborted ? "aborted" : "error";
          message.errorMessage = String(error); reset();
          stream.push({ type: "error", reason: message.stopReason, error: message });
        }
      })();
      return stream;
    },
  });
  return { reset, updatePacket: () => { packetPending = true; } };
}

export function incrementalUserInput(context: Pick<TranscriptContext, "messages">, previous: string[]): { hashes: string[]; text: string } {
  const users = context.messages.filter(message => message.role === "user");
  const texts = users.map(message => {
    if (message.role !== "user") return "";
    if (typeof message.content === "string") return message.content;
    if (message.content.some(part => part.type !== "text")) throw new Error("Gemini ACP v1 accepts text and selected files; image attachments are not supported.");
    return message.content.map(part => part.type === "text" ? part.text : "").join("\n");
  });
  const hashes = texts.map(text => createHash("sha256").update(text).digest("hex"));
  if (previous.length > hashes.length || previous.some((hash, index) => hash !== hashes[index])) throw new Error("Gemini history changed. Use /switch gemini for a fresh handoff; history will not be replayed.");
  return { hashes, text: texts.slice(previous.length).join("\n\n") };
}
