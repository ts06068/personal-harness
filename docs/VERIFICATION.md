# Verification and limits

The recorded local checks used Ubuntu 26.04 on Linux x86_64 on 2026-09-24. Installation checks, protocol tests, authenticated session setup, and model inference are different levels of validation.

## Checks executed

- TypeScript compilation and 15 automated tests passed. The tests cover subscription-route rejection, path confinement and symlinks, one writer per project, interrupted-operation reconciliation, bounded handoffs, usage deduplication, incremental Gemini prompts, and simulated quota errors without automatic fallback.
- ACP tests use a synthetic protocol server to exercise read/write/terminal callbacks, read-only restrictions, and cancellation.
- A real Pi RPC process loaded the harness and Claude bridge, switched to a fresh Gemini segment, and then opened a separate review segment. These tests send no model prompts.
- Pinned tool version checks passed: Node 22.22.1, Pi 0.87.1, Claude Code 2.1.267, Gemini CLI 0.61.0, Neovim 0.11.6, Zellij 0.45.1, Zig 0.15.2 / clang 20.1.2, and tree-sitter CLI 0.27.0.
- LazyVim 16.0.1 loaded with the committed plugin lockfile. A compiled Python parser successfully parsed a small program.
- Real Neovim rendering of the dashboard, editor/file tree/status line, and file picker emitted Nerd Font icons with no startup errors (10, 19, and 19 distinct icon codepoints in those screens). The former ASCII overrides have been removed. This checks emitted text, not the Windows client's screen.
- A fresh temporary Zellij workspace displayed `edit / agent / run`, retained its tabs across disconnect/reconnect, and emitted Powerline separators and editor icons under the managed configuration.
- The official Gemini CLI created an authenticated ACP session with an existing encrypted OAuth store, with zero prompt requests and zero tool requests. The adapter therefore delegates login validation to that CLI instead of requiring a legacy plaintext file.

Machine-specific doctor reports, session identifiers, logs, and UI captures are local artifacts excluded by `.gitignore`. Tool download sources and checksums are recorded in `verification/installed-tools.json`; font sources and SHA-256 hashes are in `config/fonts.json`.

## Reproduce the local checks

From the repository directory, after bootstrap:

```sh
task_data=$(python3 scripts/install_paths.py data)
export PATH="$task_data/bin:$PATH"
npm run build
npm test
python3 scripts/install-launchers.py
ph doctor
ph-edit --headless '+lua print("EDITOR_STARTUP_OK")' +qa
```

For an interactive check, open a disposable project with `ph open .`, visit each tab, edit and save a file, detach, and reattach. Do not end a working session merely to test restoration.

## Live provider verification

The checks above do not establish complete three-provider inference, account quotas, or token savings. A login marker is not a successful model response. After logging in and checking account billing settings, verify each provider using only a disposable project and synthetic files:

1. Copy `examples/smoke` into a separate project directory.
2. Run `/task new Verify subscription connection`, then `/switch PROVIDER`, and request one short response.
3. Ask it to read `analysis.py`, run `python3 -m unittest -v`, and report the observed outcome. Inspect any requested shell command before approving it.
4. Ask for a harmless comment edit, then inspect the actual file diff.
5. Interrupt a turn with Esc and inspect pending operations before switching.
6. Record the next step and switch to a different provider. Verify that it reads the saved state without silently rerunning completed work.
7. Use `/review PROVIDER`; managed writes and shell execution should remain blocked.
8. Compare account dashboards before and after to verify subscription usage and the absence of additional charges.

Use simulated quota errors for routine testing; do not deliberately exhaust an account. Record actual model IDs, authentication route, available usage fields, and unexpected retries. Do not publish authentication logs or account details.

## Implementation limits

- Shared Unix-user permissions are not a security sandbox. Approved commands and plugins retain that user's filesystem/network access.
- ACP file reads are bounded to 2 MB. Select a smaller input for larger files.
- The Gemini adapter accepts text; it explicitly rejects image attachments.
- ACP turns time out after 10 minutes. Reconcile uncertain operations before retrying.
- Gemini uses the official CLI's account-default model. Its `cli-default` picker entry and display context budget are local labels, not provider guarantees.
- Retry controls at the harness layer are tested. Provider-runtime retry behavior and actual quota error variants still need live account validation.
- Billing confirmations are user attestations, not account API audits. Missing usage remains unknown.
- R/Quarto, mail/calendar/Drive, literature tools, and OS isolation are not included in this release.

## Zellij display configuration

Zellij 0.45.1 XORs duplicate boolean options when merging CLI arguments with file settings. The launcher sets `simplified_ui false` in its dedicated configuration file and does not repeat it on the command line. Existing sessions can retain their server-side display settings. The attempted display-only reload preserved every terminal pane but did not restore separators in the already-running sessions; restored separators were verified in a fresh session. Do not kill a working session just to refresh its decorations. Neovim and agent code updates require restarting those applications after saving or settling current work.


## Font validation

- Installed JetBrainsMono Nerd Font Mono 3.5.1 (regular, bold, italic, bold italic) and Noto Color Emoji 2.051 for the Linux user; every font and license download matched its pinned SHA-256 hash.
- Fontconfig resolved the exact requested families. All 27 tested Nerd Font codepoints (the rendered Neovim icons plus diagnostic samples) exist in all four styles. The four emoji samples exist in Noto Color Emoji.
- Python utility syntax, JSON manifests, and `git diff --check` passed. Neovim headless startup passed.
- An isolated PowerShell 7.6.6 runtime parsed `install-fonts-windows.ps1`, compiled its C# font API wrapper, and checked the four downloaded font hashes. It did **not** execute Windows font registration or test Windows PowerShell 5.1 on Windows.
- The active server's VS Code Remote terminal setting names the new font and OS emoji fallbacks. The Windows desktop filesystem is not accessible from this server; Windows installation, the local VS Code/SSH terminal's selected font, and the resulting visible glyphs must be confirmed on that computer. Installing server fonts alone cannot validate them.

After local font installation and terminal configuration, run `python3 scripts/check-icons.py` from this repository in each client. Confirm the displayed shapes visually. Save and restart Neovim after applying the new editor configuration; an existing process retains the previous ASCII plugin options.
