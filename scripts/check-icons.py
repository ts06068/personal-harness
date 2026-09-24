#!/usr/bin/env python3
"""Print visual font samples; SSH clients render these with their local fonts."""
import shutil
import subprocess

samples = [
    ('Nerd Font: folder / file / Python / Git', '\uf07b  \uf15b  \ue606  \ue702'),
    ('Nerd Font: search / gear / home', '\uf002  \uf013  \U000f02dc'),
    ('Powerline separators', '\ue0b0\ue0b2  \ue0b1\ue0b3'),
    ('Emoji: smile / rocket / folder / check', '\U0001f600  \U0001f680  \U0001f4c1  \u2705'),
    ('Box drawing', '\u250c\u2500\u2500\u2510  \u2502  \u2514\u2500\u2500\u2518'),
    ('Korean', '\ud55c\uae00 \ud45c\uc2dc \ud655\uc778'),
]
for label, glyphs in samples:
    print(f'{label}:  {glyphs}')
print('\nLook at this screen: icons should be shapes, not boxes or letters.')
print('This program cannot inspect the font rendering on an SSH client.')
if shutil.which('fc-match'):
    print('\nFont matches on THIS machine (not your SSH client):')
    for family in ['JetBrainsMono Nerd Font Mono', 'Noto Color Emoji']:
        result = subprocess.run(['fc-match', '-f', '%{family}\n', family], check=True, capture_output=True, text=True)
        print(f'  {family} -> {result.stdout.strip()}')
