import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Value } from "typebox/value";
import type { McpServer } from "@agentclientprotocol/sdk";
import { confinedPath, subscriptionEnv } from "./security.js";
import { callTaskTool, taskTools } from "./task-tools.js";
import { Instructions } from "./workflow.js";
import { RESULT_BYTES, resultEnvelope } from "./artifacts.js";
import type { TaskStore } from "./state.js";
import { privateDir } from "./paths.js";
import { piRoot } from "./dependencies.js";

// Give Google's official model loop the same Pi tools through MCP. Its native
// tools are disabled. This stays in the parent process so
// approval, cancellation and the task journal have a single owner.
export async function startGeminiTools(store: TaskStore, options: {
  review: boolean; instructions: Instructions;
  signal: () => AbortSignal | undefined;
  approve: (command: string, signal: AbortSignal) => Promise<boolean>;
  activity?: (name: string) => void;
}): Promise<{ server: McpServer; close: () => void }> {
  const taskId = store.task.id;
  const lifecycle = new AbortController();
  // Pinned Pi submodule: avoid loading its whole editor/runtime barrel again.
  const { createCodingTools, createReadOnlyTools, createBashTool, createLocalBashOperations } = await import(pathToFileURL(join(piRoot, "dist/core/tools/index.js")).href) as typeof import("@earendil-works/pi-coding-agent");
  const tools = new Map([...createReadOnlyTools(store.project), ...(options.review ? [] : createCodingTools(store.project, {
    bash: { spawnHook: context => ({ ...context, env: subscriptionEnv(context.env) }) },
  }))].map(tool => [tool.name, tool]));
  const advertised = [...taskTools, ...[...tools.values()].map(tool => ({
    name: tool.name, description: tool.description, inputSchema: tool.parameters,
    annotations: { readOnlyHint: ["read", "grep", "find", "ls"].includes(tool.name), openWorldHint: tool.name === "bash" },
  }))];
  const mcp = new Server({ name: "personal-harness", version: "0.2.0" }, { capabilities: { tools: {} } });
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: advertised }));
  mcp.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const id = `gemini-tool:${randomUUID()}`;
    const name = request.params.name;
    let shellOutput: string | undefined;
    let exitCode: number | undefined;
    const signal = AbortSignal.any([lifecycle.signal, extra.signal, ...[options.signal()].filter((s): s is AbortSignal => !!s)]);
    try {
      signal.throwIfAborted();
      if (store.task.id !== taskId) throw new Error("Task changed; reconnect through /switch.");
      options.instructions.assertCurrent();
      const schema = advertised.find(tool => tool.name === name)?.inputSchema;
      const args = { ...request.params.arguments };
      if (!schema || !Value.Check(schema, args)) throw new Error("Unknown tool or invalid arguments.");
      if (typeof args.path === "string") {
        args.path = confinedPath(store.project, args.path);
      }
      if (name === "bash" && !(await options.approve(String(args.command), signal))) throw new Error("Command declined.");
      signal.throwIfAborted();
      store.beginOperation(id, name); options.activity?.(name);
      let tool = tools.get(name);
      if (name === "bash") {
        shellOutput = join(privateDir(join(store.dir, "logs")), `${id.replaceAll(":", "-")}.log`);
        const base = createLocalBashOperations();
        tool = createBashTool(store.project, { operations: { exec: async (command, cwd, execOptions) => {
          const result = await base.exec(command, cwd, { ...execOptions, env: subscriptionEnv(execOptions.env), onData: data => {
            appendFileSync(shellOutput!, data, { mode: 0o600 }); execOptions.onData(data);
          } });
          exitCode = result.exitCode ?? undefined; return result;
        } } });
      }
      const result = tool ? await tool.execute(id, args, signal) : {
        content: [{ type: "text" as const, text: JSON.stringify(callTaskTool(store.dir, store.task, name, args)) }], details: {},
      };
      let raw = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      const details = result.details as { fullOutputPath?: string };
      if (shellOutput && existsSync(shellOutput)) raw = readFileSync(shellOutput, "utf8");
      else if (name === "bash" && details?.fullOutputPath) raw = readFileSync(details.fullOutputPath, "utf8");
      store.endOperation(id, false, raw, exitCode);
      const artifact = store.task.operations.find(op => op.id === id)!.artifactId!;
      const content = Buffer.byteLength(raw) > RESULT_BYTES && !taskTools.some(tool => tool.name === name)
        ? [{ type: "text" as const, text: resultEnvelope(raw, artifact, false) }, ...result.content.filter(part => part.type !== "text")]
        : result.content;
      return { content };
    } catch (error) {
      // Pi's thrown shell error includes the output/full-output file reference.
      const text = String(error) + (shellOutput && existsSync(shellOutput) ? `\nFull captured command output:\n${readFileSync(shellOutput, "utf8")}` : "");
      if (!store.task.operations.some(op => op.id === id)) store.beginOperation(id, name);
      store.endOperation(id, true, text, exitCode);
      if (signal.aborted) { store.task.operations.find(op => op.id === id)!.status = "unknown"; store.save(); }
      const artifact = store.task.operations.find(op => op.id === id)!.artifactId!;
      return { isError: true, content: [{ type: "text", text: Buffer.byteLength(text) > RESULT_BYTES ? resultEnvelope(text, artifact, true) : text }] };
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
  return {
    server: { name: "ph", type: "http", url: `http://127.0.0.1:${address.port}/mcp`, headers: [{ name: "Authorization", value: `Bearer ${token}` }] },
    close() { lifecycle.abort(); void mcp.close().catch(() => {}); http.close(); http.closeAllConnections(); },
  };
}
