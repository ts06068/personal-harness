import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { configDir, privateDir } from "./paths.js";
import { atomicJson, type TaskStore } from "./state.js";
import { readProviders } from "./providers.js";

export type Motion = "full" | "reduced" | "off";
export function isMotion(text: string): text is Motion { return ["full", "reduced", "off"].includes(text); }
export function readMotion(file = join(configDir, "ui.json")): Motion {
  if (existsSync(file)) { try { const value = JSON.parse(readFileSync(file, "utf8")).motion; if (isMotion(value)) return value; } catch { /* use default */ } }
  return "full";
}
export function contextPercent(ctx: ExtensionContext, store: TaskStore): number | undefined {
  if (ctx.model?.provider === "gemini-cli-acp") {
    const gauge = store.task.contextGauge;
    return gauge && gauge.size > 0 ? Math.round(gauge.used / gauge.size * 100) : undefined;
  }
  return ctx.getContextUsage()?.percent ?? undefined;
}
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export class HarnessUI {
  private ctx?: ExtensionContext;
  private timer?: ReturnType<typeof setInterval>;
  private render = () => {};
  private frame = 0;
  private busy = false;
  private started = 0;
  private decorUntil = 0;
  private activity = "ready";
  private motion: Motion;
  private enabled = false;
  constructor(private store: TaskStore, private review: () => boolean, private tty = () => Boolean(process.stdout.isTTY), private settingsFile = join(configDir, "ui.json")) { this.motion = readMotion(settingsFile); }
  get animating(): boolean { return this.timer !== undefined; }
  attach(ctx: ExtensionContext): void {
    this.dispose(); this.ctx = ctx;
    this.enabled = ctx.mode === "tui" && this.tty();
    if (!this.enabled) return;
    // One animation owner. Disable Pi's loader animation, including in motion=off.
    ctx.ui.setWorkingIndicator({ frames: [] }); ctx.ui.setWorkingVisible(false);
    ctx.ui.setTitle(`Personal Harness · ${basename(this.store.project)}`);
    ctx.ui.setHeader((_tui, theme) => ({ invalidate() {}, render: width => {
      const word = "PERSONAL HARNESS";
      const active = this.motion === "full" && !this.busy && Date.now() < this.decorUntil;
      const text = active ? [...word].map((c, i) => theme.fg(i === this.frame % word.length ? "text" : "muted", c)).join("") : theme.bold(theme.fg("text", word));
      return [truncateToWidth(text + theme.fg("muted", `  /  ${basename(this.store.project)}`), width), truncateToWidth(theme.fg("dim", "/switch  /task  /checkpoint  /instructions  /ui"), width)];
    } }));
    ctx.ui.setFooter((tui, theme, footer) => {
      this.render = () => tui.requestRender();
      const unsubscribe = footer.onBranchChange(this.render);
      return { invalidate() {}, dispose: () => { unsubscribe(); this.dispose(); }, render: width => {
        const provider = ctx.model?.provider;
        const model = provider === "gemini-cli-acp" ? this.store.task.observedModel || "Gemini / model unknown" : ctx.model?.id || "choose /switch";
        const gauge = contextPercent(ctx, this.store);
        const spinner = this.busy ? (this.motion === "full" ? frames[this.frame % frames.length] : "·") : "·";
        const elapsed = this.busy ? ` ${Math.floor((Date.now() - this.started) / 1000)}s` : "";
        const native = footer.getExtensionStatuses().get("ph-tool");
        const status = `${spinner} ${this.busy ? native || this.activity : this.activity}${elapsed}`;
        const warnings = this.store.openWarnings().length;
        const billing = readProviders().find(p => p.id === provider)?.billing;
        const line = `${this.review() ? "REVIEW" : "WORK"}${billing ? ` [${billing.toUpperCase()}]` : ""}  ${model}  |  ${status}  |  context ${gauge === undefined ? "unknown" : `${Math.round(gauge)}%`}  |  pending ${this.store.unresolved().length} · warnings ${warnings}`;
        return [truncateToWidth(theme.fg(this.store.task.status === "rate_limited" ? "warning" : "muted", line), width)];
      } };
    });
    this.pulse("ready", 600);
  }
  setMotion(motion: Motion): void {
    this.motion = motion; privateDir(dirname(this.settingsFile)); atomicJson(this.settingsFile, { motion });
    this.schedule(); this.render();
  }
  start(): void { this.busy = true; this.started = Date.now(); this.activity = "working"; this.schedule(); this.render(); }
  tool(name: string): void { this.activity = name; this.render(); }
  settled(): void { this.busy = false; this.pulse(this.store.task.status === "rate_limited" ? "limit reached · /switch" : "saved · /checkpoint", 450); }
  pulse(label: string, ms = 450): void { this.activity = label; this.decorUntil = Date.now() + ms; this.schedule(); this.render(); }
  private schedule(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    if (!this.enabled || this.motion !== "full" || (!this.busy && Date.now() >= this.decorUntil)) return;
    this.timer = setInterval(() => {
      this.frame++; this.render();
      if (!this.busy && Date.now() >= this.decorUntil) { clearInterval(this.timer); this.timer = undefined; }
    }, 100); // 10 fps, below the 12 fps budget
    this.timer.unref();
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.enabled = false; }
}
