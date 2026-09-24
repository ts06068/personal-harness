import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BashToolInput, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { piRoot } from "./dependencies.js";
import { privateDir } from "./paths.js";
import { subscriptionEnv } from "./security.js";
import { resultEnvelope } from "./artifacts.js";
import type { OperationCompletion, TaskStore } from "./state.js";

export interface ShellResult {
  content: { type: "text"; text: string }[];
  details: { artifactId: string; outcome: OperationCompletion };
  isError: boolean;
}
type BashDefinition = ReturnType<typeof import("@earendil-works/pi-coding-agent")["createBashToolDefinition"]>;
export interface ManagedShell {
  definition: Omit<BashDefinition, "execute"> & {
    execute(id: string, args: BashToolInput, signal?: AbortSignal, onUpdate?: Parameters<BashDefinition["execute"]>[3], ctx?: ExtensionContext): Promise<{ content: ShellResult["content"]; details: {} }>;
  };
  result(id: string): ShellResult | undefined;
  forget(id: string): boolean;
}

// Both Pi and Google's MCP use this implementation. The capture is independent
// of Pi's truncated return value and survives Pi turning thrown errors into text.
export async function createManagedShell(store: TaskStore): Promise<ManagedShell> {
  const { createBashToolDefinition, createLocalBashOperations } = await import(pathToFileURL(join(piRoot, "dist/core/tools/bash.js")).href) as typeof import("@earendil-works/pi-coding-agent");
  const template = createBashToolDefinition(store.project);
  const finished = new Map<string, ShellResult>();
  const definition = {
    ...template,
    description: "Execute a shell command in the project. Returns a bounded summary with exit status, warnings and an ID for reading the complete output. Interrupted executions require observed reconciliation. Optional timeout is in seconds.",
    async execute(id: string, args: BashToolInput, signal?: AbortSignal, onUpdate?: Parameters<typeof template.execute>[3], ctx?: ExtensionContext) {
      store.beginOperation(id, "bash");
      let fd: number | undefined;
      let log: string | undefined;
      let entered = false;
      let returned = false;
      let exitCode: number | undefined;
      let timedOut = false;
      let captureError: unknown;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const stop = new AbortController();
      let outcome: OperationCompletion;
      const base = createLocalBashOperations();
      const tool = createBashToolDefinition(store.project, { operations: {
        async exec(command, cwd, options) {
          options.signal?.throwIfAborted();
          if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout <= 0 || options.timeout * 1000 > 2147483647)) throw new Error("Invalid command timeout.");
          await access(cwd);
          options.signal?.throwIfAborted();
          const path = join(privateDir(join(store.dir, "logs")), `${randomUUID()}.log`);
          fd = openSync(path, "wx", 0o600); log = path;
          const combined = AbortSignal.any([stop.signal, ...(options.signal ? [options.signal] : [])]);
          if (options.timeout !== undefined) timeout = setTimeout(() => { if (!combined.aborted) { timedOut = true; stop.abort(); } }, options.timeout * 1000);
          entered = true;
          const result = await base.exec(command, cwd, { ...options, timeout: undefined, signal: combined, env: subscriptionEnv(options.env), onData(data) {
            if (captureError) return;
            try {
              // Append bytes, not decoded chunks: UTF-8 may straddle emissions.
              let offset = 0;
              while (offset < data.length) offset += writeSync(fd!, data, offset, data.length - offset);
              options.onData(data);
            } catch (error) { captureError = error; stop.abort(); }
          } });
          returned = true; exitCode = result.exitCode ?? undefined;
          return result;
        },
      } });
      try {
        signal?.throwIfAborted();
        await tool.execute(id, args, signal, onUpdate, ctx!);
        outcome = { status: "completed", terminationReason: "exit", exitCode };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        const reason: OperationCompletion["terminationReason"] = returned ? "exit" : !entered ? "not_started" : captureError ? "interrupted" : timedOut ? "timeout" : signal?.aborted ? "cancelled" : ["ENOENT", "EACCES", "ENOEXEC"].includes(code || "") ? "launch_error" : "interrupted";
        const unknown = ["cancelled", "timeout", "interrupted"].includes(reason);
        // Do not retain Pi's duplicated/truncated output as the original log.
        const errorText = reason === "exit" ? `Command exited with code ${exitCode ?? "unknown"}` : reason === "timeout" ? `Command timed out after ${args.timeout} seconds` : reason === "cancelled" ? "Command cancelled during execution" : String(captureError || error);
        outcome = { status: unknown ? "unknown" : "failed", terminationReason: reason, exitCode, error: errorText };
      } finally {
        if (timeout) clearTimeout(timeout);
        if (fd !== undefined) closeSync(fd);
      }
      const raw = log ? readFileSync(log, "utf8") : "";
      store.endOperation(id, outcome, raw);
      const operation = store.task.operations.find(op => op.id === id)!;
      const result: ShellResult = {
        content: [{ type: "text", text: resultEnvelope(raw, operation.artifactId!, operation.status as OperationCompletion["status"], operation.warnings, { ...outcome, status: operation.status as OperationCompletion["status"] }) }],
        details: { artifactId: operation.artifactId!, outcome }, isError: outcome.status !== "completed",
      };
      finished.set(id, result);
      // Pi requires a throw for failures. tool_result restores our structured
      // result from finished; MCP consumes the same result in its own adapter.
      if (result.isError) throw new Error(result.content[0]!.text);
      return { content: result.content, details: {} };
    },
  };
  return { definition, result: (id: string) => finished.get(id), forget: (id: string) => finished.delete(id) };
}
