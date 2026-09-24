# Personal Harness implementation plan

Approved scope (2026-09-25): a general-purpose SSH workspace for programming,
research, writing and personal projects. Keep Pi, Neovim and Zellij. ChatGPT, Claude
and Gemini remain manually selectable primary workers. At a rate limit, save,
stop and let the user select another worker. Subscription-only defaults remain;
API/local providers require explicit registration and are never automatic fallback.

## Hardening

- Resolve every existing path component; reject dangling, cyclic and escaping
  symlinks. Use the checked path in Pi tools and ACP; guard new ACP file writes.
- Lock a Git worktree root or canonical directory and reject overlapping active
  scopes. Preserve separate worktrees and live orphan-worker leases.
- Migrate v1 tasks with a private backup. Store complete available results as
  immutable task-scoped artifacts. Preserve exit codes, warning signals and
  reconciliation notes without overwriting original evidence.
- Limit handoffs to 16 KiB and instruction packets to 8 KiB. Include open warning
  counts and complete-index references even when excerpts cannot fit. Expose
  read_task_artifact with bounded UTF-8 paging in work and review modes.

## Instructions and checkpoints

- /instructions previews explicit project files and records a content-bound
  approval. Changes require review. Prevent implicit native project context loading,
  including imported files. Google uses an empty native metadata workspace and a dedicated global profile; project access goes through managed MCP.
- The current worker can propose_checkpoint during an ordinary turn. /checkpoint
  lets the user approve, edit or reject it. Proposals never approve themselves;
  no additional summarizer model is called.
- Share these tools through Pi for ChatGPT/Claude and a managed authenticated loopback HTTP MCP
  server for Gemini, owned by the parent so tools cannot race task-state writes.
- Preserve raw tool outputs before reducing model-facing output to 8 KiB.
  Use Pi result hooks and the parent-owned Google MCP tool path. Record real
  usage/model information where available; unknown remains unknown.
- Warn at 70%/85% only when the context gauge is known. Do not interpret Gemini's
  local picker alias or placeholder window as a measured model or account quota.

## Transparent monochrome UI

- Use Grok-inspired white/gray UI, retaining code syntax colors and limited
  warning/error highlights. Keep Nerd Font icons. All application backgrounds,
  including editor floats and workspace bars, use the terminal default.
- Use pinned zjstatus 0.25.0 for transparent Zellij bars; do not configure its
  command widgets. Document its actual requested permissions.
- Provide Windows Terminal profile settings with acrylic enabled and opacity
  80. The Windows client must apply them; VS Code is a separate renderer.
- Add a short startup wordmark, work/tool activity and completion transitions.
  Maximum 12 fps; no idle animation loop or model calls for decoration. Provide
  /ui motion full|reduced|off and disable TUI decoration in RPC/JSON/print modes.
- Apply bars to new workspaces and retain existing sessions. Runtime validation
  rejected live layout replacement: Zellij can duplicate panes when matching
  running commands. Do not force-quit editors or agents for a UI refresh.

## Verification and rollout

Execute regression tests for path escapes, overlapping locks, warning retention,
Unicode budgets/paging, v1 migration, instruction approval, stale proposals,
MCP task isolation, native Google profile isolation, cancellation and non-TUI rendering.
Check real editor rendering and a disposable Zellij session before updating
the managed layout for future sessions. Preserve existing credentials and legacy storage locations.

Use synthetic projects for real ChatGPT/Claude/Gemini response, read, edit, execution,
cancel, handoff and review checks. Simulate quota exhaustion. Compare the same
task/model's total usage and quality before making efficiency claims. Distinguish
runtime checks, real inference, account attestations and Windows visual checks in
docs/VERIFICATION.md. Keep logs, artifacts, credentials and UI backups private.

Keep the README and operational documentation in English, with Getting Started,
actual key sequences, the new commands, Windows appearance setup and recovery.
R/Quarto, literature, mail/calendar/Drive, OS isolation and OMP migration remain
later milestones. This is not an OS sandbox against another process running as
the same Unix user.

## Verified implementation adjustment: Google transport

On 2026-09-25, corrected Gemini CLI OAuth settings exposed Google's
`UNSUPPORTED_CLIENT` rejection for this individual account. Replace Gemini CLI
with Google's official Antigravity ACP 1.2.1 distribution from the ACP registry.
Pin the archive hash, use `oauth-personal`, disable native tools via the supported
`_meta.agy.enabledTools` filter, and advertise no client filesystem or terminal
capabilities. Keep the legacy `gemini-cli-acp` route ID only for stored tasks and
billing attestations. The new official credential store requires a separate
login; tokens are not copied. Missing usage is recorded as unknown. See the
verification report for the actual completed live checks and remaining limits.

## Distribution and model registration (version 0.3)

Approved follow-up scope: easy installation; Windows native or WSL operation;
ChatGPT naming; and additional providers through explicit API/local registration.
Use Linux x86_64 on Linux or Windows x64 through WSL2 Ubuntu 24.04+. Native Windows
and ARM64 execution are not implemented in this release.

- Package compiled JavaScript, configuration and runtime installers with an npm
  bin entry and published shrinkwrap. Resolve dependencies through Node so npm
  hoisting works outside the source checkout.
- Distribute a versioned npm tarball with SHA256SUMS through a GitHub Release.
  Support direct npm installation and a Python installer that also installs Node.
  Short-name npm registry publication is separate from this release.
- Add a PowerShell WSL2 setup flow, preserving existing distributions and Terminal
  settings. Install the font and a dedicated acrylic Terminal profile for the
  current Windows user. WSL has separate provider logins.
- Use ChatGPT in commands and labels, retaining gpt as a compatibility alias.
  Preserve actual provider/model IDs and existing accounts/tasks.
- Add explicit provider registration, Pi catalog discovery, compatible endpoints
  and local loopback servers. API registration requires --allow-paid-api; display
  its billing type. Additional subscriptions require OAuth and an account
  attestation. Never copy credentials between workers or select a fallback.
- Keep README content to installation/use, shortcuts and tutorials. Move
  architecture, operations, distribution details and test evidence into docs/.

Validation: run regression tests, a real Pi request against a local compatible
fixture, simulated 429 handling, production-only tarball installation outside
the checkout and first editor startup. Test PowerShell parsing/control flow
without claiming that mocked WSL commands are actual Windows execution.
