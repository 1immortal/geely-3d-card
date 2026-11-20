#!/usr/bin/env bash
# Download + convert the Geely EX5 360° frames for one color.
# Usage: scripts/fetch-images.sh [silver|grey|green|black|white] [output_dir]
# Needs python3 with Pillow (installed into a local venv automatically if missing).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
py=python3
if ! "$py" -c "import PIL" 2>/dev/null; then
  echo "Pillow not found - creating a local virtualenv in .venv ..."
  "$py" -m venv "$here/../.venv"
  "$here/../.venv/bin/pip" install -q pillow
  py="$here/../.venv/bin/python"
fi
exec "$py" "$here/fetch_images.py" "$@"
