#!/usr/bin/env python3
"""Set up the already installed package; no model calls or account changes."""
import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from install_paths import DATA_ROOT, INSTALL_HOME

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--skip-editor-plugins', action='store_true', help='Install tools/config only; restore editor plugins later with ph setup.')
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
if platform.system() != 'Linux' or platform.machine() != 'x86_64':
    raise SystemExit('The runtime requires Linux x86_64. On Windows use the PowerShell installer with WSL2 Ubuntu.')
if sys.version_info < (3, 12):
    raise SystemExit('Python 3.12+ is required (Ubuntu 24.04 or newer).')
if not shutil.which('git'):
    raise SystemExit('Git is required. On Ubuntu: sudo apt-get install git')
if '_npx' in repo.parts:
    raise SystemExit('Install the package persistently with npm install -g PACKAGE_OR_TARBALL before ph setup. An npx cache is not an installation directory.')
scripts = ['bootstrap-tools.py', 'bootstrap-editor-tools.py', 'install-ui.py', 'install-google.py', 'install-launchers.py']
print(f'Personal Harness setup: {DATA_ROOT}\nLaunchers: {INSTALL_HOME / ".local/bin"}', flush=True)
if args.dry_run:
    print('Would run: ' + ', '.join(scripts))
    print('Editor plugins: ' + ('deferred' if args.skip_editor_plugins else 'restore pinned plugins and parsers'))
    raise SystemExit(0)
env = {**os.environ, 'PATH': str(DATA_ROOT / 'bin') + os.pathsep + os.environ.get('PATH', '')}
for name in scripts:
    subprocess.run([sys.executable, str(repo / 'scripts' / name)], check=True, env=env)
if not args.skip_editor_plugins:
    logs = DATA_ROOT / 'setup-logs'
    logs.mkdir(parents=True, exist_ok=True, mode=0o700)
    editor_env = {**env, 'PH_SETUP_EDITOR': '1', 'PH_SETUP_EDITOR_SCRIPT': str(repo / 'scripts/setup-editor.lua')}
    for name, command in [('plugins', '+Lazy! restore'), ('parsers', '+lua dofile(vim.env.PH_SETUP_EDITOR_SCRIPT)')]:
        print(f'Installing editor {name}; log: {logs / (name + ".log")}', flush=True)
        with (logs / (name + '.log')).open('w') as output:
            subprocess.run([str(DATA_ROOT / 'bin/ph-edit'), '--headless', command, '+qa'], check=True, env=editor_env, stdout=output, stderr=subprocess.STDOUT)
subprocess.run([str(DATA_ROOT / 'bin/ph'), 'doctor'], check=True, env=env)
print('Setup complete. Open a new shell if ph is not on PATH, or use ' + str(INSTALL_HOME / '.local/bin/ph'))
print('Next: ph login chatgpt; ph login claude; ph login gemini. Confirm billing settings before model calls.')
