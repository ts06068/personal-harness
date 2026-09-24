#!/usr/bin/env python3
"""Install a verified GitHub release on Linux x86_64, including WSL2."""
import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

VERSION = '0.3.1'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--version', default=VERSION)
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--skip-editor-plugins', action='store_true')
parser.add_argument('--archive', type=Path, help='Use a local release archive; requires --sha256.')
parser.add_argument('--sha256', help='Expected hash for --archive.')
args = parser.parse_args()
if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', args.version):
    raise SystemExit('Invalid release version.')
if platform.system() != 'Linux' or platform.machine() != 'x86_64':
    raise SystemExit('Use Linux x86_64 or the Windows PowerShell installer (WSL2 Ubuntu).')
if sys.version_info < (3, 12) or not shutil.which('git'):
    raise SystemExit('Python 3.12+ and Git are required. On Ubuntu 24.04+: sudo apt-get install python3 git curl ca-certificates')
install_home = Path(os.environ.get('PH_INSTALL_HOME') or Path.home()).resolve()
legacy = install_home / '.local/share/research-harness'
current = install_home / '.local/share/personal-harness'
data = Path(os.environ.get('PH_DATA_DIR') or (legacy if legacy.exists() and not current.exists() else current))
filename = f'personal-harness-{args.version}.tgz'
url = f'https://github.com/ts06068/personal-harness/releases/download/v{args.version}'
runtime = data / 'apps' / args.version
if args.dry_run:
    print(f'Release: {url}/{filename}\nRuntime: {runtime}\nWorkspace: {data}\nNo files changed.')
    raise SystemExit(0)

def fetch(source, target):
    with urlopen(Request(source, headers={'User-Agent': 'personal-harness-installer'}), timeout=120) as response, target.open('wb') as output:
        shutil.copyfileobj(response, output)

with tempfile.TemporaryDirectory(prefix='ph-release-') as temp:
    staging = Path(temp)
    archive = args.archive
    digest = args.sha256
    if archive:
        if not digest or not re.fullmatch(r'[a-fA-F0-9]{64}', digest):
            raise SystemExit('--archive requires a valid --sha256.')
    else:
        archive = staging / filename
        sums = staging / 'SHA256SUMS'
        fetch(url + '/SHA256SUMS', sums)
        matches = [line.split()[0] for line in sums.read_text().splitlines() if len(line.split()) == 2 and line.split()[1] == filename]
        if len(matches) != 1:
            raise SystemExit('Release checksum record is missing or ambiguous.')
        digest = matches[0]
        fetch(url + '/' + filename, archive)
    if hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() != digest.lower():
        raise SystemExit('Release archive checksum mismatch.')
    with tarfile.open(archive) as bundle:
        bundle.extractall(staging / 'unpacked', filter='data')
    package = staging / 'unpacked/package'
    meta = json.loads((package / 'package.json').read_text())
    if meta['name'] != 'personal-harness' or meta['version'] != args.version:
        raise SystemExit('Release metadata differs from the requested package.')
    env = {**os.environ, 'PH_INSTALL_HOME': str(install_home), 'PH_DATA_DIR': str(data)}
    subprocess.run([sys.executable, str(package / 'scripts/bootstrap-tools.py')], check=True, env=env)
    env['PATH'] = str(data / 'bin') + os.pathsep + env.get('PATH', '')
    runtime.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(data / 'bin/npm'), 'install', '--prefix', str(runtime), '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', str(archive.resolve())], check=True, env=env)
    cli = runtime / 'node_modules/personal-harness/dist/cli.js'
    command = [str(data / 'bin/node'), str(cli), 'setup']
    if args.skip_editor_plugins:
        command.append('--skip-editor-plugins')
    subprocess.run(command, check=True, env=env)
