import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { billingConfirmed } from "./config.js";
import { profileDir, projectPath } from "./paths.js";
import { assertManagedProject, assertPrivateAuthStore, assertRoute, classifyFailure, confinedPath, PROVIDER_LABELS, PROVIDERS, type Provider } from "./security.js";
import { TaskStore } from "./state.js";
import { registerGemini } from "./gemini.js";

export default function extension(pi: ExtensionAPI): void {
  if (process.env.PH_LAUNCHED !== "1") throw new Error("Start this extension with ph agent <project>.");
  const store = new TaskStore(projectPath(process.cwd()));
  let current: ExtensionContext | undefined;
  let review = false;
  let changing = false;
  let packetPending = true;
  let selected: string | undefined;
  const gemini = registerGemini(pi, store, () => current, () => review);
  const notify = (ctx: ExtensionContext, text: string, error = false) => ctx.ui.notify(text, error ? "error" : "info");
  const guard = (ctx: ExtensionContext) => {
    assertManagedProject(store.project);
    assertPrivateAuthStore(join(profileDir, "auth.json"));
    if (!ctx.model) throw new Error("Choose a primary worker with /switch.");
    assertRoute(ctx.model);
    if (!billingConfirmed(ctx.model.provider as Provider)) throw new Error(`Confirm extra usage is disabled in your account, then run: ph billing confirm ${ctx.model.provider} --extra-usage-off`);
    if (selected !== `${ctx.model.provider}/${ctx.model.id}`) throw new Error("Use /switch to select the model and create a compact handoff first.");
    if (["rate_limited", "needs_reconciliation"].includes(store.task.status)) throw new Error("Task is paused. Inspect /task, then /switch to continue with the provider you choose.");
  };
  const tools = () => pi.setActiveTools(review ? ["read", "grep", "find", "ls"] : ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  async function switchTo(args: string, ctx: ExtensionCommandContext, readonly: boolean): Promise<void> {
    try {
      if (!ctx.isIdle()) throw new Error("Stop the active turn with Escape and wait for it to settle before switching.");
      store.assertSwitchable();
      const aliases: Record<string, Provider> = { gpt: "openai-codex", claude: "claude-bridge", gemini: "gemini-cli-acp" };
      let provider = aliases[args.trim()] || (PROVIDERS.includes(args.trim() as Provider) ? args.trim() as Provider : undefined);
      if (!provider) {
        const choice = await ctx.ui.select("Select primary worker", PROVIDERS.map(value => PROVIDER_LABELS[value]));
        provider = PROVIDERS.find(value => PROVIDER_LABELS[value] === choice);
      }
      if (!provider) return;
      if (!billingConfirmed(provider)) throw new Error(`Account extra-usage setting is unconfirmed. Run: ph billing confirm ${provider} --extra-usage-off after checking your account.`);
      const models = ctx.modelRegistry.getAll().filter(model => model.provider === provider);
      if (!models.length) throw new Error(`No account models available yet. Run ph login ${provider}, then restart the harness.`);
      const choice = models.length === 1 ? models[0]!.id : await ctx.ui.select("Select model (availability requires account verification)", models.map(model => model.id));
      const model = models.find(model => model.id === choice); if (!model) return;
      assertRoute(model);
      store.checkpoint("paused"); gemini.reset(); changing = true;
      store.task.nextSegment = { provider, model: model.id, review: readonly }; store.save();
      // Pi 0.87 recreates extensions on replacement. The new extension instance
      // consumes the intent in session_start using its fresh ExtensionAPI.
      const changed = await ctx.newSession({ withSession: async fresh => {
        fresh.ui.notify("Fresh session opened. Check the worker shown below, then enter the next instruction.", "info");
      } });
      if (changed.cancelled) { delete store.task.nextSegment; store.save(); }
    } catch (error) { if (!changing) notify(ctx, String(error), true); else process.stderr.write(`Switch failed: ${String(error)}\n`); }
    finally { changing = false; }
  }
  pi.registerCommand("switch", { description: "Checkpoint and select GPT / Claude / Gemini as primary worker", handler: (args, ctx) => switchTo(args, ctx, false) });
  pi.registerCommand("review", { description: "Start an explicitly selected read-only review segment", handler: (args, ctx) => switchTo(args, ctx, true) });
  pi.registerCommand("task", { description: "Show task; /task goal|next|decision|add|reconcile ...", handler: async (args, ctx) => {
    try {
      if (!ctx.isIdle()) throw new Error("Wait for the active turn to settle before changing task state.");
      const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args.trim());
      const command = match?.[1]; const text = match?.[2] || ""; const parts = text.split(/\s+/);
      if (command === "new" && text) { store.newTask(text); selected = undefined; gemini.reset(); }
      else if (command === "goal" && text) store.task.goal = text;
      else if (command === "next" && text) store.task.nextSteps = [text];
      else if (command === "decision" && text) store.task.decisions.push(text);
      else if (command === "add" && text) { const path = confinedPath(store.project, text); if (!existsSync(path)) throw new Error("Input file does not exist."); if (!store.task.inputs.includes(path)) store.task.inputs.push(path); }
      else if (command === "done") { store.assertSwitchable(); store.task.status = "complete"; }
      else if (command === "reconcile") {
        const [id, status, ...note] = parts;
        const op = store.task.operations.find(item => item.id === id);
        if (!op || !["completed", "failed"].includes(status || "") || !note.length) throw new Error("Usage: /task reconcile <operation-id> completed|failed <observed result>");
        store.endOperation(id!, status === "failed", note.join(" "));
        if (!store.unresolved().length) store.task.status = "paused";
      }
      packetPending = true;
      const packet = store.checkpoint(); notify(ctx, packet);
    } catch (error) { notify(ctx, String(error), true); }
  } });
  pi.registerCommand("handoff", { description: "Save task packet without a model call", handler: async (_args, ctx) => { if (!ctx.isIdle()) return notify(ctx, "Stop the active turn first.", true); store.checkpoint(); notify(ctx, join(store.dir, "handoff.md")); } });
  pi.registerCommand("usage", { description: "Show reported usage; unknown remains unknown", handler: async (_args, ctx) => { const path = join(store.dir, "usage.jsonl"); notify(ctx, existsSync(path) ? readFileSync(path, "utf8").split("\n").slice(-21).join("\n") : "No recorded usage. Account quota/charges are not inferred from token counts."); } });
  pi.on("session_start", async (event, ctx) => {
    current = ctx; packetPending = true;
    const intent = store.task.nextSegment;
    delete store.task.nextSegment; store.save();
    if (event.reason === "new" && intent) {
      try {
        changing = true;
        const model = ctx.modelRegistry.find(intent.provider, intent.model);
        if (!model || !(await pi.setModel(model))) throw new Error(`Authentication/model unavailable. Run ph login ${intent.provider}.`);
        selected = `${intent.provider}/${intent.model}`; review = intent.review;
        store.task.provider = intent.provider; store.task.model = intent.model; store.task.status = "idle"; delete store.task.error;
        store.task.sessions.push({ provider: intent.provider, model: intent.model, path: ctx.sessionManager.getSessionFile(), at: new Date().toISOString() });
        store.checkpoint(); store.event("switch", intent);
      } catch (error) { notify(ctx, String(error), true); }
      finally { changing = false; }
    }
    tools(); ctx.ui.setStatus("ph", selected ? `${review ? "REVIEW" : "WORK"} · ${selected}` : "Choose /switch · subscription only");
  });
  pi.on("model_select", (event, ctx) => { current = ctx; if (!changing && `${event.model.provider}/${event.model.id}` !== selected) { selected = undefined; gemini.reset(); notify(ctx, "Use /switch before sending input so the handoff starts a fresh session."); } });
  pi.on("input", (_event, ctx) => { current = ctx; try { guard(ctx); return { action: "continue" }; } catch (error) { notify(ctx, String(error), true); return { action: "handled" }; } });
  pi.on("before_provider_request", (_event, ctx) => { try { guard(ctx); } catch (error) { ctx.abort(); notify(ctx, String(error), true); } });
  pi.on("before_agent_start", (event, ctx) => {
    current = ctx; store.task.status = "running"; store.save();
    if (!store.task.goal) store.task.goal = event.prompt;
    if (!packetPending) return;
    packetPending = false;
    // Gemini supplies this packet to its native session itself. Do not also
    // inject a Pi custom message that would become a duplicate user message.
    if (ctx.model?.provider === "gemini-cli-acp") { gemini.updatePacket(); return; }
    // The official Claude bridge also receives custom messages. No default-prompt spoofing.
    return { message: { customType: "ph-task", content: `${store.checkpoint()}\n${review ? "Read-only review: report findings without editing or shell execution." : "Work only on the current task. Record uncertainty and actual validation."}`, display: false } };
  });
  pi.on("tool_call", async (event, ctx) => {
    try {
      guard(ctx);
      if (review && !["read", "grep", "find", "ls"].includes(event.toolName)) throw new Error("Read-only review blocks this tool.");
      const input = event.input as Record<string, unknown>;
      if (typeof input.path === "string") confinedPath(store.project, input.path);
      if (event.toolName === "bash") {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Run command in project", String(input.command)))) throw new Error("Command declined.");
      }
      return undefined;
    } catch (error) { return { block: true, terminate: true, reason: String(error) }; }
  });
  pi.on("tool_execution_start", event => { store.beginOperation(event.toolCallId, event.toolName); });
  pi.on("tool_execution_end", event => { store.endOperation(event.toolCallId, event.isError, JSON.stringify(event.result)); });
  pi.on("message_end", event => {
    const message = event.message;
    if (message.role !== "assistant") return;
    const text = message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
    if (text) store.task.lastResult = text;
    if (message.provider === "gemini-cli-acp" && ["error", "aborted"].includes(message.stopReason)) selected = undefined;
    if (message.stopReason === "error") { store.task.error = message.errorMessage || "Provider error"; store.task.status = classifyFailure(store.task.error) === "rate_limit" ? "rate_limited" : "paused"; }
    if (message.stopReason === "aborted") { store.task.error = "Turn interrupted; inspect observed outputs before continuing."; store.task.status = "paused"; }
    if (message.provider !== "gemini-cli-acp") store.usage({ id: message.responseId || `${message.provider}:${message.timestamp}`, provider: message.provider, model: message.model, kind: message.usage.totalTokens > 0 ? "reported" : "unknown", input: message.usage.input, output: message.usage.output, cacheRead: message.usage.cacheRead, cacheWrite: message.usage.cacheWrite });
    store.save();
  });
  pi.on("agent_settled", (_event, ctx) => {
    if (store.unresolved().length) { for (const op of store.unresolved()) op.status = "unknown"; store.task.status = "needs_reconciliation"; }
    else if (store.task.status === "running") store.task.status = "paused";
    store.checkpoint(); ctx.ui.setStatus("ph-tool", undefined);
    if (store.task.status === "rate_limited") notify(ctx, "Rate limit: checkpoint saved. Select the next worker with /switch.");
  });
  pi.on("session_before_switch", (_event, ctx) => { if (!changing && !ctx.isIdle()) return { cancel: true }; });
  pi.on("session_before_compact", (_event, ctx) => { notify(ctx, "Use /handoff and /switch to start a compact segment without a summarization call."); return { cancel: true }; });
  pi.on("session_before_tree", () => ({ cancel: true }));
  pi.on("session_shutdown", () => { gemini.reset(); store.checkpoint(); });
}
