#!/usr/bin/env python3
"""Install Google's unmodified, version-pinned ACP distribution for Linux x86_64."""
import hashlib
import json
import os
import platform
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlopen
from install_paths import DATA_ROOT

VERSION = '1.2.1'
URL = f'https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-{VERSION}-linux-x86_64.zip'
# Hash recorded from the official HTTPS archive; upstream publishes no separate
# signed checksum. This pins our reviewed bytes, not an independent signature.
SHA256 = '9fbf0bd584a26478161f637cabd75113f72541c842d148f578ef1a6a9edcb843'
if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'amd64'):
    raise SystemExit('This installer is pinned for Linux x86_64 only.')
target = DATA_ROOT / 'tools' / f'antigravity-acp-{VERSION}'
manifest = target / 'source.json'
if manifest.exists():
    info = json.loads(manifest.read_text())
    if info.get('archive_sha256') == SHA256 and all(
        (target / name).exists() and hashlib.file_digest((target / name).open('rb'), 'sha256').hexdigest() == digest
        for name, digest in info['files'].items()
    ):
        print(f'Google Antigravity ACP {VERSION}: installed files verified.')
        raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='ph-google-install-') as staging:
    archive = Path(staging) / 'server.zip'
    # Optional local cache is still checked against the pinned digest.
    cached = os.environ.get('PH_GOOGLE_ARCHIVE')
    if cached:
        archive = Path(cached)
    else:
        with urlopen(URL, timeout=120) as response, archive.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    if hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() != SHA256:
        raise SystemExit('Google ACP archive checksum mismatch; installation stopped.')
    target.mkdir(parents=True, exist_ok=True)
    hashes = {}
    with zipfile.ZipFile(archive) as bundle:
        for name in ('agy_acp_server.par', 'localharness_external'):
            data = bundle.read(name)
            (target / name).write_bytes(data)
            (target / name).chmod(0o755)
            hashes[name] = hashlib.sha256(data).hexdigest()
    manifest.write_text(json.dumps({'version': VERSION, 'url': URL, 'archive_sha256': SHA256, 'files': hashes}, indent=2) + '\n')
print(f'Installed Google Antigravity ACP {VERSION}; archive and executable hashes recorded.')
