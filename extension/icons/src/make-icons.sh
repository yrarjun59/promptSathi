#!/usr/bin/env bash
# Generate the extension PNG icons by scaling the user's artwork
# (whispering icon.png in the icons folder) via headless Chrome.
# Usage: bash make-icons.sh
set -euo pipefail

ICONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ICONS_DIR/whispering icon.png"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

for SIZE in 16 32 48 128; do
  HTML="$SRC_DIR/resize$SIZE.html"
  PNG="$ICONS_DIR/icon$SIZE.png"
  cat > "$HTML" <<EOF
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden;background:transparent}
img{display:block;width:${SIZE}px;height:${SIZE}px;-webkit-optimize-contrast;image-rendering:auto}</style>
</head><body><img src="file://$SRC"></body></html>
EOF
  google-chrome --headless=new --disable-gpu --no-sandbox \
    --default-background-color=00000000 \
    --window-size="$SIZE,$SIZE" \
    --screenshot="$PNG" \
    "file://$HTML" >/dev/null 2>&1
  echo "wrote $PNG"
done
