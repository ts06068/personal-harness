#!/bin/sh
set -eu
# Optional system toolchain for the current Ubuntu container; no host changes.
sudo apt-get update
sudo apt-get install --no-install-recommends build-essential fd-find ripgrep unzip
