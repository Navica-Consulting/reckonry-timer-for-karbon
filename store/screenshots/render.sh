#!/bin/bash
# Renders the Chrome Web Store screenshots (1280x800) and promo tiles (440x280, 1400x560) to store/screenshots/out/.
# Copies src/ to a work folder with stub.js loaded first, serves it locally, and shoots each page with headless Chrome.
# Works on macOS (Chrome.app, sips) and Linux (Flatpak or packaged Chrome, Python with Pillow).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
port="${PORT:-8795}"
# The work folder sits beside the script, since a Flatpak Chrome can't write to /tmp.
tmp="$here/.work"
rm -rf "$tmp"; mkdir -p "$tmp"
trap 'kill $server 2>/dev/null || true; rm -rf "$tmp"' EXIT

mac_chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -n "${CHROME:-}" ]; then chrome=("$CHROME")
elif [ -x "$mac_chrome" ]; then chrome=("$mac_chrome")
elif command -v google-chrome >/dev/null; then chrome=(google-chrome)
elif flatpak info com.google.Chrome >/dev/null 2>&1; then chrome=(flatpak run com.google.Chrome)
else echo "Chrome not found; set CHROME." >&2; exit 1; fi

cp -R "$root/src" "$tmp/src"
cp "$here/stub.js" "$tmp/src/stub.js"
for f in popup.html complete.html welcome.html; do
  # The stub goes in before the extension's first script.
  perl -0pi -e 's#<script src=#<script src="stub.js"></script>\n<script src=#' "$tmp/src/$f"
done
mkdir "$tmp/shots"
cp "$here"/*.html "$here"/*.css "$here"/frame.js "$tmp/shots/"

# Off the Mac, system-ui falls back to a wide font, so the shots name one close to Segoe UI first.
font="${FONT:-}"
[ -z "$font" ] && [ ! -x "$mac_chrome" ] && font="Open Sans"
if [ -n "$font" ]; then
  find "$tmp/src" "$tmp/shots" -type f \( -name '*.css' -o -name '*.html' -o -name '*.js' \) \
    -exec perl -pi -e "s/(?<![-\\w\"])system-ui/'$font', system-ui/g" {} +
fi

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$tmp" >/dev/null 2>&1 &
server=$!
sleep 1

# Scales the 2x render to the store's size and flattens it: JPEG-safe, 24-bit, no alpha.
flatten() { # in, out, width, height
  if command -v sips >/dev/null; then
    sips -z "$4" "$3" "$1" >/dev/null
    sips -s format jpeg -s formatOptions 100 "$1" --out "$1.jpg" >/dev/null
    sips -s format png "$1.jpg" --out "$2" >/dev/null
  else
    python3 -I -c 'import sys; from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").resize((int(sys.argv[3]), int(sys.argv[4])), Image.LANCZOS)
im.save(sys.argv[2], optimize=True)' "$@"
  fi
}

mkdir -p "$here/out"
shoot() { # page, output name, color scheme (1 light, 0 dark), width, height
  local png="$tmp/$2.png" w="${4:-1280}" h="${5:-800}"
  "${chrome[@]}" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --user-data-dir="$tmp/profile-$2" --window-size=$w,$h --force-device-scale-factor=2 \
    --virtual-time-budget=6000 --blink-settings=preferredColorScheme=${3:-1} --screenshot="$png" "http://127.0.0.1:$port/shots/$1" >/dev/null 2>&1
  flatten "$png" "$here/out/$2.png" "$w" "$h"
  echo "out/$2.png"
}
shoot shot1-timer.html 1-timer
shoot shot2-switch.html 2-switch
shoot shot3-start.html 3-start
shoot shot4-finish.html 4-finish
shoot shot5-away.html 5-away
shoot shot1-timer.html 1-timer-dark 0
shoot small.html small 1 440 280
shoot marquee.html marquee 1 1400 560
