import { createInterface } from "node:readline";
import { writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
const pending = new Map(); let seq = 100;
const send = value => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n");
const request = (method, params) => new Promise((resolve, reject) => { const id = seq++; pending.set(id, { resolve, reject }); send({ id, method, params }); });
const text = value => send({ method: "session/update", params: { sessionId: "fixture", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: value } } } });
createInterface({ input: process.stdin }).on("line", async line => {
  const message = JSON.parse(line);
  if (!message.method) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p?.reject(new Error(message.error.message)) : p?.resolve(message.result); return; }
  const { id, method, params } = message;
  try {
    if (method === "initialize") { writeFileSync("capabilities.json", JSON.stringify(params.clientCapabilities)); return send({ id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } }); }
    if (method === "session/new") { writeFileSync("session-meta.json", JSON.stringify(params._meta || {})); return send({ id, result: { sessionId: "fixture" } }); }
    if (method === "session/cancel") return;
    if (method !== "session/prompt") return send({ id, error: { code: -32601, message: "Unknown method" } });
    const prompt = params.prompt[0].text;
    appendFileSync(join(process.cwd(), "requests.jsonl"), JSON.stringify(prompt) + "\n");
    if (prompt === "HANG") return;
    if (prompt === "QUOTA") return send({ id, error: { code: -32000, message: "429 RESOURCE_EXHAUSTED" } });
    if (prompt === "FILES") {
      const result = await request("fs/read_text_file", { sessionId: "fixture", path: join(process.cwd(), "input.txt") });
      await request("fs/write_text_file", { sessionId: "fixture", path: join(process.cwd(), "output.txt"), content: result.content });
      text("copied");
    } else if (prompt === "WRITE") {
      await request("fs/write_text_file", { sessionId: "fixture", path: join(process.cwd(), "output.txt"), content: "native write must be blocked" });
    } else if (prompt === "TERMINAL") {
      const t = await request("terminal/create", { sessionId: "fixture", command: process.execPath, args: ["-e", "require('fs').writeFileSync('terminal-ran.txt', 'once'); console.log('executed-once')"], cwd: process.cwd(), outputByteLimit: 1024 });
      await request("terminal/wait_for_exit", { sessionId: "fixture", terminalId: t.terminalId });
      const output = await request("terminal/output", { sessionId: "fixture", terminalId: t.terminalId }); text(output.output);
      await request("terminal/release", { sessionId: "fixture", terminalId: t.terminalId });
    } else if (prompt === "PERMISSIONS") {
      for (const call of [{ title: "ph_read", kind: "other", _meta: { mcp: { server: "ph", tool: "read" } } }, { title: "foreign_read", kind: "other", _meta: { mcp: { server: "foreign", tool: "read" } } }, { title: "native shell", kind: "execute" }]) {
        const response = await request("session/request_permission", { sessionId: "fixture", toolCall: { toolCallId: String(seq), ...call }, options: [{ optionId: "once", name: "Allow once", kind: "allow_once" }] });
        text(response.outcome.outcome + "\n");
      }
    } else if (prompt === "ESCAPE") {
      try { await request("fs/read_text_file", { sessionId: "fixture", path: "/etc/passwd" }); text("unexpected"); } catch { text("denied"); }
    } else text(prompt);
    send({ id, result: { stopReason: "end_turn" } });
  } catch (error) { send({ id, error: { code: -32603, message: String(error) } }); }
});
