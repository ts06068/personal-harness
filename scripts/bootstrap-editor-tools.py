#!/usr/bin/env python3
"""User-local compiler and search tools; no sudo or shell-profile overwrite."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('bootstrap-tools.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

zig = b.install('zig', '0.15.2', 'https://ziglang.org/download/0.15.2/zig-x86_64-linux-0.15.2.tar.xz', '02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239', 'zig-x86_64-linux-0.15.2')
b.link('zig', zig / 'zig')
for name, language in [('cc', 'cc'), ('c++', 'c++')]:
    dest = b.BIN / name
    dest.write_text('#!/usr/bin/env python3\nimport os, sys\nargs = [a.replace("x86_64-unknown-linux-gnu", "x86_64-linux-gnu") for a in sys.argv[1:]]\nos.execv(' + repr(str(zig / 'zig')) + ', ["zig", ' + repr(language) + '] + args)\n')
    dest.chmod(0o755)
rg = b.install('ripgrep', '15.1.0', 'https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep-15.1.0-x86_64-unknown-linux-musl.tar.gz', '1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599', 'ripgrep-15.1.0-x86_64-unknown-linux-musl')
b.link('rg', rg / 'rg')
fd = b.install('fd', '10.5.0', 'https://github.com/sharkdp/fd/releases/download/v10.5.0/fd-v10.5.0-x86_64-unknown-linux-musl.tar.gz', '761c72dc8e120d85b22292063be8a796e2eeb20eb3e4f38b8fa2343ccf3514a7', 'fd-v10.5.0-x86_64-unknown-linux-musl')
b.link('fd', fd / 'fd')
url = 'https://github.com/tree-sitter/tree-sitter/releases/download/v0.27.0/tree-sitter-linux-x64.gz'
digest = '20a1f39ec1c45f2211492dcb8881c802b643b554bb196869a29ac3778277fa77'
target = b.VERSIONS / 'tree-sitter-0.27.0'
target.mkdir(exist_ok=True)
payload = b.fetch(url)
if hashlib.sha256(payload).hexdigest() != digest:
    raise RuntimeError('tree-sitter checksum mismatch')
binary = target / 'tree-sitter'
binary.write_bytes(gzip.decompress(payload))
binary.chmod(0o755)
(target / '.research-install.json').write_text(json.dumps({'url': url, 'version': '0.27.0', 'sha256': digest}) + '\n')
b.link('tree-sitter', binary)
print('Editor build and search tools installed.', flush=True)
