# Personal Harness

A personal AI workspace for research, programming, manuscript writing, software development, and hobby projects. Work over SSH, edit files in Neovim, and choose GPT, Claude, or Gemini as the primary worker for each task.

You choose the worker. When a provider reaches its rate limit, the harness saves the task and waits for you to switch. It does not automatically switch to a paid model API.

**The commands are `ph` and `ph-edit`.** The old `rh` commands have been removed.

[Getting started](#getting-started) · [Terminal fonts](#terminal-font-setup) · [First task](#your-first-task-about-10-minutes) · [Zellij keys](#zellij-move-between-workspaces) · [Neovim keys](#neovim-edit-files) · [Model switching](#choose-and-switch-ai-workers) · [Troubleshooting](#troubleshooting)

## What is on the screen?

| Part | Purpose | What you type there |
| --- | --- | --- |
| **Zellij** | Keeps your terminal workspace alive across SSH disconnects; provides tabs and panes | Keyboard shortcuts to move between tabs/panes |
| **`edit` tab** | Neovim with LazyVim and a file tree | Text, editor commands such as `:w`, and editor shortcuts |
| **`agent` tab** | Pi with Personal Harness commands and the selected AI worker | Requests in plain language; `/task`, `/switch`, `/review`, etc. |
| **`run` tab** | An ordinary shell in your project directory | Shell commands such as `git diff` or `python3 script.py` |

A **tab** is one workspace page. A **pane** is one terminal region inside a tab. A Neovim **window** is a split inside the editor; a Neovim **buffer** is an opened file. The three Zellij tabs share the same project files.

Keep Zellij **locked** while typing in the editor or agent. “Locked” means its shortcuts are mostly disabled so your keystrokes reach the application; your files and terminal are still usable.

## Getting started

### Already installed and logged in?

Skip installation and login. In an ordinary shell, run:

```sh
ph doctor
ph open /path/to/your/project
```

Use an actual project directory. For a safe first exercise, follow [Your first task](#your-first-task-about-10-minutes). Avoid starting in your entire home directory: start in the folder containing the work you want the AI to access.

`ph open .` uses your current directory. Running it again for the same project reattaches to its existing Zellij session. To use the agent without Zellij, run `ph agent .`; to use only the editor, run `ph-edit`.

### Install on a new server

The pinned bootstrap targets **Linux x86_64**, with Git, Python 3.12+, a POSIX shell, and internet access. It installs Node, Neovim, Zellij, search tools, a C compiler, and the pinned npm/Neovim dependencies in your user account. The default bootstrap does not need sudo.

```sh
git clone https://github.com/ts06068/personal-harness.git
cd personal-harness
sh scripts/bootstrap.sh
```

Downloads and parser compilation can take a while. Wait for the final `ph doctor` report. The bootstrap does not replace your shell startup files or your normal Neovim configuration.

If your shell cannot find `ph`, use `~/.local/bin/ph` or enable the launcher directory for the current shell:

```sh
export PATH="$HOME/.local/bin:$PATH"
ph doctor
```

To make that PATH change permanent, add the same export to your shell startup file if it is not already present (`~/.zshrc` for zsh, `~/.bashrc` for bash).

### Terminal font setup

Use **JetBrainsMono Nerd Font Mono** for the terminal. The `Nerd Font` variant includes the folder, file-type, Git, search, and status icons used by LazyVim. Ordinary JetBrains Mono or Fira Code does not include these extra icons. General emoji such as a smile or rocket use the operating system's emoji font as a fallback.

**Install the font on the computer where you see the terminal window.** With SSH, VS Code Remote, WSL, or a container, installing a font only inside Ubuntu does not install it on your Windows/macOS/Linux desktop.

**Windows quick install:** open **PowerShell on Windows**, outside your SSH session, and run:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/ts06068/personal-harness/main/scripts/install-fonts-windows.ps1" -OutFile "$env:TEMP\ph-install-fonts.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\ph-install-fonts.ps1"
```

The [installer](scripts/install-fonts-windows.ps1) verifies the manifest and all downloaded fonts, installs four font styles for your Windows user without administrator rights, and prints the settings to select. The execution-policy override applies only to that PowerShell process. After it finishes, continue at **step 3** below and configure **both VS Code and Windows Terminal** if you use both. Their terminal font settings are independent. The script does not overwrite either application's settings.

Prefer a manual installation, or using another OS? Follow all steps below:

1. On your **local computer**, download the official [JetBrainsMono Nerd Fonts 3.5.1 archive](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.5.1/JetBrainsMono.zip) and extract it.
2. Install these four files: `JetBrainsMonoNerdFontMono-Regular.ttf`, `JetBrainsMonoNerdFontMono-Bold.ttf`, `JetBrainsMonoNerdFontMono-Italic.ttf`, and `JetBrainsMonoNerdFontMono-BoldItalic.ttf`.
   - **Windows:** select the four files in File Explorer, right-click, and choose **Install** (on Windows 11, this may be under **Show more options**).
   - **macOS:** open the files in Font Book and choose **Install**.
   - **Linux:** copy them into `~/.local/share/fonts/`, then run `fc-cache -f`. Install your distribution's emoji font too; on Ubuntu Desktop, `sudo apt install fonts-noto-color-emoji` provides it.
3. Select the font in the application you actually use:

| Local terminal | Setting |
| --- | --- |
| **VS Code integrated terminal** | Open Settings with `Ctrl+,` (`Cmd+,` on macOS), search `terminal.integrated.fontFamily`, and enter the value shown below |
| **Windows Terminal** | Open Settings → your SSH/PowerShell profile → Appearance → Font face → **JetBrainsMono Nerd Font Mono**, then Save |
| **iTerm2** | Settings → Profiles → Text → Font → **JetBrainsMono Nerd Font Mono** |
| **Linux desktop terminal** | Preferences → your profile → custom font → **JetBrainsMono Nerd Font Mono** |

For **VS Code**, use this value in the Terminal › Integrated: Font Family field:

```text
'JetBrainsMono Nerd Font Mono', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', monospace
```

Or merge [the JSON setting](config/terminal/vscode.settings.json) into your settings. Change the **terminal** font setting; the editor font setting alone may not change a terminal that already has its own font configured. Windows supplies Segoe UI Emoji; macOS supplies Apple Color Emoji.

4. Restart the **local terminal application** after installing the fonts. Save your Neovim files and reopen the editor so the restored icon configuration loads. Detaching/reconnecting to Zellij preserves the old Neovim process; that alone does not reload its plugin settings.
5. In the server shell, from this repository, run:

```sh
python3 scripts/check-icons.py
```

The first lines should show real folder/file/Git icons, separator shapes, emoji, and Korean text. If Nerd Font icons are boxes, the local font is missing or the terminal still has another font selected. If only emoji are boxes, check the local OS emoji fallback. This is a **visual check**: the script cannot tell how an SSH client's screen renders its output. Font matches printed at the end describe the computer running the script.

For a Linux or macOS computer with this repository checked out, `python3 scripts/install-fonts.py` is an alternative to manually installing the files. It installs pinned fonts into the current user's font directory and verifies SHA-256 hashes from [config/fonts.json](config/fonts.json); Linux also gets Noto Color Emoji. You still need to select the font in the local terminal. The server bootstrap deliberately leaves local desktop font installation to this step.

### Log in once per account

Run these commands in a shell, not inside Neovim or the agent prompt:

```sh
ph login gpt
ph login claude
ph login gemini
```

| Provider | Login choice |
| --- | --- |
| GPT | In Pi, run `/login`, choose **OpenAI Codex / ChatGPT**, complete browser authentication, then `/quit` |
| Claude | Follow the official Claude subscription-account login flow |
| Gemini | Choose **Sign in with Google** for your personal subscription account |

For a remote server, open the displayed authentication URL in your local browser and follow the CLI's callback/code instructions. Do not paste credentials into a project file or an AI conversation. API-key and Vertex login routes are not part of this setup.

For a new installation, check each account's extra-usage, paid-credit, and auto-refill settings. After disabling additional charges, record your confirmation:

```sh
ph billing confirm gpt --extra-usage-off
ph billing confirm claude --extra-usage-off
ph billing confirm gemini --extra-usage-off
ph doctor
```

These commands record your confirmation; they do not change or audit your account's billing settings. Existing installations retain their saved confirmation. A local credential marker also does not prove that a model request will succeed. See [verification](docs/VERIFICATION.md) for the actual validation boundary.

## Your first task (about 10 minutes)

### 1. Create a small practice project

In an ordinary shell:

```sh
mkdir -p ~/projects/hello-harness
cd ~/projects/hello-harness
git init
printf '# My first project\n\nI want to build a simple personal website.\n' > notes.md
ph open .
```

You should see the `edit`, `agent`, and `run` tabs. The initial `edit` tab contains Neovim. No model is called simply by opening the workspace.

### 2. Open and edit a file

In the **edit** tab:

1. Press `Esc` to enter Neovim's Normal mode.
2. Type `:e notes.md` and press `Enter` to open the file.
3. Press `G` to move to the last line, then `o` to add a line and enter Insert mode.
4. Type a requirement, for example: `The website should have an About page and a project list.`
5. Press `Esc`, type `:w`, and press `Enter` to save.

`Space e` opens the file tree. Move with the arrow keys or `j`/`k`, then press `Enter` to open a file. Press `Space e` again to hide the tree.

### 3. Move to the agent

Starting with Zellij locked, press these **in sequence**:

```text
Ctrl+g  →  Ctrl+t  →  2  →  Ctrl+g
```

This unlocks Zellij, enters tab mode, selects tab 2 (`agent`), and locks Zellij again. Release each key combination before pressing the next one.

At the **agent prompt**, enter each line separately:

```text
/task new Turn my website notes into a short implementation plan
/task add notes.md
/task decision Keep the first version small; do not add dependencies yet
/switch gpt
```

Select an available model when the picker appears. Use the arrow keys and `Enter`; `Esc` cancels a picker. You can choose `/switch claude` or `/switch gemini` instead.

Now enter a plain-language request:

```text
Read notes.md and propose a short implementation plan. Do not change any files yet.
```

The `/task` commands describe and save the task; they are not requests for an AI response. `/switch` selects a worker and starts a fresh session. **Send your actual request after selecting the worker.**

### 4. Review the result and continue

To return to the editor, use `Ctrl+g → Ctrl+t → 1 → Ctrl+g`.

You can ask the agent to save an agreed plan, edit a file, review a manuscript, or help implement a feature. Save your own editor changes before asking the agent to modify the same file. When the agent asks to run a shell command, inspect the command before approving it.

Use tab 3 (`run`) to inspect files or run checks yourself:

```sh
git status --short
git diff
cat notes.md
```

`git diff` shows changes to tracked files; newly created, untracked files are listed by `git status` and should be opened separately. The harness does not automatically commit or push your project.

### 5. Save the task and leave safely

At the agent prompt:

```text
/task next Implement the agreed first page
/handoff
```

Once the active turn has settled, detach from Zellij with:

```text
Ctrl+g  →  Ctrl+o  →  d
```

You are back in the shell. The workspace keeps running. Later:

```sh
cd ~/projects/hello-harness
ph open .
```

Detach preserves running processes while the server remains alive. It is not a checkpoint of Python/R memory across a server reboot. Save files and long-running computation outputs separately.

## Reading the shortcut tables

- `Ctrl+g`: hold Ctrl and press g.
- `Space e`: press Space, release it, then press e. Space is Neovim's **leader** key.
- `a → b`: perform a, then b; do not hold all keys together.
- `:w` means type the colon and command in Neovim Normal mode, then press `Enter`.
- Neovim shortcuts below start in **Normal mode** (`Esc`). Zellij shortcuts below start **locked**, unless stated otherwise.

## Zellij: move between workspaces

For daily work, learn **tab switching and detach** first. These sequences match the installed default keymap. The installer preserves an existing Zellij keymap, so if you have customized it, follow the key hints at the bottom of the screen.

| Action | Keys, starting locked |
| --- | --- |
| Go to `edit` | `Ctrl+g → Ctrl+t → 1 → Ctrl+g` |
| Go to `agent` | `Ctrl+g → Ctrl+t → 2 → Ctrl+g` |
| Go to `run` | `Ctrl+g → Ctrl+t → 3 → Ctrl+g` |
| Detach, leaving work running | `Ctrl+g → Ctrl+o → d` |
| Split the terminal to the right | `Ctrl+g → Ctrl+p → r → Ctrl+g` |
| Split the terminal below | `Ctrl+g → Ctrl+p → d → Ctrl+g` |
| Focus another terminal pane | `Ctrl+g → Ctrl+p → arrow key → Esc → Ctrl+g` |
| Make the current pane fullscreen / restore it | `Ctrl+g → Ctrl+p → f → Ctrl+g` |
| Scroll terminal output | `Ctrl+g → Ctrl+s`, then `PageUp` / `PageDown`; finish with `Esc → Ctrl+g` |
| Return from a Zellij mode to normal, then lock | `Esc → Ctrl+g` (when currently in a Zellij mode) |

If Zellij is already unlocked, omit the initial `Ctrl+g`. It toggles the lock, so pressing it blindly can put you in the opposite mode. Keep it locked while using Neovim's `Ctrl+s`, `Ctrl+h`, or the agent's shortcuts.

**Detach is different from quit.** `Ctrl+q` while Zellij is unlocked quits the session and can terminate its programs. Use detach for a normal break. Likewise, closing a pane or tab closes its contents.

Reference: [Zellij keybinding guide](https://zellij.dev/documentation/keybindings.html).

## Neovim: edit files

### The three modes you need

| Mode | What it does | Enter / leave |
| --- | --- | --- |
| Normal | Navigate and run commands | Press `Esc` to return here |
| Insert | Type text | Press `i` to enter; `Esc` to leave |
| Visual | Select text | Press `v` for characters or `V` for whole lines; `Esc` to leave |

If typing letters runs commands instead of inserting text, press `i`. If you are unsure what mode you are in, press `Esc` first.

### Open, save, and close

| Action | Keys / command |
| --- | --- |
| Open a file by path | `:e notes.md` |
| Save the current file | `:w` or `Ctrl+s` (with Zellij locked) |
| Save a new file under a name | `:w filename.md` |
| Close the current window | `:q` (refuses if it has unsaved changes) |
| Save the current file and close its window | `:wq` |
| Exit all editor windows | `:qa` (refuses unsaved changes) |
| Save changed files and exit all windows | `:wqa` |
| Discard changes and close the current window | `:q!` — use only when you intend to discard them |
| Learn interactively | `:Tutor` |
| Read help for a command | `:help` or, for example, `:help write` |

Closing the last Neovim window exits the editor, not the whole Zellij session. If Zellij holds the exited editor pane, press `Enter` as its on-screen prompt instructs to rerun it. You can also launch `ph-edit` from a shell.

### Move and make small edits

| Action | Keys in Normal mode |
| --- | --- |
| Move | Arrow keys, or `h` left / `j` down / `k` up / `l` right |
| Next / previous word | `w` / `b` |
| Start / end of line | `0` / `$` |
| First / last line | `gg` / `G` |
| Start inserting text | `i` |
| Insert a new line below | `o` |
| Undo / redo | `u` / `Ctrl+r` |
| Delete the current line | `dd` |
| Copy the current line / paste below | `yy` / `p` |
| Search in this file | `/search text`, then `Enter`; `n` next, `N` previous |
| Select whole lines | `V`, then move up/down |

### Files, windows, and the agent

| Action | Keys |
| --- | --- |
| Show/hide the file tree | `Space e` |
| Find a project file | `Space Space` |
| Search text across the project | `Space /` |
| Choose an open buffer | `Space ,` |
| Previous / next buffer | `Shift+h` / `Shift+l` |
| Close a buffer without closing the editor layout | `Space b d` |
| Move between Neovim windows | `Ctrl+h` / `Ctrl+j` / `Ctrl+k` / `Ctrl+l` |
| Copy the current file's `/task add` command | `Space a f` |
| Copy selected lines and their file/line location | Select with `V`, then `Space a s` |
| Show shortcut hints | Press `Space` and wait briefly |

The two `Space a ...` mappings only copy text. Switch to the agent and paste it yourself using your local terminal's paste shortcut. Clipboard transfer over SSH depends on your terminal's OSC52 support and permissions. If copying does not work, type `/task add notes.md` directly.

The file picker usually uses the Git/project root. The file tree here is **Neo-tree**, even if the upstream LazyVim documentation shows another explorer. The UI uses LazyVim's native icons; complete [Terminal font setup](#terminal-font-setup) on your local computer to display them. A configured language server is needed for language-specific features such as “go to definition”; the bootstrap does not install every language server.

References: [Neovim quick reference](https://neovim.io/doc/user/quickref/), [LazyVim keymaps](https://www.lazyvim.org/keymaps).

## Choose and switch AI workers

Enter these at the **agent prompt**:

| Command | Purpose |
| --- | --- |
| `/switch` | Pick GPT, Claude, or Gemini, then a model |
| `/switch gpt` | Choose a GPT worker |
| `/switch claude` | Choose a Claude worker |
| `/switch gemini` | Choose the Gemini CLI account-default worker |
| `/review PROVIDER` | Start a fresh read-only review segment with the provider you choose |
| `/task` | Show the current goal, decisions, next steps, and unresolved operations |
| `/task new DESCRIPTION` | Archive the previous task state and begin a new task; then use `/switch` |
| `/task goal DESCRIPTION` | Update the current task's goal |
| `/task decision DESCRIPTION` | Record a decision you have made |
| `/task next DESCRIPTION` | Record the next step |
| `/task add PATH` | Select an input file within the project |
| `/handoff` | Save the task handoff without calling a model |
| `/usage` | Show recorded usage; unavailable values remain unknown |
| `/task done` | Mark the task complete after operations have settled |
| `/quit` | Exit the agent |

Press **Esc** to interrupt an active agent turn. Wait for tools to settle before switching or starting a new task. In a picker, Esc cancels that picker.

### When a rate limit is reached

The harness records the failure and pauses; it does not endlessly retry or select another paid route. To continue:

1. Run `/task` and inspect the saved result and pending operations.
2. Record anything important with `/task decision ...` and `/task next ...`.
3. Run `/switch claude`, `/switch gemini`, or `/switch gpt` to choose an available worker.
4. Send a new instruction, such as: “Continue from the saved handoff. Check the existing results before running anything again.”

Switching passes a compact task packet: goal, decisions, selected file paths, changes, recent results, and next steps. It does not copy the full conversation. Save important decisions explicitly; the next worker cannot recover every detail of an earlier conversation automatically.

If an interrupted operation has an **unknown** outcome, switching is blocked until you inspect what actually happened. Then record that observation:

```text
/task reconcile OPERATION_ID completed Observed output file and successful exit status
```

Use `failed` instead of `completed` when appropriate. Do not mark an operation complete merely to dismiss the warning. With the agent stopped, the equivalent shell command is:

```sh
ph reconcile /path/to/project OPERATION_ID completed 'Observed output and exit status'
```

## Everyday workflow

1. Open your project with `ph open .`.
2. Read `/task`; start a new task when changing goals.
3. Add the relevant code, notes, manuscript, or result files and choose a worker.
4. Give a concrete request with a completion condition.
5. Review changed files and run the relevant checks in the `run` tab.
6. Record decisions and next steps; use `/review` when an independent review helps.
7. Save files, run `/handoff`, and detach.

For writing, select the draft and sources. For programming, select the code and requirements. For research, select the approved plan and relevant results. A task does not need to involve code.

## What runs underneath?

| Worker | Connection |
| --- | --- |
| GPT | Pi's `openai-codex` subscription OAuth transport |
| Claude | `pi-claude-bridge` and the official Claude Agent SDK/runtime |
| Gemini | The harness's ACP adapter and the official `gemini --acp` runtime |

Claude and Gemini retain their official internal execution engines. Model availability and limits depend on the account. A model appearing in a picker is not proof of access. Gemini's local `cli-default` entry is not a model ID or a quota promise.

The launcher excludes alternative API keys and gateways, restricts supported providers, and avoids automatic paid fallback. Account extra-usage settings remain your responsibility. Token counts or displayed API-equivalent costs do not directly report subscription quota or actual charges.

Managed file tools restrict paths; review mode blocks managed writes and shell execution. **This is not an operating-system sandbox.** Approved shell commands and plugins run with your Unix user's permissions. Use a suitable project directory and keep private credentials and restricted data outside the material you give to a model. Remote model requests send the selected content to the provider.

R/Quarto integration, literature tools, mail/calendar/Drive actions, and OMP migration are not implemented in this initial version.

## Storage, updates, and development

Fresh installations use:

| Location | Contents |
| --- | --- |
| Your `personal-harness` clone | Source, pinned dependencies, and configuration templates |
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
python3 scripts/install-launchers.py
ph doctor
```

Save editor files and finish or cancel the current agent turn before restarting those applications. Already-running processes do not automatically load updated code. The launcher installer removes the old `rh`/`rh-edit` aliases that it previously created.

`.gitignore` excludes credentials, local profiles, task/session output, logs, generated code, dependencies, and machine-specific verification reports. Commit source and lockfiles; keep account stores private. The sample CSV in `examples/smoke` is synthetic.

To preview removing the launchers and editor configuration, run `python3 scripts/rollback.py`. Add `--apply` only after closing the harness. Rollback retains accounts, tasks, installed tools, and plugins.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `ph: command not found` | Run `~/.local/bin/ph` or add `~/.local/bin` to PATH |
| I do not know which screen I am typing in | Shell commands go in `run`; `/task` and `/switch` go in `agent`; `:w` goes in Neovim |
| Letters move the cursor instead of inserting text | You are in Neovim Normal mode; press `i` |
| Editor shortcuts switch Zellij modes | Lock Zellij with `Ctrl+g` and try again |
| No worker is selected | Use `/switch`, choose a model, then send your request |
| Login succeeded but the agent does not see it | Finish the current turn, `/quit`, and start `ph agent .` again |
| `doctor` reports an unknown Google credential marker | The official CLI may use a keychain; test the official login/connection rather than creating a plaintext credential file |
| Another harness writer is active | Reattach with `ph open .`; do not start a second `ph agent` for the same project or delete a live lock |
| Switching is blocked by an unknown operation | Inspect the output/process, then use `/task reconcile` with the observed result |
| Existing provider settings are rejected | Use a clean project or explicitly review the conflicting configuration; the harness does not silently merge alternate billing routes |
| Clipboard transfer fails over SSH | Type the file path directly with `/task add`; check OSC52 support in your local terminal |
| Folder/file icons appear as boxes | Install **JetBrainsMono Nerd Font Mono on your local computer**, select it in the terminal, and restart the local terminal application; see [Terminal font setup](#terminal-font-setup) |
| Icons appear as letters such as `f`, `E`, or `W` | Update and run `python3 scripts/install-launchers.py`, then save and restart Neovim with `ph-edit`; an existing editor can retain the old ASCII overrides |
| File icons work but emoji are boxes | Check the local emoji fallback: Segoe UI Emoji (Windows), Apple Color Emoji (macOS), or Noto Color Emoji (Linux) |
| Neovim offers to reload a file changed by the agent | Save your edits before handing the file to the agent; inspect the change before choosing which version to keep |

See [verification and limitations](docs/VERIFICATION.md), [implementation plan](PLAN.md), and [upstream sources](docs/SOURCES.md) for more detail.
