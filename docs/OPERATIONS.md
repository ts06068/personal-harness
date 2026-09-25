# Daily operation and private recovery (v0.3.1)

## Keep the release separate from development

In an ordinary shell, check `type -a ph`, `ph --version`, `ph doctor`, and `ph providers list`. Confirm the first `ph` resolves to the managed launcher, version is 0.3.1, doctor succeeds, and the listed routes are the ones you intended. On 2026-09-25 (Asia/Seoul), the operator observed only ChatGPT/openai-codex, Claude/claude-bridge, and Gemini/gemini-cli-acp. The managed launcher targets the versioned `apps/0.3.1/node_modules/personal-harness` package, **not** the source worktree. Existing installations may use `research-harness` data/state directory names; keep the selected paths rather than renaming them during closeout.

`ph doctor` and `ph providers list` refresh managed settings. Their credential indicators are not a new live authentication or billing audit. Existing extra-usage-off confirmations remain recorded; verify account settings separately when needed. No login, reinstall, bootstrap, dependency upgrade, or launcher switch is required while the release works. Edit/build in a development worktree; merge documentation without reinstalling. Repair only a demonstrated blocker, validate it, and replace the daily release only by a deliberate, reviewed update (see [installation and updates](INSTALLATION.md#update-or-remove)).

### Routes, accounts and permissions

| Worker | Connection |
| --- | --- |
| ChatGPT | Pi `openai-codex` subscription OAuth |
| Claude | `pi-claude-bridge` and the official Claude Agent SDK/runtime |
| Gemini | Official Antigravity ACP 1.2.1 through the harness ACP adapter |

Claude and Google retain their official engines. A picker entry does not establish account availability or limits; `cli-default` is a route alias, not proof of a model or quota. Subscription transports exclude alternate keys/gateways. Additional API/local providers require explicit registration and are never automatic fallback. Check account billing settings separately: displayed API-equivalent cost is neither subscription quota nor an actual charge; the pinned Google consumer transport does not opt into extra-credit fallback, but account settings still matter.

Managed file guards and read-only review are **not** an OS sandbox. Approved shells and plugins run with the user's permissions, and selected inputs sent to remote models leave the server. Keep restricted data and credentials outside model-visible materials.

At the agent prompt, use `/usage` for reported usage; unknown values remain unknown. Track observed repeat reads, rework, and validation effort during normal tasks. There is no measured token-saving claim. Keep worker selection manual: a rate limit is not permission to fall back to a paid route automatically. First-stage closeout covers the general-purpose personal workspace; dedicated R/Quarto/literature/mail/calendar/Drive tools and OMP migration remain future work.

### Storage on a fresh install

| Path | Contents |
| --- | --- |
| `~/.local/bin/ph`, `~/.local/bin/ph-edit` | Managed launchers |
| `~/.local/share/personal-harness` | Data root: tools, accounts, settings and versioned apps |
| `~/.local/state/personal-harness` | State root: tasks, artifacts and locks |
| `~/.config/personal-nvim` | Editor configuration |
| `~/.local/share/personal-nvim` | Plugins and parsers |

If the corresponding new directories do not exist, an existing `research-harness` data/state root or `research-nvim` editor directories remain in use. `PH_DATA_DIR` and `PH_STATE_DIR` override the data/state roots; keep overrides consistent across installation and execution. Inspect the active paths before backing up or restoring. Do not create new default roots while the launcher still uses legacy roots.

## One-time private baseline

After agent/tool turns have settled, make one local snapshot for this same account and home layout under `~/.local/share/personal-harness-backups/v0.3.1/<UTC timestamp>/`. Set the backup root and snapshot directories to mode `700`; archive and report files to `600` (including files under `release/`). Do not upload to cloud or a public repository. Restrict access while creating temporary files too. Record the actual UTC timestamp and source paths, not guessed defaults. The current server's baseline was captured and verified on 2026-09-25; [verification](VERIFICATION.md#operational-closeout-status-2026-09-25-documentation-only) records its scope. Other installations need their own snapshot.

Inventory the active `PH_DATA_DIR`/`PH_STATE_DIR` or installer-selected legacy paths before copying. Include the managed config, non-auth Pi settings/model/bridge files, Neovim and Zellij configuration, managed launchers and install manifest, and only the projects subtree containing harness task state, approved instruction snapshots, checkpoints, sessions, warnings, usage, and raw artifacts. Preserve relative paths from the same user's home in `state-and-config.tar.gz`. For paths outside that home, stop and decide explicitly how to inventory them; do not silently relocate them. Inspect the inclusion list and archive members for secrets and unexpected symlinks before finalizing. Exclude provider credential stores/API-key files, writer locks/PIDs/process leases, installed binaries, `node_modules`, caches, and project source/data outside those harness records. Do not collect entire project repositories or entire Pi directories indiscriminately.

Snapshot layout:

- `release/`: copies of the **existing verified** v0.3.1 `.tgz`, two installers, and release `SHA256SUMS`; verify each against the existing manifest before recording it. The manifest from the same release is an integrity check, not an independent signature.
- `state-and-config.tar.gz`: selected home-relative state/config/launcher paths, with original modes retained.
- `files.json`: record the original home, data and state roots once, then home-relative keys for selected files with each file's SHA-256, mode, byte size and mtime. Resolve original absolute paths using that mapping; list excluded categories and archive member paths clearly.
- `SHA256SUMS`: SHA-256 hashes of the snapshot files (including release copies, archive, and reports; generate it last, without a self-entry).
- `RESTORE.md`: private, machine-specific source-to-destination mapping and restore order; avoid tokens and passwords.
- `verification.json`: actual inventory/hash/permission/extraction/comparison results, plus explicit pending checks. Never mark an unperformed check passed.

Hash selected sources before and after copying and compare; if any changed, wait until writers settle and repeat rather than treating the archive as consistent. In a **separate private temporary directory**, verify snapshot hashes, extract without writing to the live home, then compare extracted file hashes/modes and task IDs, approved instruction contents, checkpoints, sessions and raw artifacts against the inventory and live originals. Check the archive member paths before extraction for absolute paths, `..` traversal or unsafe links. Record observed outcomes and pending checks in `verification.json`; perform ordinary temporary cleanup when no longer needed (not cryptographic secure erasure). Snapshot files may contain private prompts and task content even though credentials are excluded. This local copy does not protect against server disk loss. It is not a complete offline environment backup: reinstallation may need network access for pinned runtimes/tools and npm dependencies. Source repositories/data and installed dependency/binary trees are not included.

## Recovery: inspect before restoring

Stop the relevant agents/tools first and preserve the current home until the failure is understood. Check `files.json`, `SHA256SUMS`, release hashes and `verification.json`. Choose the **actual** snapshot directory, not a guessed default, and verify checksums and archive members before extracting to a private temporary location:

```sh
BACKUP=/path/to/actual/private/snapshot
cd "$BACKUP"
sha256sum -c SHA256SUMS
(cd release && sha256sum -c SHA256SUMS)
tar -tzf state-and-config.tar.gz
```

Stop on any hash failure. Inspect the tar listing for unsafe paths or links before proceeding. After those checks pass, extract into a private temporary directory:

```sh
PH_RESTORE_TMP=$(mktemp -d)
tar -xzf state-and-config.tar.gz -C "$PH_RESTORE_TMP"
```

Never extract directly into live `HOME`. Keep the temporary directory private and remove it with ordinary cleanup after inspection. Verify extracted file hashes and original modes against `files.json`: safe extraction or the current umask may remove write bits, so restore recorded ordinary permissions only on verified temporary files. Compare task IDs, approvals and artifacts there; ensure the project repositories and data still exist **separately**, since they are not in this archive. Restore only selected settings/state to the same account/layout after inspection, without overwriting healthy newer state. Never restore locks, PIDs or leases; let new processes acquire them. Recheck the managed launcher, `ph --version`, `ph doctor`, `ph providers list`, then inspect `/task` and approvals after restart; test real connectivity separately if needed.

If the versioned runtime is missing, reinstall the archived, verified v0.3.1 package using the installation procedure, then restore selected configuration/state; do **not** reinstall when the runtime already works. On different paths, regenerate launchers with the installer and reapprove path-bound instructions rather than copying launchers blindly. Authentication is excluded: it remains in official private stores, or requires login if those stores are lost. `scripts/rollback.py` only retires managed launchers/config; it is not a full state-backup restore. See [installation](INSTALLATION.md) for installer constraints.
