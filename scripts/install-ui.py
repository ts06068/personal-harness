#!/usr/bin/env python3
"""Install a pinned local status plugin and render the managed transparent layout."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen
from install_paths import DATA_ROOT

VERSION = '0.25.0'
SHA256 = '282ceab219e56e1908c9fac33907241fe6c3e1ef7d85faab3e5f438cef87b8fe'
URL = f'https://github.com/dj95/zjstatus/releases/download/v{VERSION}/zjstatus.wasm'
repo = Path(__file__).resolve().parents[1]
target = DATA_ROOT / 'tools' / f'zjstatus-{VERSION}' / 'zjstatus.wasm'
target.parent.mkdir(parents=True, exist_ok=True)
if not target.exists():
    with urlopen(Request(URL, headers={'User-Agent': 'personal-harness-setup'}), timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise SystemExit('zjstatus checksum mismatch; installation stopped.')
    target.write_bytes(data)
if hashlib.sha256(target.read_bytes()).hexdigest() != SHA256:
    raise SystemExit('Installed zjstatus checksum mismatch; installation stopped.')
(target.parent / 'source.json').write_text(json.dumps({'url': URL, 'sha256': SHA256, 'version': VERSION}, indent=2) + '\n')
config = DATA_ROOT / 'config'
config.mkdir(parents=True, exist_ok=True)
bars = (repo / 'config/zellij/bars.kdl').read_text().replace('__PH_ZJSTATUS__', str(target))
layout = (repo / 'config/zellij/personal.kdl').read_text().replace('layout {', 'layout {\n' + bars, 1)
(config / 'personal.kdl').write_text(layout)
(config / 'bars.kdl').write_text(bars)
print(f'Installed transparent bars: zjstatus {VERSION}, SHA-256 verified.')
