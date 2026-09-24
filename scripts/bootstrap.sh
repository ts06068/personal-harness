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
python3 scripts/setup.py
