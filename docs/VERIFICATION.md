# Verification and limits

Verified on Ubuntu 26.04, Linux x86_64, on **2026-09-25 (Asia/Seoul)**. Version 0.2 includes real model calls as well as local tests. Authentication, inference, account billing, and Windows visual appearance are distinct checks.

## Automated and runtime checks

- TypeScript compilation and **30 automated tests passed**. Tests cover dangling, cyclic and escaping symlinks; overlapping directory/Git worktree locks; orphan-worker leases; interrupted-operation reconciliation; v1 task migration; warning retention from the middle of large and older logs; and UTF-8 byte budgets and paging.
- Instruction approvals bind exact contents and imported files. Checkpoint proposals remain pending until user approval; stale proposals are rejected. Cross-task artifact reads, malformed paging and unauthorized MCP requests are rejected.
- The real loopback MCP implementation was tested for review restrictions, task isolation, full command output capture before compaction, failed exit status, and shared artifact/checkpoint tools. The native Google workspace stays empty of project context, and unmanaged global context is rejected.
- Synthetic ACP tests exercise negotiation, permission requests, cancellation and a single surfaced quota error. Managed Google sessions advertise no native filesystem or terminal capabilities; unexpected native read/write/execute callbacks are rejected without side effects. Named harness MCP tools still work through the parent guard.
- A real Pi RPC process loads the extensions and replaces worker/review sessions correctly. This particular test makes no model calls.
- UI tests cover narrow/Korean terminal widths, timer cleanup, motion off and non-TUI operation. RPC/JSON/print modes install no decorative widgets or animation timers.

Pinned runtime versions: Node 22.22.1; Pi/pi-ai/pi-tui 0.87.1; Claude bridge 0.8.0; Claude Agent SDK 0.3.267 / Claude Code 2.1.267; Google Antigravity ACP 1.2.1; ACP SDK 1.5.0; MCP SDK 1.30.1; Neovim 0.11.6; Zellij 0.45.1; zjstatus 0.25.0. Download provenance is in [installed-tools.json](../verification/installed-tools.json) and the installers. The earlier editor bootstrap also verified LazyVim 16.0.1, a compiled Python parser, Zig 0.15.2 / clang 20.1.2 and tree-sitter CLI 0.27.0.

## Real subscription worker checks

These checks used disposable synthetic projects and the existing subscription logins. Each worker read a small Python implementation, corrected a subtraction bug, ran an unchanged validation script, preserved a warning in the middle of roughly 80 KB of output, proposed a checkpoint, and completed a read-only review using the saved raw-result reader. The test driver approved only the synthetic fixture operations and its checkpoint. A separate streamed response was cancelled for each provider.

| Worker | Model reported in the successful run | Read/edit/run | Warning and raw-result review | Checkpoint and cancellation |
| --- | --- | --- | --- | --- |
| GPT | `gpt-6-sol` | Passed | Passed | Passed |
| Claude | `claude-sonnet-4-6` | Passed | Passed | Passed |
| Gemini via official Antigravity ACP | `gemini-3.8-flash-high` | Passed | Passed | Passed |

After Gemini completed its task, the same task was handed to GPT and then Claude for read-only review. Both retrieved the warning marker and validation result while preserving the task ID, approved decisions and project files. This is a real cross-provider handoff check; it does not imply that all model combinations or future service errors have been tested.

The first GPT/Claude run passed while the old Google path failed. Google was tested again after migration and the user's new Antigravity login; the table combines those successful provider runs. Earlier Gemini CLI session creation and any test before the authentication correction are **not** counted as subscription inference verification.

### Google transport correction

Gemini CLI 0.61.0 ignored the former user-owned system settings file. Enforcing its actual personal OAuth path first exposed an expired login, then Google's `UNSUPPORTED_CLIENT` response for this individual account. Version 0.2 therefore uses Google's **unmodified Antigravity ACP 1.2.1** distribution, separate personal OAuth store and official external-agent interface. Tokens are not copied between clients.

Google's native tools are disabled with the pinned server's session tool filter. It runs in an empty private metadata directory and reaches the actual project only through the authenticated parent-owned MCP server. Approved instructions are passed explicitly. The local `gemini-cli-acp` route ID remains for compatibility with saved tasks/billing confirmations; `cli-default` is only a picker alias. The observed model comes from the official ACP session configuration, not that alias. The successful server response did not provide usable token/context counts; those remain unknown.

Account extra usage, paid credits and automatic refill were confirmed disabled by the user. The launcher excludes alternate API credentials, and the pinned Google consumer transport does not opt into extra-credit fallback. **Account dashboards or charges were not independently audited.** These checks do not measure subscription quota percentages or establish token savings.

## Terminal appearance checks

- Real Neovim startup and terminal rendering passed. Normal, floating, tree, picker and status backgrounds use the terminal default; code syntax remains colored. Nerd Font glyphs were emitted. This verifies server output, not the Windows screen.
- Real Pi TUI rendering displayed the monochrome header and footer, a brief startup transition, and no continuing idle animation. Activity uses a 10 fps timer; startup/completion transitions stop after their short duration. Motion off and shutdown release timers. Animation makes no model requests.
- A disposable Zellij workspace displayed the new transparent top/bottom bars and the edit/agent/run tabs. zjstatus 0.25.0 was downloaded once and its SHA-256 verified. This release requests ReadApplicationState, ChangeApplicationState and RunCommands even though the configuration contains no command widget.
- Zellij 0.45.1 live layout replacement was tested only in a disposable session. It can duplicate running panes while trying to match their commands, so live replacement is not exposed. Existing user sessions were preserved; new sessions receive the new layout. Restart settled agent/editor processes to load updated code.
- The Windows Terminal profile fragment sets acrylic and 80% opacity. The server cannot apply or visually verify Windows desktop settings. VS Code's integrated terminal is separate. Follow the README on the local computer and check the result there.

## Reproduce the checks

From the repository after bootstrap:

```sh
task_data=$(python3 scripts/install_paths.py data)
export PATH="$task_data/bin:$PATH"
npm run build
npm test
ph doctor
ph-edit --headless '+lua print("EDITOR_STARTUP_OK")' +qa
```

The opt-in live test consumes subscription allowance. After login and billing confirmation, run only the providers you intend to test:

```sh
node scripts/verify-live.mjs gpt claude gemini
```

It creates a disposable project and isolated task state under the system temporary directory, prints each outcome, and writes a private report and RPC log there. It does not change account settings. Reports can contain prompts and tool outputs; keep them private. Repeat a manual `/switch` or `/review` on the same synthetic task to inspect cross-provider continuity. Use simulated quota failures rather than deliberately exhausting an account.

For an interactive check, open a disposable project with `ph open .`, visit each tab, edit and save a file, detach and reattach. Do not end an active working session merely to test restoration or refresh decorations. Machine-specific logs, state, screenshots and backups remain excluded from Git.

## Remaining limits

- Path guards and review mode are not an OS sandbox against another process with the same Unix identity. The final file-write guard does not eliminate all ancestor-directory races; approved shell commands and plugins retain user filesystem/network access.
- Warning extraction is heuristic. Full outputs and the warning index are retrievable, but an absent warning is not proof that code or an analysis is correct. Historical output unavailable in a v1 event log cannot be reconstructed during migration.
- Handoffs are bounded to 16 KiB, approved instructions to 8 KiB, and ordinary result summaries to 8 KiB. Raw artifacts remain private and can be read in bounded pages. These limits are not a measured end-to-end token reduction.
- Google accepts text inputs and selected files; image attachments are rejected. ACP turns time out after 10 minutes. Run long jobs independently and reconcile unknown outcomes before retrying.
- Harness retries and paid fallback are disabled. Official Claude/Google engines still own internal retries, prompts and compaction; future provider quota/error variants need operational monitoring.
- Only reported usage/context values are displayed as known. Alerts at 70%/85% require a valid gauge; the Google picker's placeholder context window is never treated as measured usage or account quota.
- R/Quarto, literature, mail/calendar/Drive tools, OS isolation and OMP migration remain future work. No before/after benchmark of total subscription use or user rework has been completed.

## Earlier font validation (2026-09-24)

- Installed JetBrainsMono Nerd Font Mono 3.5.1 (regular, bold, italic, bold italic) and Noto Color Emoji 2.051 for the Linux user; every font and license download matched its pinned SHA-256 hash.
- Fontconfig resolved the exact requested families. All 27 tested Nerd Font codepoints (the rendered Neovim icons plus diagnostic samples) exist in all four styles. The four emoji samples exist in Noto Color Emoji.
- Python utility syntax, JSON manifests, and `git diff --check` passed. Neovim headless startup passed.
- An isolated PowerShell 7.6.6 runtime parsed `install-fonts-windows.ps1`, compiled its C# font API wrapper, and checked the four downloaded font hashes. It did **not** execute Windows font registration or test Windows PowerShell 5.1 on Windows.
- The active server's VS Code Remote terminal setting names the new font and OS emoji fallbacks. The Windows desktop filesystem is not accessible from this server; Windows installation, the local VS Code/SSH terminal's selected font, and the resulting visible glyphs must be confirmed on that computer. Installing server fonts alone cannot validate them.

After local font installation and terminal configuration, run `python3 scripts/check-icons.py` from this repository in each client. Confirm the displayed shapes visually. Save and restart Neovim after applying the new editor configuration; an existing process retains the previous ASCII plugin options.
