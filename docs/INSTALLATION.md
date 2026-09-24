# Installation, updates and packaging

Version 0.3 targets Linux x86_64 and Windows x64 through WSL2 Ubuntu 24.04+. Windows native execution and ARM64 installers are not part of this release. The Windows installer makes this distinction explicit.

## Release installer

`scripts/install.py` downloads the versioned npm tarball and SHA256SUMS from this repository's GitHub Release, checks the hash and package identity, installs a pinned Node runtime, and installs the package persistently under the harness data directory. It then runs `ph setup`. No npm registry account is needed to install a public release asset.

Git and Python 3.12+ are prerequisites. On Ubuntu 24.04+, install missing prerequisites with `sudo apt-get install python3 git curl ca-certificates`. Workspace tools are installed under your own account. Provider credentials and existing tasks are preserved. Installation makes no model calls and does not confirm billing settings on your behalf.

The persistent app is stored under `~/.local/share/personal-harness/apps/VERSION/node_modules/personal-harness/` on fresh installations. An existing `research-harness` data directory remains in use when present. Old version directories are retained so active processes are not deleted during updates.

For npm global installation, use the versioned `.tgz` release URL shown in the README, then `ph setup`. Run npm in a user-owned prefix or Node version manager; do not use sudo to install your workspace. `ph setup` rejects temporary npx cache locations because launchers must point to a persistent package.

Preview with `ph setup --dry-run`. The `--skip-editor-plugins` option installs runtimes and configuration while deferring LazyVim plugin/parser restoration; run normal `ph setup` later to finish it. This option is useful for installation checks, not the default tutorial.

## Windows setup

The PowerShell installer checks the selected WSL distribution, WSL version, Linux user and architecture. It never unregisters or shuts down existing distributions or changes the default distribution. Initial WSL installation can require administrator rights, a Windows restart and interactive Ubuntu user creation; rerun the installer afterwards. These OS steps cannot honestly be presented as unattended installation.

Use `-Distribution NAME` for an existing Ubuntu 24.04+ WSL2 distribution, `-SkipFonts` to retain your font installation, and `-DryRun` to preview. A dedicated Windows Terminal fragment adds the Personal Harness profile without rewriting `settings.json`. Restart Windows Terminal to load the profile and fonts.

Keep projects under `~/workspace` in WSL for ordinary work. Windows drives are reachable under `/mnt/c/...`, but Git/filesystem behavior and performance can differ. Windows, WSL and remote servers have separate provider logins; the installer does not copy tokens between them.

## Terminal fonts

Install **JetBrainsMono Nerd Font Mono** on the computer rendering the terminal. The Windows installer does this unless `-SkipFonts` is used. For a separate Windows SSH client, download and run `scripts/install-fonts-windows.ps1` locally. It verifies pinned font hashes and installs for the current Windows user.

Select that family in Windows Terminal's SSH profile or set VS Code's local `terminal.integrated.fontFamily` to `'JetBrainsMono Nerd Font Mono', 'Segoe UI Emoji', monospace`. Linux/macOS users can use `python3 scripts/install-fonts.py` from a checkout. Emoji rendering relies on the local terminal and OS fallback; server fonts do not change a Windows terminal's rendering.

The supplied Terminal profile uses acrylic and 80% opacity. Existing SSH profiles can merge [the appearance fragment](../config/terminal/windows-terminal.profile.json). VS Code's integrated terminal does not inherit Windows Terminal acrylic settings.

## Update or remove

Save files and settle agent turns first. Rerun the release installer for a newer version, or install the new npm tarball and rerun `ph setup`. Existing Zellij sessions retain their running applications and layout; new workspaces use the new configuration. Reopen settled agents/editors to use the new code.

Version 0.3.1 preserves the existing task schema, accounts and raw artifacts. It does not reinterpret old failed operations. New shell interruptions retain partial output and require reconciliation before further execution or worker changes; follow the README's interruption-recovery steps. Existing running agents keep their loaded code until restarted.

From a source checkout, use `sh scripts/bootstrap.sh`; development checks remain `npm run build` and `npm test`. The publishable lockfile is `npm-shrinkwrap.json`, so npm consumers receive the pinned dependency tree as well.

`python3 scripts/rollback.py` previews removal of the recorded launchers/editor configuration; `--apply` performs it. Account stores, tasks, tools and old app versions remain. Uninstalling the npm package alone does not remove that persistent state. Do not remove an app directory while its agent/editor is running.

`PH_INSTALL_HOME`, `PH_DATA_DIR` and `PH_STATE_DIR` allow isolated installation checks. `PH_INSTALL_HOME` redirects managed launchers/editor directories without changing the process's HOME. These settings must stay consistent across installation and execution.

## Maintainer release procedure

1. Run the build, automated tests, PowerShell installer-flow test and isolated package installation test.
2. `npm pack` creates the distributable with compiled JavaScript, configuration, runtime installers and the shrinkwrap file. The files allowlist excludes accounts, private state, development dependencies and machine-specific logs.
3. Inspect the archive and record SHA256SUMS. Publish it on the matching GitHub release tag with the installers. Do not overwrite an existing version's asset.
4. Publishing the short package name to the npm registry is a separate action requiring the npm account/name and distribution-license decision. The release-tarball installation works independently; no registry publication is implied.

The SHA-256 manifest protects against mismatched/corrupted release assets. It is downloaded from the same GitHub release and is not an independent signature.
