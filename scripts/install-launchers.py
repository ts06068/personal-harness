#!/usr/bin/env python3
"""Install dedicated launchers/config. Never replace existing editor or shell config."""
from pathlib import Path
import datetime
import json
import re
import shlex
import shutil
from install_paths import DATA_ROOT, NVIM_APPNAME

repo = Path(__file__).resolve().parents[1]
root = DATA_ROOT
bin_dir = root / 'bin'
manifest_path = root / 'install-manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'created': [], 'repo': str(repo), 'backups': []}
manifest['repo'] = str(repo)
def owned_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and str(path) not in manifest['created']:
        backup = path.with_name(path.name + '.before-ph-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S'))
        shutil.copy2(path, backup)
        manifest['backups'].append({'path': str(path), 'backup': str(backup)})
    path.write_text(text)
    if str(path) not in manifest['created']: manifest['created'].append(str(path))
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

launcher = '#!/bin/sh\nexec ' + shlex.quote(str(bin_dir / 'node')) + ' ' + shlex.quote(str(repo / 'dist/cli.js')) + ' "$@"\n'
editor = '#!/bin/sh\nexport NVIM_APPNAME=' + shlex.quote(NVIM_APPNAME) + '\nexport PATH=' + shlex.quote(str(bin_dir)) + ':"$PATH"\nexport CC=' + shlex.quote(str(bin_dir / 'cc')) + '\nexec ' + shlex.quote(str(bin_dir / 'nvim')) + ' "$@"\n'
for name in ['ph', 'ph-edit']:
    owned_write(bin_dir / name, editor if name.endswith('-edit') else launcher)
    (bin_dir / name).chmod(0o755)
    dest = Path.home() / '.local/bin' / name
    owned_write(dest, '#!/bin/sh\nexec ' + shlex.quote(str(bin_dir / name)) + ' "$@"\n')
    dest.chmod(0o755)
editor_config = Path.home() / '.config' / NVIM_APPNAME
owned_write(editor_config / 'init.lua', (repo / 'config/nvim/init.lua').read_text())
for source in (repo / 'config/nvim/lua').rglob('*.lua'):
    owned_write(editor_config / 'lua' / source.relative_to(repo / 'config/nvim/lua'), source.read_text())
if (repo / 'config/nvim/lazy-lock.json').exists():
    owned_write(editor_config / 'lazy-lock.json', (repo / 'config/nvim/lazy-lock.json').read_text())
# Preserve key bindings in a harness-specific copy. Set this only in the file:
# Zellij 0.45.1's CLI boolean merge uses XOR, so also passing true toggles it off.
zellij_source = Path.home() / '.config/zellij/config.kdl'
zellij_config = zellij_source.read_text() if zellij_source.exists() else ''
zellij_config = re.sub(r'(?m)^\s*simplified_ui\s+(?:true|false)[^\n]*$', '', zellij_config)
zellij_config = re.sub(r'(?m)^\s*pane_frames\s+(?:true|false)[^\n]*$', '', zellij_config)
owned_write(root / 'config/zellij.kdl', zellij_config.rstrip() + '\n\nsimplified_ui false\npane_frames false\n')
# Retire only aliases recorded as ours, without deleting an unrelated command.
for directory in [bin_dir, Path.home() / '.local/bin']:
    for name in ['rh', 'rh-edit']:
        alias = directory / name
        if str(alias) in manifest['created']:
            alias.unlink(missing_ok=True)
            manifest['created'].remove(str(alias))
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('Installed Personal Harness: ph and ph-edit.')
print('Manifest:', manifest_path)
