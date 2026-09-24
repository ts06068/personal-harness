import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve through Node, not repoRoot/node_modules: npm may hoist dependencies.
export const piRoot = dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
export const piCLIPath = join(piRoot, "dist/bundle/cli.js");
export const claudeCLIPath = join(dirname(fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk-linux-x64/package.json"))), "claude");
export const claudeExtensionPath = join(dirname(fileURLToPath(import.meta.resolve("pi-claude-bridge/package.json"))), "src/index.ts");
