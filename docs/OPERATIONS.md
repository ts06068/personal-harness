# Operations and implementation notes

| Worker | Connection |
| --- | --- |
| ChatGPT | Pi's `openai-codex` subscription OAuth transport |
| Claude | `pi-claude-bridge` and the official Claude Agent SDK/runtime |
| Gemini | The harness's ACP adapter and Google's unmodified Antigravity ACP server 1.2.1 |

Claude and Gemini retain their official internal execution engines. Model availability and limits depend on the account. A model appearing in a picker is not proof of access. Gemini's local `cli-default` entry is not a model ID or a quota promise.

Subscription routes exclude alternative API keys and gateways. Additional API/local routes require explicit registration and never serve as automatic fallback. Account extra-usage settings remain your responsibility. The pinned Google ACP consumer transport does not opt into extra-credit fallback; account-side settings still apply. Token counts or displayed API-equivalent costs do not directly report subscription quota or actual charges.

Managed file tools restrict paths; review mode blocks managed writes and shell execution. **This is not an operating-system sandbox.** Approved shell commands and plugins run with your Unix user's permissions. Use a suitable project directory and keep private credentials and restricted data outside the material you give to a model. Remote model requests send the selected content to the provider.

R/Quarto integration, literature tools, mail/calendar/Drive actions, and OMP migration are not implemented in this initial version.

## Storage, updates, and development

Fresh installations use:

| Location | Contents |
| --- | --- |
| Installed npm package or `personal-harness` clone | Runtime code, pinned dependencies, and configuration templates |
| `~/.local/bin/ph`, `~/.local/bin/ph-edit` | Launchers |
| `~/.local/share/personal-harness/` | Runtimes, dedicated provider credentials, and managed settings |
| `~/.local/state/personal-harness/` | Project locks, task state, sessions, usage, and full tool results |
| `~/.config/personal-nvim/` | Isolated Neovim configuration |
| `~/.local/share/personal-nvim/` | Neovim plugins and parsers |

Upgrades reuse an existing `research-harness` account/state directory and `research-nvim` editor profile if the corresponding new directory does not exist. These are private storage locations, not commands or an old repository clone. This preserves existing logins and tasks. Advanced overrides are `PH_DATA_DIR` and `PH_STATE_DIR`; keep them consistent during install and execution.

To rebuild from the repository directory after updating or moving the clone:

```sh
task_data=$(python3 scripts/install_paths.py data)
export PATH="$task_data/bin:$PATH"
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
python3 scripts/install-ui.py
python3 scripts/install-google.py
python3 scripts/install-launchers.py
ph doctor
```

Save editor files and finish or cancel the current agent turn before restarting those applications. Already-running processes do not automatically load updated code. The launcher installer removes the old `rh`/`rh-edit` aliases that it previously created.

`.gitignore` excludes credentials, local profiles, task/session output, logs, generated code, dependencies, and machine-specific verification reports. Commit source and lockfiles; keep account stores private. The sample CSV in `examples/smoke` is synthetic.

To preview removing the launchers and editor configuration, run `python3 scripts/rollback.py`. Add `--apply` only after closing the harness. Rollback retains accounts, tasks, installed tools, and plugins.
