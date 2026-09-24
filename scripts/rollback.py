#!/usr/bin/env python3
"""Remove only recorded launchers/config; preserve accounts, tasks and installed tools."""
import argparse
import datetime
import json
from pathlib import Path
import shutil
from install_paths import DATA_ROOT

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = DATA_ROOT
manifest = json.loads((root / 'install-manifest.json').read_text())
print('Account credentials, task state, runtimes and plugins will be retained.')
for path in manifest['created']:
    print('Retire launcher/config:', path)
if not args.apply:
    print('Preview only. Run with --apply after closing ph and ph-edit.')
    raise SystemExit(0)
archive = root / ('retired-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S'))
archive.mkdir(mode=0o700)
for index, value in enumerate(manifest['created']):
    path = Path(value)
    if path.exists(): shutil.move(str(path), archive / f'{index}-{path.name}')
for backup in manifest['backups']:
    source = Path(backup['backup'])
    if source.exists(): shutil.copy2(source, backup['path'])
print('Retired files:', archive)
