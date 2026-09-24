import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type Client, type McpServer, type NewSessionResponse, type PromptResponse, type RequestPermissionRequest, type SessionNotification } from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { confinedPath, subscriptionEnv, writeConfinedText } from "./security.js";

export interface ACPOptions {
  command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; logDir: string;
  review?: boolean; timeoutMs?: number;
  mcpServers?: McpServer[];
  sessionMeta?: Record<string, unknown>;
  managedToolsOnly?: boolean;
  ready?: (session: NewSessionResponse) => void;
  terminalResult?: (id: string, path: string, exitCode?: number | null) => string;
  approve: (title: string, detail: string, signal?: AbortSignal) => Promise<boolean>;
  update: (notification: SessionNotification) => void;
}
type Terminal = { child: ChildProcessWithoutNullStreams; output: string; truncated: boolean; limit: number; done: Promise<{ exitCode?: number | null; signal?: string | null }>; exitStatus?: { exitCode?: number | null; signal?: string | null } };

export class ACPWorker {
  private process?: ChildProcessWithoutNullStreams;
  private connection?: ClientSideConnection;
  private session?: NewSessionResponse;
  private signal?: AbortSignal;
  private terminals = new Map<string, Terminal>();
  private stderr = "";
  constructor(readonly options: ACPOptions) {}
  get sessionId(): string | undefined { return this.session?.sessionId; }
  private check(): void { if (this.signal?.aborted) throw new Error("ACP request cancelled"); }
  private checkNativeTool(): void {
    this.check();
    if (this.options.managedToolsOnly) throw new Error("Native callbacks are disabled; use managed MCP tools.");
  }
  private async permission(params: RequestPermissionRequest) {
    if (this.signal?.aborted) return { outcome: { outcome: "cancelled" as const } };
    const kind = params.toolCall.kind;
    // Only this session's managed 'ph' server receives this exception. The
    // parent MCP server independently checks arguments/mode and asks for shell
    // approval before execution; no duplicate native confirmation is needed.
    const meta = params.toolCall._meta as { mcp?: { server?: string; serverName?: string; tool?: string; name?: string } } | undefined;
    const mcp = meta?.mcp;
    const managed = this.options.mcpServers?.some(server => server.name === "ph") && (
      (mcp?.server === "ph" && /^(read_task_artifact|propose_checkpoint|read|grep|find|ls|write|edit|bash)$/.test(mcp.tool || "")) ||
      (kind === "other" && /^(read_task_artifact|propose_checkpoint|read|grep|find|ls|write|edit|bash) \(ph MCP Server\)$/.test(params.toolCall.title || ""))
    );
    const denied = this.options.review && !managed && !["read", "search", "think"].includes(kind || "");
    const detail = JSON.stringify(params.toolCall.rawInput ?? { locations: params.toolCall.locations, content: params.toolCall.content });
    const accepted = !denied && (managed || (!this.options.managedToolsOnly && await this.options.approve(params.toolCall.title || "Gemini tool", detail, this.signal)));
    if (!accepted || this.signal?.aborted) return { outcome: { outcome: "cancelled" as const } };
    const option = params.options.find(item => item.kind === "allow_once");
    return option ? { outcome: { outcome: "selected" as const, optionId: option.optionId } } : { outcome: { outcome: "cancelled" as const } };
  }
  private client(): Client {
    return {
      requestPermission: params => this.permission(params),
      sessionUpdate: params => this.options.update(params),
      readTextFile: async params => {
        this.checkNativeTool();
        const text = readFileSync(confinedPath(this.options.cwd, params.path), "utf8");
        if (Buffer.byteLength(text) > 2_000_000) throw new Error("File exceeds 2 MB; select a smaller input.");
        const lines = text.split("\n"); const start = Math.max(0, (params.line ?? 1) - 1);
        return { content: lines.slice(start, params.limit ? start + params.limit : undefined).join("\n") };
      },
      writeTextFile: async params => {
        this.checkNativeTool(); if (this.options.review) throw new Error("Review mode blocks file writes.");
        // The native agent's requestPermission handles interactive consent.
        // Confined project writes are supported in work mode; no second dialog.
        this.check(); writeConfinedText(this.options.cwd, params.path, params.content); return {};
      },
      createTerminal: async params => {
        this.checkNativeTool(); if (this.options.review) throw new Error("Review mode blocks terminal execution.");
        const cwd = confinedPath(this.options.cwd, params.cwd || this.options.cwd);
        if (!(await this.options.approve("Gemini command", [params.command, ...(params.args || [])].join(" "), this.signal))) throw new Error("Command declined.");
        this.check();
        const terminalId = randomUUID();
        const env = subscriptionEnv({ ...this.options.env, ...Object.fromEntries((params.env || []).map(e => [e.name, e.value])) });
        const child = spawn(params.command, params.args || [], { cwd, env, stdio: "pipe", detached: true });
        const terminal: Terminal = { child, output: "", truncated: false, limit: Math.min(params.outputByteLimit ?? 64_000, 256_000), done: Promise.resolve({}) };
        terminal.done = new Promise(resolve => {
          child.once("error", error => { terminal.output += String(error); terminal.exitStatus = { exitCode: 127 }; resolve(terminal.exitStatus); });
          child.once("close", (exitCode, signal) => {
            terminal.exitStatus = { exitCode, signal };
            try { this.options.terminalResult?.(terminalId, join(this.options.logDir, `terminal-${terminalId}.log`), exitCode); } catch { /* raw terminal log remains available */ }
            resolve(terminal.exitStatus);
          });
        });
        const receive = (chunk: Buffer) => {
          appendFileSync(join(this.options.logDir, `terminal-${terminalId}.log`), chunk, { mode: 0o600 });
          terminal.output += chunk.toString("utf8");
          while (Buffer.byteLength(terminal.output) > terminal.limit) { terminal.output = terminal.output.slice(Math.max(1, Math.floor(terminal.output.length / 10))); terminal.truncated = true; }
        };
        child.stdout.on("data", receive); child.stderr.on("data", receive);
        this.terminals.set(terminalId, terminal); return { terminalId };
      },
      terminalOutput: async params => { const t = this.terminal(params.terminalId); return { output: this.options.terminalResult?.(params.terminalId, join(this.options.logDir, `terminal-${params.terminalId}.log`), t.exitStatus?.exitCode) ?? t.output, truncated: t.truncated, exitStatus: t.exitStatus }; },
      waitForTerminalExit: async params => this.terminal(params.terminalId).done,
      killTerminal: async params => { this.kill(this.terminal(params.terminalId).child); return {}; },
      releaseTerminal: async params => { const t = this.terminal(params.terminalId); if (!t.exitStatus) this.kill(t.child); this.terminals.delete(params.terminalId); return {}; },
    };
  }
  private terminal(id: string): Terminal { const terminal = this.terminals.get(id); if (!terminal) throw new Error("Unknown terminal"); return terminal; }
  private kill(child: ChildProcessWithoutNullStreams): void {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    const timer = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already exited */ } }, 2000); timer.unref();
  }
  private async bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => { this.close(); reject(new Error("ACP timeout; inspect pending operations before retrying.")); }, timeoutMs); })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async start(): Promise<NewSessionResponse> {
    if (this.session) return this.session;
    mkdirSync(this.options.logDir, { recursive: true, mode: 0o700 });
    const child = spawn(this.options.command, this.options.args, { cwd: this.options.cwd, env: this.options.env, stdio: "pipe", detached: true });
    this.process = child;
    child.stderr.on("data", (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-8000); appendFileSync(join(this.options.logDir, "acp-stderr.log"), chunk, { mode: 0o600 }); });
    child.on("error", () => { /* stream closure rejects pending RPC requests */ });
    this.connection = new ClientSideConnection(() => this.client(), ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>));
    try {
      await this.bounded(this.connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "personal-harness", version: "0.2.0" }, clientCapabilities: this.options.managedToolsOnly ? {} : { fs: { readTextFile: true, writeTextFile: true }, terminal: true } }), 45_000);
      this.session = await this.bounded(this.connection.newSession({ cwd: this.options.cwd, mcpServers: this.options.mcpServers || [], _meta: this.options.sessionMeta }), 60_000);
      this.options.ready?.(this.session);
    } catch (error) {
      this.close();
      const detail = `${String(error)} ${this.stderr}`;
      if (/UNSUPPORTED_CLIENT|client is no longer supported/i.test(detail)) throw new Error("Google no longer supports this client for the account. Update the official ACP distribution; no paid fallback was attempted.");
      if (/invalid_grant|authentication required|credentials missing|login flow|authenticate the ACP/i.test(detail)) throw new Error("Google subscription authentication is required. Run ph login gemini for the official Antigravity ACP server.");
      throw error;
    }
    return this.session;
  }
  async prompt(text: string, signal?: AbortSignal): Promise<PromptResponse> {
    this.signal = signal;
    if (signal?.aborted) throw new Error("ACP request cancelled");
    const cancel = () => {
      if (this.session) void this.connection?.cancel({ sessionId: this.session.sessionId }).catch(() => { /* cancellation can race connection closure */ });
      this.close();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const session = await this.start();
      this.check();
      return await this.bounded(this.connection!.prompt({ sessionId: session.sessionId, prompt: [{ type: "text", text }] }), this.options.timeoutMs ?? 600_000);
    } finally { signal?.removeEventListener("abort", cancel); this.signal = undefined; }
  }
  close(): void {
    for (const terminal of this.terminals.values()) if (!terminal.exitStatus) this.kill(terminal.child);
    this.terminals.clear();
    if (this.process) { this.process.stdin.end(); this.kill(this.process); }
    this.session = undefined; this.connection = undefined; this.process = undefined;
  }
}
