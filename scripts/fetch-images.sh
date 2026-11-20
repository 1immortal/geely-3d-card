#!/usr/bin/env bash
# Download + convert Geely 360° frames for the card.
#   scripts/fetch-images.sh --list
#   scripts/fetch-images.sh --model ex5 --color silver
#   scripts/fetch-images.sh --model ex2 --color star-silver
#   scripts/fetch-images.sh --model starray_emi --color cloudveil-silver
# Needs python3 with Pillow (installed into a local .venv automatically if missing).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
py=python3
need="import PIL"
case " $* " in *" --remove-background "*) need="import PIL, numpy, scipy";; esac
if ! "$py" -c "$need" 2>/dev/null; then
  echo "Installing Python dependencies into a local .venv ..."
  "$py" -m venv "$here/../.venv"
  "$here/../.venv/bin/pip" install -q pillow numpy scipy
  py="$here/../.venv/bin/python"
fi
exec "$py" "$here/fetch_images.py" "$@"
