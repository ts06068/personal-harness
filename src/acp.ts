import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type Client, type NewSessionResponse, type PromptResponse, type RequestPermissionRequest, type SessionNotification } from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { confinedPath, subscriptionEnv } from "./security.js";

export interface ACPOptions {
  command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; logDir: string;
  review?: boolean; timeoutMs?: number;
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
  private async permission(params: RequestPermissionRequest) {
    if (this.signal?.aborted) return { outcome: { outcome: "cancelled" as const } };
    const kind = params.toolCall.kind;
    const denied = this.options.review && !["read", "search", "think"].includes(kind || "");
    const accepted = !denied && await this.options.approve(params.toolCall.title || "Gemini tool", JSON.stringify(params.toolCall.rawInput ?? {}).slice(0, 4000), this.signal);
    if (!accepted || this.signal?.aborted) return { outcome: { outcome: "cancelled" as const } };
    const option = params.options.find(item => item.kind === "allow_once");
    return option ? { outcome: { outcome: "selected" as const, optionId: option.optionId } } : { outcome: { outcome: "cancelled" as const } };
  }
  private client(): Client {
    return {
      requestPermission: params => this.permission(params),
      sessionUpdate: params => this.options.update(params),
      readTextFile: async params => {
        this.check();
        const text = readFileSync(confinedPath(this.options.cwd, params.path), "utf8");
        if (Buffer.byteLength(text) > 2_000_000) throw new Error("File exceeds 2 MB; select a smaller input.");
        const lines = text.split("\n"); const start = Math.max(0, (params.line ?? 1) - 1);
        return { content: lines.slice(start, params.limit ? start + params.limit : undefined).join("\n") };
      },
      writeTextFile: async params => {
        this.check(); if (this.options.review) throw new Error("Review mode blocks file writes.");
        const path = confinedPath(this.options.cwd, params.path);
        // The native agent's requestPermission handles interactive consent.
        // Confined project writes are supported in work mode; no second dialog.
        this.check(); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, params.content); return {};
      },
      createTerminal: async params => {
        this.check(); if (this.options.review) throw new Error("Review mode blocks terminal execution.");
        const cwd = confinedPath(this.options.cwd, params.cwd || this.options.cwd);
        if (!(await this.options.approve("Gemini command", [params.command, ...(params.args || [])].join(" "), this.signal))) throw new Error("Command declined.");
        this.check();
        const terminalId = randomUUID();
        const env = subscriptionEnv({ ...this.options.env, ...Object.fromEntries((params.env || []).map(e => [e.name, e.value])) });
        const child = spawn(params.command, params.args || [], { cwd, env, stdio: "pipe", detached: true });
        const terminal: Terminal = { child, output: "", truncated: false, limit: Math.min(params.outputByteLimit ?? 64_000, 256_000), done: Promise.resolve({}) };
        terminal.done = new Promise(resolve => {
          child.once("error", error => { terminal.output += String(error); terminal.exitStatus = { exitCode: 127 }; resolve(terminal.exitStatus); });
          child.once("exit", (exitCode, signal) => { terminal.exitStatus = { exitCode, signal }; resolve(terminal.exitStatus); });
        });
        const receive = (chunk: Buffer) => {
          appendFileSync(join(this.options.logDir, `terminal-${terminalId}.log`), chunk, { mode: 0o600 });
          terminal.output += chunk.toString("utf8");
          while (Buffer.byteLength(terminal.output) > terminal.limit) { terminal.output = terminal.output.slice(Math.max(1, Math.floor(terminal.output.length / 10))); terminal.truncated = true; }
        };
        child.stdout.on("data", receive); child.stderr.on("data", receive);
        this.terminals.set(terminalId, terminal); return { terminalId };
      },
      terminalOutput: async params => { const t = this.terminal(params.terminalId); return { output: t.output, truncated: t.truncated, exitStatus: t.exitStatus }; },
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
    child.stderr.on("data", (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-8000); });
    child.on("error", () => { /* stream closure rejects pending RPC requests */ });
    this.connection = new ClientSideConnection(() => this.client(), ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>));
    await this.bounded(this.connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "personal-harness", version: "0.1.0" }, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true } }), 45_000);
    try { this.session = await this.bounded(this.connection.newSession({ cwd: this.options.cwd, mcpServers: [] }), 45_000); }
    catch (error) { this.close(); throw new Error(`${String(error)}${this.stderr ? " (See ph login gemini; CLI did not start a session.)" : ""}`); }
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
