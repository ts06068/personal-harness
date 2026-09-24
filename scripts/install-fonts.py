#!/usr/bin/env python3
"""Install pinned terminal fonts for the current Linux/macOS user, without sudo.

Run on the computer displaying the terminal. Installing on an SSH server alone
cannot change the fonts used by its clients.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request


def main():
    manifest = json.loads((Path(__file__).resolve().parents[1] / 'config/fonts.json').read_text())
    if sys.platform.startswith('linux'):
        data = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
        destination = data / 'fonts/personal-harness'
    elif sys.platform == 'darwin':
        destination = Path.home() / 'Library/Fonts/PersonalHarness'
    else:
        sys.exit('On Windows, install the Mono TTF files as described in README > Terminal font setup.')

    # Verify every download before replacing any installed file.
    downloads = []
    for font in manifest['files']:
        if font['emoji'] and sys.platform != 'linux':
            continue  # macOS supplies Apple Color Emoji.
        target = destination / font['file']
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == font['sha256']:
            print('Already installed:', font['file'])
            continue
        print('Downloading:', font['file'], flush=True)
        with urllib.request.urlopen(font['url'], timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != font['sha256']:
            sys.exit('SHA-256 mismatch: ' + font['file'])
        downloads.append((target, data))

    destination.mkdir(parents=True, exist_ok=True)
    for target, data in downloads:
        temporary = target.with_suffix(target.suffix + '.tmp')
        temporary.write_bytes(data)
        temporary.replace(target)
    if sys.platform.startswith('linux') and shutil.which('fc-cache'):
        subprocess.run(['fc-cache', '-f', str(destination)], check=True)
    print('Fonts installed in:', destination)
    print('Select this font in your terminal:', manifest['terminal_family'])
    print('SSH / VS Code Remote: also install and select it on your LOCAL computer.')
    print('Restart the local terminal application after changing its font.')


if __name__ == '__main__':
    main()
