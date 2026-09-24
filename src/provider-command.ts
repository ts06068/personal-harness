import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { profileDir } from "./paths.js";
import { atomicJson } from "./state.js";
import { confirmBilling } from "./config.js";
import { DEFAULT_PROVIDERS, enabledProviders, providerLabel, readProviders, validateProvider, writeProviders } from "./providers.js";

export async function providerCommand(action = "list", args: string[]): Promise<void> {
  if (action === "list") {
    console.log(enabledProviders().map(id => `${id}\t${providerLabel(id)}`).join("\n"));
    console.log("\nUse ph providers catalog for built-in routes. Nothing is enabled automatically."); return;
  }
  if (action === "catalog") {
    const { getBuiltinProviders } = await import("@earendil-works/pi-ai/providers/all");
    console.log(getBuiltinProviders().sort().join("\n")); return;
  }
  const idOrFile = args[0];
  if (!idOrFile) throw new Error("Usage: ph providers add PROVIDER_ID|FILE.json --allow-paid-api | --subscription --extra-usage-off\n       ph providers remove PROVIDER_ID");
  const providers = readProviders();
  if (action === "remove") {
    if (DEFAULT_PROVIDERS.includes(idOrFile as any)) throw new Error("Default subscription routes cannot be removed.");
    if (!providers.some(p => p.id === idOrFile)) throw new Error("Provider is not registered.");
    writeProviders(providers.filter(p => p.id !== idOrFile));
    const auth = join(profileDir, "auth.json");
    if (existsSync(auth)) { const credentials = JSON.parse(readFileSync(auth, "utf8")); delete credentials[idOrFile]; atomicJson(auth, credentials); }
    console.log(`Removed ${idOrFile} and its local credential. Provider-side tokens were not revoked.`); return;
  }
  if (action !== "add") throw new Error("Use ph providers list|catalog|add|remove.");
  const p = validateProvider(existsSync(idOrFile) ? JSON.parse(readFileSync(idOrFile, "utf8")) : {
    id: idOrFile, label: idOrFile, billing: args.includes("--subscription") ? "subscription" : "api",
  });
  if (p.billing === "api" && !args.includes("--allow-paid-api")) throw new Error("API routes may incur charges. Register explicitly with --allow-paid-api; subscription-only defaults remain unchanged.");
  if (p.billing === "subscription" && !(args.includes("--subscription") && args.includes("--extra-usage-off"))) throw new Error("Check your plan and disable extra usage, then pass --subscription --extra-usage-off. Only OAuth credentials are permitted on this route.");
  if (!p.baseUrl) {
    const { getBuiltinProviders } = await import("@earendil-works/pi-ai/providers/all");
    if (!(getBuiltinProviders() as string[]).includes(p.id)) throw new Error("Unknown built-in provider. Use ph providers catalog or a compatible-endpoint JSON file.");
  }
  writeProviders([...providers.filter(old => old.id !== p.id), p]);
  if (p.billing === "subscription") confirmBilling(p.id);
  console.log(`Registered ${providerLabel(p.id)}. Restart the agent and use /switch ${p.id}.`);
  if (p.billing !== "local") console.log(`Authenticate with ph login ${p.id}${p.apiKeyEnv ? ` or set ${p.apiKeyEnv}` : ""}. No model request was made.`);
}
