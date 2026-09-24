# Personal Harness implementation plan

Approved decisions (2026-09-24):

- General-purpose personal work: research, programming, manuscripts, software development, and hobby projects. No fixed research-only role.
- Primary commands: `ph`, `ph-edit` only. The repository is named `personal-harness`. Existing account and task stores remain in place when upgrading.
- Font-independent text labels for the default terminal UI.
- Ubuntu SSH workspace with Zellij and LazyVim.
- Pi is the initial host; compatibility takes priority over OMP-specific features.
- GPT, Claude, and Gemini are selectable primary workers. No permanent lead model.
- At rate limits: save state, stop, and let the user choose the next provider.
- Handoff uses the task brief, decisions, changes, results, and outstanding work.
  Full transcripts remain on disk and are not automatically replayed across providers.
- Subscription authentication only; no model API-key or paid gateway fallback.
- First milestone: workspace, three provider connections, handoff, and local records.
  R, Quarto, clinical pipelines, literature, mail, calendar, Drive, and OMP migration
  are later milestones.

## Architecture

Zellij (`edit`, `agent`, `run`) hosts LazyVim and Pi. GPT uses Pi's Codex OAuth
provider. Claude uses pi-claude-bridge and the official Claude Agent SDK.
Gemini uses a local TypeScript ACP provider calling the official Gemini CLI.
Claude and Gemini retain their own internal execution engines.

Implement `ph open`, `ph doctor`, provider login, and `/task`, `/switch`,
`/handoff`, `/review`, `/usage`. Persist state as atomic JSON plus JSONL events.
Only one writer may own a project. A provider switch waits for tools to settle,
checkpoints the current state, creates a new session, and waits for user input.
Uncertain operations are recorded and never silently replayed.

## Installation

Pin Pi 0.87.1, pi-claude-bridge 0.8.0, Gemini CLI 0.61.0, ACP SDK 1.5.0.
Use Node >=22.19 and Neovim >=0.11.2. Record exact runtime and plugin versions.
Keep executables, configuration, and credentials in persistent user storage.
Prepare repeatable system build-tool installation where sudo is needed; prefer
an equivalent user-local toolchain when root is unavailable. Preserve existing
configuration with explicit backups and a restore manifest.

## Verification and completion

Test safe handoff, rate limits without retries/fallback, pending operations,
project locks, credential-route rejection, ACP cancellation and tool execution,
editor startup, and terminal workspace reattachment. Use a synthetic Git fixture.
Each real provider must pass authenticated response/read/edit/test/cancel checks.
Record unverified checks honestly. Do not call three-provider integration complete
until the user's accounts have passed live tests.

Account-side extra usage and auto-refill require separate confirmation. Local
authentication guards do not prove account billing settings. Missing usage stays
unknown; estimates are labeled. No claim of OS-level sandboxing is made.
