# Sources and pinned interfaces

Inspected through 2026-09-25. Installed source, pinned archives and `npm-shrinkwrap.json` define the tested contracts. Provider terms and account entitlements can change.

## Provider interfaces

- [OpenAI authentication](https://learn.chatgpt.com/docs/auth/): ChatGPT subscription login. Pi's installed `openai-codex` transport is the integration used here.
- [Pi providers](https://pi.dev/docs/latest/providers): provider configuration and authentication. The installed 0.87.1 extension types/runtime define the tool, session and result-hook behavior.
- [Pi Claude bridge](https://github.com/elidickinson/pi-claude-bridge): pinned 0.8.0, using the official Agent SDK.
- [Claude Agent SDK with a Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): subscription guidance; this is not authorization for credential brokerage or alternate paid API routes.
- [Google external-agent integration](https://antigravity.google/docs/ide/extensions/zed): documents personal Google subscription authentication as `oauth-personal`, distinct from API and enterprise routes.
- [Official Antigravity ACP registry entry](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json): Google LLC distribution, version 1.2.1, official download URLs and Linux `--uid=` argument.
- [Google's Gemini CLI migration guide](https://antigravity.google/docs/cli/gcli-migration/): transition to Antigravity. The actual `UNSUPPORTED_CLIENT` result is recorded as a local account observation in VERIFICATION.md, not a claim about every account.
- [ACP protocol](https://agentclientprotocol.com/protocol/overview): sessions, streaming, permissions, files and terminal methods.

Concrete versions: Pi/pi-ai/pi-tui 0.87.1; pi-claude-bridge 0.8.0; Claude Agent SDK 0.3.267 / Claude Code 2.1.267; Google Antigravity ACP 1.2.1; ACP SDK 1.5.0; MCP SDK 1.30.1. Gemini CLI 0.61.0 is no longer a runtime dependency.

Google's unmodified Linux archive was inspected to confirm its dedicated `GEMINI_HOME`, personal-auth settings/store, native context discovery, MCP permission metadata, and `_meta.agy.enabledTools` session filter. The harness disables native tools and native client capabilities and supplies its own authenticated MCP endpoint. ACP `configOptions` supplies the reported model when available. These are version-specific integration contracts; recheck them before changing the pinned server. The archive hash pins the bytes downloaded from Google's official HTTPS host; no independently signed upstream checksum was found. See [the installer](../scripts/install-google.py) and [download record](../verification/installed-tools.json).

Pi 0.87 session replacement recreates extensions. Selection intent is persisted before replacement and consumed by the new extension instance. Old `pi`/`ctx` references are not reused. A real runtime test covers replacement without inference; separate opt-in account tests cover actual workers.

## Terminal and editor

- [LazyVim installation](https://www.lazyvim.org/installation) and [requirements](https://www.lazyvim.org/): editor dependencies and Nerd Fonts 3+.
- [Nerd Fonts 3.5.1](https://github.com/ryanoasis/nerd-fonts/releases/tag/v3.5.1): JetBrainsMono Mono files pinned in `config/fonts.json`.
- [Noto Emoji 2.051](https://github.com/googlefonts/noto-emoji/tree/v2.051): Linux emoji fallback.
- [VS Code terminal appearance](https://code.visualstudio.com/docs/terminal/appearance): font-family configuration in the local renderer.
- [Windows Terminal profile appearance](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/profile-appearance): font, opacity and acrylic options. The checked-in fragment must be merged into the local SSH profile.
- [Windows font registration](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-addfontresourceexw) and [font-change notification](https://learn.microsoft.com/en-us/windows/win32/gdi/wm-fontchange): calls used by the per-user installer.
- [Zellij layouts](https://zellij.dev/documentation/layouts.html): tabs, panes and startup commands.
- [Zellij 0.45.1 options](https://github.com/zellij-org/zellij/blob/v0.45.1/zellij-utils/src/input/options.rs): duplicate CLI/file booleans are XORed; the launcher sets display options in one place.
- [zjstatus 0.25.0](https://github.com/dj95/zjstatus/releases/tag/v0.25.0): pinned local WebAssembly bars with terminal-default backgrounds. The runtime permission prompt was checked even though this layout uses no command widget.

Theme backgrounds, timer behavior and layout replacement were checked against the installed runtimes. A real disposable Zellij session demonstrated that live layout replacement can duplicate panes, so updates apply to new sessions. This preserves existing user sessions rather than promising safe hot reload.

## Distribution and Windows

- [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/): bin entries, platform constraints and published files.
- [npm shrinkwrap](https://docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json/): publishable dependency lock used by the installed CLI.
- [WSL installation](https://learn.microsoft.com/en-us/windows/wsl/install) and [commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands): distribution setup and explicit WSL2 selection.
- [Windows Terminal fragments](https://learn.microsoft.com/en-us/windows/terminal/json-fragment-extensions): per-user UTF-8 profile installation without rewriting settings.json.

Additional provider registration follows the installed Pi 0.87.1 provider catalog
and models.json schema. Local and compatible API fixture tests verify the
registered route; support for an API protocol is not proof of account entitlement
or a successful request to every provider in that catalog.
