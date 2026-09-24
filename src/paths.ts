import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const installHome = resolve(process.env.PH_INSTALL_HOME || homedir());
function persistentRoot(kind: "share" | "state"): string {
  const current = join(installHome, `.local/${kind}/personal-harness`);
  const previous = join(installHome, `.local/${kind}/research-harness`);
  return existsSync(previous) && !existsSync(current) ? previous : current;
}
export const dataRoot = process.env.PH_DATA_DIR || persistentRoot("share");
export const stateRoot = process.env.PH_STATE_DIR || persistentRoot("state");
export const editorApp = existsSync(join(installHome, ".config/research-nvim")) && !existsSync(join(installHome, ".config/personal-nvim")) ? "research-nvim" : "personal-nvim";
export const binDir = join(dataRoot, "bin");
export const profileDir = join(dataRoot, "pi");
export const configDir = join(dataRoot, "config");

export function privateDir(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

export function projectPath(path: string): string {
  return realpathSync(resolve(path));
}
