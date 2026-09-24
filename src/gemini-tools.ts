import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Value } from "typebox/value";
import type { McpServer } from "@agentclientprotocol/sdk";
import { confinedPath } from "./security.js";
import type { BashToolInput } from "@earendil-works/pi-coding-agent";
import { callTaskTool, taskTools } from "./task-tools.js";
import { Instructions } from "./workflow.js";
import { RESULT_BYTES, resultEnvelope } from "./artifacts.js";
import type { TaskStore } from "./state.js";
import { piRoot } from "./dependencies.js";
import { createManagedShell } from "./shell.js";

// Give Google's official model loop the same Pi tools through MCP. Its native
// tools are disabled. This stays in the parent process so
// approval, cancellation and the task journal have a single owner.
export async function startGeminiTools(store: TaskStore, options: {
  review: boolean; instructions: Instructions;
  signal: () => AbortSignal | undefined;
  approve: (command: string, signal: AbortSignal) => Promise<boolean>;
  activity?: (name: string) => void;
  interrupt?: () => void;
}): Promise<{ server: McpServer; settle: () => Promise<void>; close: () => Promise<void> }> {
  const taskId = store.task.id;
  const lifecycle = new AbortController();
  const pending = new Set<Promise<void>>();
  // Pinned Pi submodule: avoid loading its whole editor/runtime barrel again.
  const { createCodingTools, createReadOnlyTools } = await import(pathToFileURL(join(piRoot, "dist/core/tools/index.js")).href) as typeof import("@earendil-works/pi-coding-agent");
  const shell = await createManagedShell(store);
  const tools = new Map([...createReadOnlyTools(store.project), ...(options.review ? [] : createCodingTools(store.project))].map(tool => [tool.name, tool]));
  const advertised = [...taskTools, ...[...tools.values()].map(tool => ({
    name: tool.name, description: tool.name === "bash" ? shell.definition.description : tool.description, inputSchema: tool.parameters,
    annotations: { readOnlyHint: ["read", "grep", "find", "ls"].includes(tool.name), openWorldHint: tool.name === "bash" },
  }))];
  const mcp = new Server({ name: "personal-harness", version: "0.2.0" }, { capabilities: { tools: {} } });
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: advertised }));
  mcp.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    let finish!: () => void;
    const active = new Promise<void>(resolve => { finish = resolve; });
    pending.add(active);
    const id = `gemini-tool:${randomUUID()}`;
    const name = request.params.name;
    let executing = false;
    const signal = AbortSignal.any([lifecycle.signal, extra.signal, ...[options.signal()].filter((s): s is AbortSignal => !!s)]);
    try {
      signal.throwIfAborted();
      if (store.task.id !== taskId) throw new Error("Task changed; reconnect through /switch.");
      if (store.task.operations.some(op => op.status === "unknown")) throw new Error("Task needs reconciliation before further tool calls.");
      options.instructions.assertCurrent();
      const schema = advertised.find(tool => tool.name === name)?.inputSchema;
      const args = { ...request.params.arguments };
      if (!schema || !Value.Check(schema, args)) throw new Error("Unknown tool or invalid arguments.");
      if (typeof args.path === "string") {
        args.path = confinedPath(store.project, args.path);
      }
      if (name === "bash" && !(await options.approve(String(args.command), signal))) throw new Error("Command declined.");
      signal.throwIfAborted();
      if (store.task.operations.some(op => op.status === "unknown")) throw new Error("Task needs reconciliation before execution.");
      store.beginOperation(id, name); options.activity?.(name);
      const tool = tools.get(name);
      executing = true;
      if (name === "bash") {
        await shell.definition.execute(id, args as unknown as BashToolInput, signal);
        const captured = shell.result(id)!;
        return { content: captured.content, isError: captured.isError };
      }
      const result = tool ? await tool.execute(id, args, signal) : {
        content: [{ type: "text" as const, text: JSON.stringify(callTaskTool(store.dir, store.task, name, args)) }], details: {},
      };
      const raw = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      store.endOperation(id, { status: "completed" }, raw);
      const artifact = store.task.operations.find(op => op.id === id)!.artifactId!;
      const content = Buffer.byteLength(raw) > RESULT_BYTES && !taskTools.some(tool => tool.name === name)
        ? [{ type: "text" as const, text: resultEnvelope(raw, artifact, "completed") }, ...result.content.filter(part => part.type !== "text")]
        : result.content;
      return { content };
    } catch (error) {
      const captured = shell.result(id);
      if (captured) return { content: captured.content, isError: captured.isError };
      const text = String(error);
      if (!store.task.operations.some(op => op.id === id)) store.beginOperation(id, name);
      const interrupted = executing && signal.aborted && ["bash", "write", "edit"].includes(name);
      store.endOperation(id, { status: interrupted ? "unknown" : "failed", terminationReason: interrupted ? "cancelled" : !executing ? "not_started" : undefined }, text);
      const artifact = store.task.operations.find(op => op.id === id)!.artifactId!;
      return { isError: true, content: [{ type: "text", text: Buffer.byteLength(text) > RESULT_BYTES ? resultEnvelope(text, artifact, interrupted ? "unknown" : "failed") : text }] };
    } finally {
      shell.forget(id); pending.delete(active); finish();
      if (store.task.operations.find(op => op.id === id)?.status === "unknown") options.interrupt?.();
    }
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse: true });
  await mcp.connect(transport);
  const token = randomUUID() + randomUUID();
  const http = createServer((request, response) => {
    if (request.url !== "/mcp" || request.headers.authorization !== `Bearer ${token}` || request.headers.origin) {
      response.writeHead(403).end(); return;
    }
    void transport.handleRequest(request, response).catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  await new Promise<void>((resolve, reject) => { http.once("error", reject); http.listen(0, "127.0.0.1", () => { http.off("error", reject); resolve(); }); });
  const address = http.address(); if (!address || typeof address === "string") throw new Error("Local MCP listener failed.");
  const settle = async () => { await Promise.all([...pending]); };
  let closing: Promise<void> | undefined;
  return {
    server: { name: "ph", type: "http", url: `http://127.0.0.1:${address.port}/mcp`, headers: [{ name: "Authorization", value: `Bearer ${token}` }] },
    settle,
    close() {
      if (closing) return closing;
      lifecycle.abort(); http.close(); http.closeAllConnections();
      // The response can disappear before a cancelled subprocess finishes.
      // Keep the owner alive until its partial output and outcome are saved.
      closing = Promise.all([mcp.close().catch(() => {}), settle()]).then(() => {});
      return closing;
    },
  };
}
