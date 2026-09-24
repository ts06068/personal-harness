# Sources and pinned interfaces

Inspected 2026-09-24. Installed source and package-lock.json are the implementation contracts.
Provider terms/account entitlements still require checking at use time.

- [OpenAI authentication](https://learn.chatgpt.com/docs/auth/): official ChatGPT subscription login.
- [Pi providers](https://pi.dev/docs/latest/providers): provider configuration and authentication.
- [Pi Claude bridge](https://github.com/elidickinson/pi-claude-bridge): published version 0.8.0.
- [Claude Agent SDK with Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): current subscription guidance. Do not generalize it to credential brokerage or paid API routes.
- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/): personal Google OAuth.
- [Gemini CLI ACP](https://geminicli.com/docs/cli/acp-mode/): official programmatic CLI integration.
- [Gemini configuration](https://geminicli.com/docs/reference/configuration/): auth selectors and tool/retry settings.
- [ACP protocol](https://agentclientprotocol.com/protocol/overview): stream, permission, filesystem and terminal methods.
- [LazyVim installation](https://www.lazyvim.org/installation): editor requirements.
- [Zellij layouts](https://zellij.dev/documentation/layouts.html): workspace layout and startup commands.

Concrete versions: Pi 0.87.1; pi-ai 0.87.1; pi-claude-bridge 0.8.0;
Claude Agent SDK 0.3.267 / Claude Code 2.1.267; Gemini CLI 0.61.0; ACP SDK 1.5.0.
The current ACP SDK removed legacy model-selection fields; v1 therefore uses the official CLI
account default instead of pretending that an old extension's hard-coded list is current.

In Pi 0.87 session replacement recreates extensions. Selection intent is persisted before
replacement and consumed by the new extension instance. Old `pi`/`ctx` references are not reused.
The actual runtime integration test covers this behavior without calling a model.

Terminal UI update (2026-09-24):

- [mini.icons ASCII fallback](https://github.com/nvim-mini/mini.icons/blob/main/doc/mini-icons.txt): file icons without a Nerd Font.
- [Zellij simplified UI](https://zellij.dev/documentation/options#simplified_ui): tab/status separators.
- [Zellij 0.45.1 options](https://github.com/zellij-org/zellij/blob/v0.45.1/zellij-utils/src/input/options.rs): `merge_from_cli` XORs duplicate booleans. Configure `simplified_ui true` in the file only.
- Installed Gemini CLI 0.61.0 source, `OAuthCredentialStorage`/`FileKeychain`: Google OAuth can be stored as encrypted `gemini-credentials.json` or in a keychain. The old plaintext-file check is insufficient; the official ACP session owns authentication.
