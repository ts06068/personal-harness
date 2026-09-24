"""Shared installer paths; retain existing account stores when upgrading."""
from pathlib import Path
import os
import sys

INSTALL_HOME = Path(os.environ.get('PH_INSTALL_HOME') or Path.home()).resolve()


def persistent_root(kind):
    current = INSTALL_HOME / f'.local/{kind}/personal-harness'
    previous = INSTALL_HOME / f'.local/{kind}/research-harness'
    return previous if previous.exists() and not current.exists() else current


DATA_ROOT = Path(os.environ.get('PH_DATA_DIR') or persistent_root('share'))
STATE_ROOT = Path(os.environ.get('PH_STATE_DIR') or persistent_root('state'))
NVIM_APPNAME = (
    'research-nvim'
    if (INSTALL_HOME / '.config/research-nvim').exists()
    and not (INSTALL_HOME / '.config/personal-nvim').exists()
    else 'personal-nvim'
)

if __name__ == '__main__':
    print({'data': DATA_ROOT, 'state': STATE_ROOT, 'editor': NVIM_APPNAME}[sys.argv[1]])
