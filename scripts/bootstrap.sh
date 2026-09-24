#!/bin/sh
set -eu
task_repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$task_repo"
python3 scripts/bootstrap-tools.py
python3 scripts/bootstrap-editor-tools.py
task_data=$(python3 scripts/install_paths.py data)
export PATH="$task_data/bin:$PATH"
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
python3 scripts/install-launchers.py
ph-edit --headless '+Lazy! restore' +qa > /tmp/ph-plugin-restore.log 2>&1
ph-edit --headless '+lua require("nvim-treesitter").install({"bash", "json", "lua", "markdown", "markdown_inline", "python", "query", "vim", "vimdoc"}):wait(300000)' +qa > /tmp/ph-parser-install.log 2>&1
ph doctor
