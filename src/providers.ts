import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { configDir, privateDir } from "./paths.js";

export const DEFAULT_PROVIDERS = ["openai-codex", "claude-bridge", "gemini-cli-acp"] as const;
export const ALIASES: Record<string, string> = { chatgpt: "openai-codex", gpt: "openai-codex", claude: "claude-bridge", gemini: "gemini-cli-acp" };
export const DEFAULT_LABELS: Record<string, string> = {
  "openai-codex": "ChatGPT (subscription)", "claude-bridge": "Claude (subscription)", "gemini-cli-acp": "Gemini (subscription)",
};
export type ExtraProvider = {
  id: string; label: string; billing: "api" | "local" | "subscription";
  baseUrl?: string; api?: string; apiKeyEnv?: string;
  models?: { id: string; name?: string; contextWindow?: number; maxTokens?: number; reasoning?: boolean; input?: ("text" | "image")[] }[];
};
export const registryFile = () => join(configDir, "providers.json");
export function isSubscription(provider: string): boolean {
  return (DEFAULT_PROVIDERS as readonly string[]).includes(provider) || readProviders().find(p => p.id === provider)?.billing === "subscription";
}
export function isLoopback(url: URL): boolean { return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); }
export function validateProvider(value: unknown): ExtraProvider {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider configuration must be a JSON object.");
  const p = value as ExtraProvider;
  if (typeof p.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(p.id) || DEFAULT_PROVIDERS.includes(p.id as any) || p.id in ALIASES) throw new Error("Invalid or reserved provider ID.");
  if (!['api', 'local', 'subscription'].includes(p.billing)) throw new Error("billing must be api, local or subscription.");
  if (typeof p.label !== "string" || !p.label.trim() || p.label.length > 100 || /[\x00-\x1f]/.test(p.label)) throw new Error("A short provider label is required.");
  const allowed = ["id", "label", "billing", "baseUrl", "api", "apiKeyEnv", "models"];
  if (Object.keys(p).some(key => !allowed.includes(key))) throw new Error("Unknown provider field. Keys belong in ph login or a PH_MODEL_* environment variable, not this file.");
  if (p.baseUrl !== undefined) {
    const url = new URL(p.baseUrl);
    if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) throw new Error("Use a plain HTTP(S) endpoint without embedded credentials or query parameters.");
    if ((p.billing === "local" && !isLoopback(url)) || (url.protocol === "http:" && !isLoopback(url))) throw new Error("Local/plain-HTTP endpoints must use localhost, 127.0.0.1 or [::1].");
    if (!["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"].includes(p.api || "")) throw new Error("Choose a supported compatible API type.");
    if (!Array.isArray(p.models) || !p.models.length) throw new Error("Custom endpoints require explicit model IDs.");
    for (const model of p.models) {
      if (!model || typeof model.id !== "string" || !model.id.trim() || /[\x00-\x1f]/.test(model.id)) throw new Error("Invalid model ID.");
      if (Object.keys(model).some(k => !["id", "name", "contextWindow", "maxTokens", "reasoning", "input"].includes(k))) throw new Error("Unknown model field.");
      for (const k of ["contextWindow", "maxTokens"] as const) if (model[k] !== undefined && (!Number.isSafeInteger(model[k]) || model[k]! <= 0)) throw new Error(`Invalid ${k}.`);
      if (model.reasoning !== undefined && typeof model.reasoning !== "boolean") throw new Error("reasoning must be boolean.");
      if (model.name !== undefined && typeof model.name !== "string") throw new Error("Model name must be text.");
      if (model.input !== undefined && (!Array.isArray(model.input) || !model.input.length || model.input.some(v => !["text", "image"].includes(v)))) throw new Error("Invalid model input types.");
    }
  } else if (p.billing === "local" || p.api || p.models || p.apiKeyEnv) throw new Error("Custom/local configuration requires baseUrl, api and models.");
  if (p.billing === "subscription" && p.baseUrl) throw new Error("Additional subscription routes must use a built-in Pi OAuth provider.");
  if (p.apiKeyEnv && !/^PH_MODEL_[A-Z0-9_]+$/.test(p.apiKeyEnv)) throw new Error("Use a dedicated PH_MODEL_* variable; subscription runtimes must never inherit another provider's API key.");
  return JSON.parse(JSON.stringify(p));
}
export function readProviders(file = registryFile()): ExtraProvider[] {
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data)) throw new Error("Provider registry must be a JSON array.");
  const providers = data.map(validateProvider);
  if (new Set(providers.map(p => p.id)).size !== providers.length) throw new Error("Duplicate provider ID.");
  return providers;
}
export function writeProviders(providers: ExtraProvider[]): void {
  const file = registryFile(); privateDir(configDir);
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(providers.map(validateProvider), null, 2) + "\n", { mode: 0o600 }); renameSync(temp, file);
}
export function enabledProviders(): string[] { return [...DEFAULT_PROVIDERS, ...readProviders().map(p => p.id)]; }
export function providerLabel(id: string): string {
  const p = readProviders().find(p => p.id === id);
  return DEFAULT_LABELS[id] || (p ? `${p.label} (${p.billing === "api" ? "API · charges possible" : p.billing})` : id);
}
export function customModels(providers = readProviders()): object {
  return { providers: Object.fromEntries(providers.filter(p => p.baseUrl).map(p => [p.id, {
    baseUrl: p.baseUrl, api: p.api, models: p.models,
    ...(p.apiKeyEnv ? { apiKey: `\${${p.apiKeyEnv}}` } : p.billing === "local" ? { apiKey: "local-no-key" } : {}),
  }])) };
}
