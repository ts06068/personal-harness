import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { googleACP, harnessEnv } from "./config.js";

// Google's own server performs OAuth, PKCE, token exchange and storage. The
// launcher only forwards an optional loopback callback pasted in this terminal.
export async function loginGoogle(): Promise<void> {
  const child = spawn(googleACP, ["--uid="], { env: harnessEnv(), stdio: "pipe", detached: true });
  let pending = ""; let callback: URL | undefined; let state: string | null = null;
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const stop = () => { try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* exited */ } };
  process.once("SIGINT", stop);
  child.stderr.on("data", (data: Buffer) => {
    pending += data.toString();
    const lines = pending.split("\n"); pending = lines.pop() || "";
    for (const line of lines) {
      const url = /Open the following link to authenticate the ACP server: (https:\/\/\S+)/.exec(line)?.[1];
      if (!url) continue;
      const auth = new URL(url); callback = new URL(auth.searchParams.get("redirect_uri")!); state = auth.searchParams.get("state");
      console.log(`\nOpen this Google sign-in link in your local browser:\n${url}\n\nFor SSH, forward port ${callback.port} to the server (VS Code Ports, or ssh -L ${callback.port}:127.0.0.1:${callback.port} YOUR_HOST).\nIf the browser cannot reach localhost after sign-in, paste its complete redirect URL here. Do not paste it into chat or a project file.\nWaiting for Google authentication...`);
    }
  });
  input.on("line", line => {
    if (!line.trim()) return;
    void (async () => {
      try {
        const url = new URL(line.trim());
        if (!callback || url.origin !== callback.origin || url.pathname !== callback.pathname || !state || url.searchParams.get("state") !== state) throw new Error("Callback does not match this login attempt.");
        if (!url.searchParams.has("code") && !url.searchParams.has("error")) throw new Error("Paste the final localhost redirect URL from the browser.");
        await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
      } catch (error) { console.error(error instanceof Error ? error.message : "Invalid callback."); }
    })();
  });
  child.on("error", () => {});
  const connection = new ClientSideConnection(() => ({ requestPermission: async () => ({ outcome: { outcome: "cancelled" as const } }), sessionUpdate: async () => {} }), ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>));
  const timer = setTimeout(stop, 360_000);
  try {
    await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "personal-harness", version: "0.2.0" }, clientCapabilities: {} });
    await connection.authenticate({ methodId: "oauth-personal" });
    console.log("Google Antigravity subscription login completed. No model was called.");
  } finally { clearTimeout(timer); input.close(); process.removeListener("SIGINT", stop); child.stdin.end(); stop(); }
}
