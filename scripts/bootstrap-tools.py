#!/usr/bin/env python3
"""Install checksum-verified, pinned runtimes into persistent user storage."""
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json
import os
import platform
import shutil
import tarfile
import tempfile
from install_paths import DATA_ROOT

ROOT = DATA_ROOT
BIN = ROOT / 'bin'
VERSIONS = ROOT / 'tools'
CACHE = ROOT / 'downloads'


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'personal-harness-setup'}), timeout=90) as response:
        return response.read()


def install(name, version, url, digest, member_root=''):
    target = VERSIONS / (name + '-' + version)
    record = target / '.research-install.json'
    if record.exists():
        existing = json.loads(record.read_text())
        if existing['sha256'] != digest:
            raise RuntimeError('Installed checksum differs: ' + name)
        print('Already installed:', name, version, flush=True)
        return target
    archive = CACHE / url.rsplit('/', 1)[-1]
    if not archive.exists():
        payload = fetch(url)
        if hashlib.sha256(payload).hexdigest() != digest:
            raise RuntimeError('Download checksum mismatch: ' + name)
        archive.write_bytes(payload)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Cached checksum mismatch: ' + name)
    with tempfile.TemporaryDirectory(prefix='unpack-', dir=VERSIONS) as temp:
        unpack = Path(temp)
        with tarfile.open(archive) as tar:
            tar.extractall(unpack, filter='data')
        source = unpack / member_root if member_root else unpack
        target.mkdir()
        for item in source.iterdir():
            shutil.move(str(item), target / item.name)
    record.write_text(json.dumps({'name': name, 'version': version, 'url': url, 'sha256': digest}, indent=2) + '\n')
    print('Installed:', name, version, flush=True)
    return target


def link(name, target):
    dest = BIN / name
    if dest.is_symlink():
        dest.unlink()
    elif dest.exists():
        raise RuntimeError('Refusing to overwrite ' + str(dest))
    dest.symlink_to(target)


def main():
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise SystemExit('This pinned bootstrap targets Linux x86_64.')
    for directory in [ROOT, BIN, VERSIONS, CACHE]:
        directory.mkdir(parents=True, exist_ok=True)
    node_name = 'node-v22.22.1-linux-x64.tar.xz'
    sums = fetch('https://nodejs.org/dist/v22.22.1/SHASUMS256.txt').decode()
    node_hash = next(line.split()[0] for line in sums.splitlines() if line.split()[-1] == node_name)
    node = install('node', '22.22.1', 'https://nodejs.org/dist/v22.22.1/' + node_name, node_hash, 'node-v22.22.1-linux-x64')
    for name in ['node', 'npm', 'npx']:
        link(name, node / 'bin' / name)
    nvim = install('neovim', '0.11.6', 'https://github.com/neovim/neovim/releases/download/v0.11.6/nvim-linux-x86_64.tar.gz', '2fc90b962327f73a78afbfb8203fd19db8db9cdf4ee5e2bef84704339add89cc', 'nvim-linux-x86_64')
    link('nvim', nvim / 'bin/nvim')
    zellij = install('zellij', '0.45.1', 'https://github.com/zellij-org/zellij/releases/download/v0.45.1/zellij-no-web-x86_64-unknown-linux-musl.tar.gz', 'd7bda1e18c30a688833ae7627f1d6a253bbba5349a4bc48e4f0ec008aaf75ed1')
    link('zellij', zellij / 'zellij')


if __name__ == '__main__':
    main()
