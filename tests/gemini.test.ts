import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { incrementalUserInput, registerGemini } from "../src/gemini.js";
import { TaskStore } from "../src/state.js";

test("incremental Gemini input never replays earlier user messages", () => {
  const first = { role: "user" as const, content: "first", timestamp: 1 }; const second = { role: "user" as const, content: "second", timestamp: 2 };
  const initial = incrementalUserInput({ messages: [first] }, []);
  assert.equal(incrementalUserInput({ messages: [first, second] }, initial.hashes).text, "second");
  assert.throws(() => incrementalUserInput({ messages: [second] }, initial.hashes), /history changed/);
});
test("two Gemini turns stream into the correct Pi response and cumulative usage is differenced", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ph-gemini-")); const store = new TaskStore(dir, dir);
  let config: any; let calls = 0; const sent: string[] = [];
  const bridge = registerGemini({ registerProvider: (_id: string, value: any) => { config = value; } } as any, store, () => undefined, () => false, options => ({
    sessionId: "fixture", close() {}, async prompt(text) { sent.push(text); calls++; options.update({ sessionId: "fixture", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `response-${calls}` } } }); return { stopReason: "end_turn", usage: { inputTokens: calls * 10, outputTokens: calls * 2, totalTokens: calls * 12 } }; },
  }));
  const model = { provider: "gemini-cli-acp", id: "cli-default", api: "gemini-cli-acp" };
  const first = { role: "user", content: "first request", timestamp: 1 }; const second = { role: "user", content: "second request", timestamp: 2 };
  const a = await config.streamSimple(model, { messages: [first] }).result();
  const b = await config.streamSimple(model, { messages: [first, a, second] }).result();
  assert.equal(a.content[0].text, "response-1"); assert.equal(b.content[0].text, "response-2");
  assert.equal(sent[1], "second request");
  const usage = readFileSync(join(store.dir, "usage.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(usage.map(row => row.input), [10, 10]); await bridge.reset();
});
