# Personal Harness

Use ChatGPT, Claude, Gemini, or a provider you register from one terminal workspace. Edit with Neovim, move between work tabs with Zellij, and switch workers when you choose.

## Install and start

### Windows

Use **Windows Terminal + WSL2 Ubuntu on an x64 PC**. The workspace runs inside WSL; this is not a native Windows runtime.

1. If WSL is not installed, run `wsl --install -d Ubuntu-24.04` in an administrator PowerShell. Restart Windows if requested, then open Ubuntu once to create your Linux username and password.
2. In normal **Windows PowerShell**, download and run the installer:

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/ts06068/personal-harness/v0.3.0/scripts/install-windows.ps1 -OutFile "$env:TEMP\ph-install.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\ph-install.ps1"
```

3. Open **Windows Terminal → Personal Harness (WSL)**. Run the remaining commands in that Ubuntu tab. Use `-Distribution YOUR_DISTRO` with the installer if you already use another Ubuntu 24.04+ WSL2 distribution.

The installer adds the terminal font and a profile with acrylic at 80% opacity. Reopen Windows Terminal if the new profile or icons do not appear. Your Linux server's logins are separate from your new WSL installation.

### Linux

On x86_64 Linux with Git and Python 3.12+:

```sh
curl -fsSL https://raw.githubusercontent.com/ts06068/personal-harness/v0.3.0/scripts/install.py -o /tmp/ph-install.py
python3 /tmp/ph-install.py
```

### Install with npm instead

In **Linux or the WSL Ubuntu tab**, with Node 22.19+ installed:

Use a Node version manager or a user-writable npm prefix so installation does not require `sudo`.

```sh
npm install -g https://github.com/ts06068/personal-harness/releases/download/v0.3.0/personal-harness-0.3.0.tgz
ph setup
```

This command installs the release package directly; `npm install -g personal-harness` is not available until the package is published to the npm registry. `ph setup --dry-run` previews workspace setup. If `ph` is not on PATH after setup, use `~/.local/bin/ph` or reopen your shell.

### Log in

Run these in an ordinary shell:

```sh
ph login chatgpt
ph login claude
ph login gemini
```

Follow each browser login. On SSH, use the displayed forwarding or callback instructions. Check that extra usage, paid credits and auto-refill are off, then record your confirmation:

```sh
ph billing confirm chatgpt --extra-usage-off
ph billing confirm claude --extra-usage-off
ph billing confirm gemini --extra-usage-off
ph doctor
```

For an existing installation, your saved logins and confirmations remain available. The old `gpt` command alias still works; use `chatgpt` for new commands.

## Know which screen you are using

| Tab | Use it for | Example |
| --- | --- | --- |
| `edit` | Neovim: edit code, notes and drafts | `:w` saves the file |
| `agent` | Requests to the selected worker | `/switch chatgpt` |
| `run` | Ordinary shell commands | `git diff` |

Keep Zellij **locked** while typing in Neovim or the agent. Locked means Zellij shortcuts mostly pass through to the application; it does not lock your files.

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
/switch chatgpt
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

The file picker usually uses the Git/project root. The file tree here is **Neo-tree**, even if the upstream LazyVim documentation shows another explorer. The UI uses LazyVim's native icons; complete [font setup](docs/INSTALLATION.md#terminal-fonts) on your local computer to display them. A configured language server is needed for language-specific features such as “go to definition”; the bootstrap does not install every language server.

References: [Neovim quick reference](https://neovim.io/doc/user/quickref/), [LazyVim keymaps](https://www.lazyvim.org/keymaps).

## Choose and switch AI workers

Enter these at the **agent prompt**:

| Command | Purpose |
| --- | --- |
| `/switch` | Pick a default or registered worker, then a model |
| `/switch chatgpt` | Choose a ChatGPT worker |
| `/switch claude` | Choose a Claude worker |
| `/switch gemini` | Choose the official Antigravity ACP account-default worker |
| `/review PROVIDER` | Start a fresh read-only review segment with the provider you choose |
| `/task` | Show the current goal, decisions, next steps, and unresolved operations |
| `/task new DESCRIPTION` | Archive the previous task state and begin a new task; then use `/switch` |
| `/task goal DESCRIPTION` | Update the current task's goal |
| `/task decision DESCRIPTION` | Record a decision you have made |
| `/task next DESCRIPTION` | Record the next step |
| `/task add PATH` | Select an input file within the project |
| `/handoff` | Save the task handoff without calling a model |
| `/usage` | Show recorded usage; unavailable values remain unknown |
| `/instructions [PATH]` | Preview and approve project instructions; defaults to a file picker |
| `/instructions remove [PATH]` | Remove one approval, or all approvals when no path is given |
| `/checkpoint` | Review, edit, approve or reject the current worker's proposed checkpoint |
| `/task resolve ID NOTE` | Record your observed resolution of an operation's warning signals |
| `/ui motion full\|reduced\|off` | Set and persist animation preference |
| `/task done` | Mark the task complete after operations have settled |
| `/quit` | Exit the agent |

Press **Esc** to interrupt an active agent turn. Wait for tools to settle before switching or starting a new task. In a picker, Esc cancels that picker.

### When a rate limit is reached

The harness records the failure and pauses; it does not endlessly retry or select another paid route. To continue:

1. Run `/task` and inspect the saved result and pending operations.
2. Record anything important with `/task decision ...` and `/task next ...`.
3. Run `/switch claude`, `/switch gemini`, or `/switch chatgpt` to choose an available worker.
4. Send a new instruction, such as: “Continue from the saved handoff. Check the existing results before running anything again.”

Switching passes a compact task packet: goal, approved decisions, selected file paths, changes, results, open warnings, and next steps. It does not copy the full conversation. Ask the current worker to **propose a checkpoint**, then use `/checkpoint` to inspect it. Pending proposals must be approved or rejected before switching. You can still record decisions manually with `/task decision` and `/task next`; conversation alone does not automatically become approved state.

Ask the worker to read the original saved result when a summary is insufficient. Record how you resolved warnings with `/task resolve OPERATION_ID your observation`.

### Apply project instructions once

1. Put concise project rules in `AGENTS.md`, or choose another small file within the project.
2. In the agent, run `/instructions`, select the file, read its contents and approve it.
3. Run `/switch` to create a fresh segment with those instructions.
4. If the file or an imported Gemini instruction changes, review it again. A changed approval pauses the next request.

Approve only the instructions relevant to this project. Use `/instructions remove` to stop applying them.

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
6. Review `/checkpoint` proposals and record decisions; use `/review` when an independent review helps.
7. Save files, run `/handoff`, and detach.

For writing, select the draft and sources. For programming, select the code and requirements. For research, select the approved plan and relevant results. A task does not need to involve code.

## Add another worker

List the enabled routes and Pi's built-in provider IDs:

```sh
ph providers list
ph providers catalog
```

For example, to use your own OpenRouter API account:

```sh
ph providers add openrouter --allow-paid-api
ph login openrouter
```

Restart the agent, then use `/switch openrouter` and choose a model. API routes can incur charges. They are only enabled when you register them; a rate limit never switches to one automatically.

For a local model server, save a file such as `ollama.json` with your installed model ID:

```json
{
  "id": "ollama",
  "label": "Ollama",
  "billing": "local",
  "baseUrl": "http://127.0.0.1:11434/v1",
  "api": "openai-completions",
  "models": [{ "id": "YOUR_INSTALLED_MODEL_ID" }]
}
```

Start the model server in the same Linux/WSL environment, then register it:

```sh
ph providers add ./ollama.json
```

Restart the agent and use `/switch ollama`. Model names and tool support depend on your server. For hosted compatible endpoints and additional OAuth subscriptions, see the [provider guide](docs/PROVIDERS.md).

Remove an added route with `ph providers remove PROVIDER_ID`. To adjust animation, use `/ui motion full`, `/ui motion reduced`, or `/ui motion off` in the agent.

## When something goes wrong

| Problem | Next step |
| --- | --- |
| `ph` is not found | Use `~/.local/bin/ph`, or add `~/.local/bin` to PATH |
| Typing moves the cursor | Press `i` to enter Neovim Insert mode |
| Editor keys control Zellij | Press `Ctrl+g` to return to locked mode |
| No worker is selected | Run `/switch` in the agent tab |
| A provider reaches its limit | Inspect `/task`, then manually `/switch` to another registered worker |
| A checkpoint is pending | Run `/checkpoint` and approve, edit or reject the proposal |
| Icons are boxes | Select JetBrainsMono Nerd Font Mono in the local terminal; see [font setup](docs/INSTALLATION.md#terminal-fonts) |
| Windows installation stops at WSL setup | Finish the requested restart and Ubuntu user setup, then rerun the installer |

See [installation and updates](docs/INSTALLATION.md) for other setup options. Save files and finish or cancel active work before restarting the editor or agent; reconnecting to an existing Zellij session keeps its running programs.
