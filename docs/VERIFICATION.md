# Verification and limits

Verified on Ubuntu 26.04, Linux x86_64, on **2026-09-25 (Asia/Seoul)**. Version 0.3.1 adds failed/interrupted command checks, including real calls with all three subscriptions. Historical version 0.2 and 0.3 checks are labeled separately below. Authentication, inference, account billing, and Windows visual appearance are distinct checks.

## Version 0.3.1 execution outcomes

- The TypeScript build and **41 automated tests passed**. A shared managed bash implementation captures stdout/stderr bytes before Pi truncates results or converts failures into exceptions. Tests reconstruct the exact UTF-8 output through artifact pages on success and exit codes 1/7, including warnings in the middle of large output.
- Cancellation and timeout after execution starts produce `unknown`, retain partial output, and block new execution, task replacement, `/switch` and `/review` until observed reconciliation. Rejected/pre-execution calls and known nonzero exits remain `failed`. Late events cannot replace finalized outcomes or artifacts; a completed concurrent command remains completed.
- Real subprocess tests create a partial file before cancellation/timeout and confirm the final file is absent. Unknown state survives reopening the task store. A real Pi RPC process exercises the extension/event pipeline with only the model transport replaced by a deterministic fixture; the blocked follow-up makes no model request. MCP tests exercise the same commands and approval/cancellation paths.
- Gemini teardown now waits for in-flight MCP executions to save partial output before publishing the final model event. A dedicated regression test cancels a running command through MCP shutdown and verifies its artifact is available when shutdown returns. An unknown tool outcome interrupts the native model turn.
- Task schema version 2 is retained. Previously recorded failures are not guessed to be cancellations. Existing reconciliation commands remain valid.

### Real subscription checks (version 0.3.1)

Each worker corrected a synthetic Python function, ran the unchanged validation script, and proposed a checkpoint. It then ran a command that produced approximately 156 KB of output with a middle warning and exited with code 7. The saved artifact matched the full expected output exactly. Separate partial-write commands were cancelled and timed out; both preserved their warning/output and blocked switching/review until the test driver recorded the observed partial file, missing final file and terminated command. Cancelling a response without tools created no unresolved operation.

| Worker | Observed model | Failed full log | Partial-write cancellation and timeout | Read-only reviewer |
| --- | --- | --- | --- | --- |
| ChatGPT | `gpt-6-sol` | Passed | Passed | Claude `claude-sonnet-4-6` |
| Claude | `claude-sonnet-4-6` | Passed | Passed | Gemini `gemini-3.8-flash-high` |
| Gemini via Antigravity ACP | `gemini-3.8-flash-high` | Passed | Passed | ChatGPT `gpt-6-sol` |

Every reviewer retrieved the required original pages during the review segment and reported the designated failure warning, exit code 7 and `VALIDATION_OK=5`. The implementation file remained unchanged during review. These assertions check the fixture facts, not the general accuracy of model reviews.

The first run passed ChatGPT and Claude and exposed a Gemini cancellation-order defect. After the MCP drain fix and the complete 41-test run, Gemini's full workflow was repeated successfully with ChatGPT review. The table combines those successful runs; it does not claim that all three were rerun after the Gemini-specific fix. The test driver also now approves one fixture checkpoint and rejects additional proposals, preserving the runtime's stale-proposal rejection policy.

### Distribution checks (version 0.3.1)

- The release tarball was installed outside the checkout using `scripts/install.py --archive ... --sha256 ... --skip-editor-plugins`. Setup and `ph doctor` passed with isolated launchers, configuration and state, reusing verified pinned tool binaries. Editor plugin restoration was deferred; this patch does not change editor configuration.
- Four package-runtime checks passed against that installed CLI, including fresh Pi worker/review sessions and the loopback compatible-provider quota fixture. A task created by the published 0.3.0 package retained its ID, goal, approved decision and exact original artifact after installation. Its legacy failed operation stayed failed without an invented termination reason.
- PowerShell 7.6.6 passed the installer-flow tests with mocked WSL/download commands, including failure paths and preservation of terminal settings. This is not Windows desktop, real WSL, font registration or Windows PowerShell 5.1 validation.
- Package contents use the existing allowlist; no account credentials, task artifacts or private live-test logs are distributed. Version 0.3.0 assets remain unchanged. npm registry publication is separate from the versioned GitHub release.

## Version 0.3 distribution and provider checks

- The complete TypeScript build and 33 automated tests passed. ChatGPT is the displayed/default command name; the legacy gpt alias and real model/provider IDs are preserved.
- A real Pi RPC process used an explicitly registered OpenAI-compatible endpoint served by a local test fixture. It received a streamed response, then stopped after a synthetic 429. Exactly two fixture requests were observed across the two turns; there was no fallback or retry. This is a transport test, not a paid-provider or local-model quality benchmark.
- CLI tests reject API registration without --allow-paid-api, reserved subscription route overrides, plaintext credentials in registration JSON and remote endpoints mislabeled as local. The original three subscription routes remain enabled after registration/removal.
- Both prefix-local and global npm tarball installations outside the checkout resolved Pi, the Claude bridge and its official executable. The global package also completed ph setup with a fresh editor profile, using only previously verified tool binaries/cache. The installed CLI passed real Pi session/review replacement and the compatible-endpoint fixture tests. No saved account credentials were copied into the test profile.
- Workspace setup was run in an isolated installation home, including pinned runtimes, LazyVim restoration and parser compilation. Initial testing exposed background parser installation and first-start runtime discovery problems. The corrected setup waits for installation, refreshes discovery and loads all nine required parsers before reporting success; a failed Lua check exits nonzero. Fresh-parser and repeated setup checks passed.
- PowerShell 7.6.6 parsed and executed the installer test with mocked WSL/download commands. It covered a ready WSL2 user, missing distribution, WSL1, root user, failed Linux setup, pinned font files and preservation of existing terminal settings. This did not run WSL, register Windows fonts, test Windows PowerShell 5.1 or visually verify acrylic on a Windows desktop.
- README contains installation/use, shortcuts and tutorials. Implementation, registration details and distribution limits are kept in separate docs. The npm tarball uses an explicit files allowlist and publishable shrinkwrap; private profiles, sessions and verification logs are excluded.

Windows support in this release means Windows x64 through WSL2 Ubuntu 24.04+. Native Windows and ARM64 runtime installers remain unimplemented. Other provider catalogs and compatible protocols are configurable, but each account, endpoint and model still needs its own operational validation.

## Automated and runtime checks

- TypeScript compilation and **41 automated tests passed** in version 0.3.1. Tests cover dangling, cyclic and escaping symlinks; overlapping directory/Git worktree locks; orphan-worker leases; interrupted-operation reconciliation; v1 task migration; warning retention from the middle of large and older logs; and UTF-8 byte budgets and paging.
- Instruction approvals bind exact contents and imported files. Checkpoint proposals remain pending until user approval; stale proposals are rejected. Cross-task artifact reads, malformed paging and unauthorized MCP requests are rejected.
- The real loopback MCP implementation was tested for review restrictions, task isolation, full command output capture before compaction, failed exit status, and shared artifact/checkpoint tools. The native Google workspace stays empty of project context, and unmanaged global context is rejected.
- Synthetic ACP tests exercise negotiation, permission requests, cancellation and a single surfaced quota error. Managed Google sessions advertise no native filesystem or terminal capabilities; unexpected native read/write/execute callbacks are rejected without side effects. Named harness MCP tools still work through the parent guard.
- A real Pi RPC process loads the extensions and replaces worker/review sessions correctly. This particular test makes no model calls.
- UI tests cover narrow/Korean terminal widths, timer cleanup, motion off and non-TUI operation. RPC/JSON/print modes install no decorative widgets or animation timers.

Pinned runtime versions: Node 22.22.1; Pi/pi-ai/pi-tui 0.87.1; Claude bridge 0.8.0; Claude Agent SDK 0.3.267 / Claude Code 2.1.267; Google Antigravity ACP 1.2.1; ACP SDK 1.5.0; MCP SDK 1.30.1; Neovim 0.11.6; Zellij 0.45.1; zjstatus 0.25.0. Download provenance is in [installed-tools.json](../verification/installed-tools.json) and the installers. The earlier editor bootstrap also verified LazyVim 16.0.1, a compiled Python parser, Zig 0.15.2 / clang 20.1.2 and tree-sitter CLI 0.27.0.

## Real subscription worker checks (version 0.2)

These checks used disposable synthetic projects and the existing subscription logins. Each worker read a small Python implementation, corrected a subtraction bug, ran an unchanged validation script, preserved a warning in the middle of roughly 80 KB of output, proposed a checkpoint, and completed a read-only review using the saved raw-result reader. The test driver approved only the synthetic fixture operations and its checkpoint. A separate streamed response was cancelled for each provider.

| Worker | Model reported in the successful run | Read/edit/run | Warning and raw-result review | Checkpoint and cancellation |
| --- | --- | --- | --- | --- |
| ChatGPT | `gpt-6-sol` | Passed | Passed | Passed |
| Claude | `claude-sonnet-4-6` | Passed | Passed | Passed |
| Gemini via official Antigravity ACP | `gemini-3.8-flash-high` | Passed | Passed | Passed |

After Gemini completed its task, the same task was handed to ChatGPT and then Claude for read-only review. Both retrieved the warning marker and validation result while preserving the task ID, approved decisions and project files. This is a real cross-provider handoff check; it does not imply that all model combinations or future service errors have been tested.

The first ChatGPT/Claude run passed while the old Google path failed. Google was tested again after migration and the user's new Antigravity login; the table combines those successful provider runs. Earlier Gemini CLI session creation and any test before the authentication correction are **not** counted as subscription inference verification.

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
node scripts/verify-live.mjs chatgpt claude gemini
```

It creates a disposable project and isolated task state under the system temporary directory, prints each outcome, and writes a private report and RPC log there. It does not change account settings. Reports can contain prompts and tool outputs; keep them private. It checks failed full logs, partial-write cancellation/timeout, reconciliation and original-result review. With multiple providers, the next provider performs the review; set `PH_LIVE_REVIEWER=chatgpt` (or `claude`/`gemini`) to choose a reviewer when testing one worker. Use simulated quota failures rather than deliberately exhausting an account.

For an interactive check, open a disposable project with `ph open .`, visit each tab, edit and save a file, detach and reattach. Do not end an active working session merely to test restoration or refresh decorations. Machine-specific logs, state, screenshots and backups remain excluded from Git.

The Windows installer-flow check can be run from a checkout with PowerShell:

```sh
pwsh -NoProfile -File tests/windows-installer.ps1
```

To repeat the package-runtime tests, set PH_TEST_CLI to the installed package's absolute dist/cli.js path before running:

```sh
node --import tsx --test tests/pi-runtime.test.ts tests/providers.test.ts
```

These use temporary profiles and a loopback fixture, with no external model calls. Full installation checks can set PH_INSTALL_HOME to a new temporary directory and use scripts/install.py --archive FILE --sha256 HASH. Do not use existing account/state directories for a clean-install test.

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

## Operational closeout status (2026-09-25, documentation only)

The daily launcher still targets the installed `apps/0.3.1/node_modules/personal-harness`
package, separately from the development worktree. `ph --version` returned 0.3.1;
`ph doctor` succeeded; `ph providers list` showed only ChatGPT/openai-codex,
Claude/claude-bridge and Gemini/gemini-cli-acp. Existing extra-usage-off confirmations
remain. Start/end hashes matched for all 52 installed package files and the 20
previously recorded account, billing and task files. No reinstall, login, dependency
update, new provider, version bump or new release was performed.

| Check performed in this closeout | Observed result |
| --- | --- |
| Real documentation task | Installed harness used ChatGPT `gpt-6-sol` to author, an operator-approved checkpoint, Claude `claude-sonnet-4-6` to review, and ChatGPT to correct the four allowed documents. |
| Read-only review and handoff | Approved decisions survived the switch; the four document hashes stayed unchanged during review. Claude made six `read_task_artifact` calls, including retrieval of original operation results. |
| Normal process restart | Same task ID, approved decisions and instruction approval; all 44 artifact references and their content hashes preserved. No running/unknown operations and no model call during restart. The documentation task was marked complete. |
| Private baseline | Captured while agents/tools were stopped at `20260925T012044Z` under `~/.local/share/personal-harness-backups/v0.3.1/`. Contains 171 selected files (4,786,073 source bytes) and copies of the existing release assets. Pre/post source inventories and release/snapshot checksums matched. |
| Temporary recovery check | Verified all file hashes, sizes and original modes, 15 task records, 58 artifact references and one instruction approval in a separate private directory. Safe extraction normalized 14 file modes; recorded ordinary modes were restored and checked only in that temporary directory. No production restore occurred. |
| Backup scope and access | Directories 700; snapshot/report/release files 600. Provider credential stores, API-key files, locks/PIDs, installed tools/dependencies and separate project source/data are excluded. Recovery still needs those separate resources; installation is not guaranteed offline. |
| Documentation validation | Changed-file allowlist, local Markdown links/fences and `git diff --check` passed. No runtime files changed. |
| Windows client acceptance | Pending user confirmation of editing, tabs, SSH detach/reconnect and visible icons/transparency. Server checks do not establish Windows rendering. |

The task required four author/reviewer prompts, including review clarification and
correction. One author read exceeded EOF without mutation. The reviewer initially
overgeneralized operation success and later mislabeled an empty result; checking
original artifacts together with RPC command inputs corrected both interpretations.
Documentation fixes restored storage mappings, account/permission boundaries and
recovery limits. These observations show actual rework, not a measured efficiency gain.

The saved `/usage` report records 24 provider response messages, 28 read/search
operations, one failed operation and three approved validation records. Response
messages are not a count of internal provider requests. Reported input/output/cache
values do not prove subscription quota use, billing status or token savings.

The 41-test suite and three-provider synthetic checks above remain historical;
they were not rerun for these documentation edits. The actual closeout task used
two providers. Account billing confirmations are user attestations, not an independent
account audit. **Server work is verified; overall closeout awaits the Windows client
confirmation.** Private evidence and the snapshot's
machine-specific `RESTORE.md` remain outside the public repository.
