import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage, type TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ACPWorker, type ACPOptions } from "./acp.js";
import { geminiCLI, harnessEnv } from "./config.js";
import { assertManagedProject } from "./security.js";
import { TaskStore } from "./state.js";
import type { SessionNotification } from "@agentclientprotocol/sdk";

// ACP owns Gemini's tool loop. Notifications are journaled, never returned as Pi
// tool calls (which would execute the same operation twice).
export function registerGemini(pi: ExtensionAPI, store: TaskStore, getContext: () => ExtensionContext | undefined, isReview: () => boolean, makeWorker: (options: ACPOptions) => Pick<ACPWorker, "prompt" | "close" | "sessionId"> = options => {
  // The official CLI owns authentication, including encrypted files/keychains.
  // A missing legacy oauth_creds.json does not mean the user is logged out.
  return new ACPWorker(options);
}) {
  let worker: Pick<ACPWorker, "prompt" | "close" | "sessionId"> | undefined;
  let cursor: string[] = [];
  let receiveUpdate: ((notification: SessionNotification) => void) | undefined;
  let previousUsage: { input: number; output: number; total: number } | undefined;
  let packetPending = true;
  const reset = () => { worker?.close(); worker = undefined; cursor = []; previousUsage = undefined; packetPending = true; };
  pi.registerProvider("gemini-cli-acp", {
    name: "Gemini CLI subscription", api: "gemini-cli-acp", baseUrl: "gemini-cli-acp", apiKey: "local-cli-oauth",
    models: [{ id: "cli-default", name: "Gemini CLI account default (ACP)", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 32000 }],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "" }], api: model.api, provider: model.provider, model: model.id, responseId: randomUUID(), timestamp: Date.now(), stopReason: "stop", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      void (async () => {
        try {
          assertManagedProject(store.project);
          const { hashes, text } = incrementalUserInput(context, cursor);
          if (!text) throw new Error("No new user input; use /switch to start a fresh Gemini segment.");
          const payload = { text: packetPending ? `${store.checkpoint()}\n\n${isReview() ? "Review only. Do not change files or run commands." : "Continue the task within the selected project."}\n\nUser request:\n${text}` : text };
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
                  if (update.sessionUpdate === "tool_call") store.beginOperation(id, update.title || update.kind || "Gemini tool");
                  if (update.status === "completed" || update.status === "failed") store.endOperation(id, update.status === "failed", JSON.stringify(update.content ?? update.rawOutput ?? "Result available in Gemini session log."));
                  getContext()?.ui.setStatus("ph-tool", `Gemini: ${update.status || "running"} ${"title" in update ? update.title || "" : ""}`);
                } else if (update.sessionUpdate === "usage_update") {
                  // This is a context gauge/cumulative cost, NOT incremental token usage.
                  store.event("gemini_context_gauge", update);
                }
          };
          if (!worker) {
            worker = makeWorker({ command: process.execPath, args: [geminiCLI, "--acp", "--extensions", "none", "--approval-mode", isReview() ? "plan" : "default"], cwd: store.project, env: harnessEnv(isReview()), logDir: join(store.dir, "logs"), review: isReview(),
              approve: async (title, detail, signal) => {
                const ctx = getContext(); if (!ctx?.hasUI || signal?.aborted) return false;
                return ctx.ui.confirm(title, detail, { signal });
              }, update: notification => receiveUpdate?.(notification),
            });
          }
          stream.push({ type: "start", partial: message });
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          const result = await worker.prompt(prompt.text, options?.signal);
          packetPending = false;
          cursor = hashes;
          await options?.onResponse?.({ status: 200, headers: {} }, model);
          store.event("gemini_turn", { sessionId: worker.sessionId, stopReason: result.stopReason, usage: result.usage ?? null });
          const usage = result.usage;
          if (usage) {
            // ACP 1.5 Usage fields are cumulative across the session. Never sum snapshots.
            message.usage.input = Math.max(0, usage.inputTokens - (previousUsage?.input ?? 0));
            message.usage.output = Math.max(0, usage.outputTokens - (previousUsage?.output ?? 0));
            message.usage.totalTokens = Math.max(0, usage.totalTokens - (previousUsage?.total ?? 0));
            previousUsage = { input: usage.inputTokens, output: usage.outputTokens, total: usage.totalTokens };
          }
          store.usage({ id: message.responseId!, provider: model.provider, model: model.id, kind: usage ? "reported" : "unknown", ...(usage ? { input: message.usage.input, output: message.usage.output } : {}) });
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
