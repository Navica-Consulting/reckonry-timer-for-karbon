#!/bin/bash
# Renders the Chrome Web Store screenshots to store/screenshots/out/ at 1280x800.
# Copies src/ to a temp folder with stub.js loaded first, serves it locally, and shoots each page with headless Chrome.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
port="${PORT:-8795}"
tmp="$(mktemp -d)"
trap 'kill $server 2>/dev/null || true; rm -rf "$tmp"' EXIT

cp -R "$root/src" "$tmp/src"
cp "$here/stub.js" "$tmp/src/stub.js"
for f in popup.html complete.html welcome.html; do
  # The stub goes in before the extension's first script.
  perl -0pi -e 's#<script src=#<script src="stub.js"></script>\n<script src=#' "$tmp/src/$f"
done
mkdir "$tmp/shots"
cp "$here"/*.html "$here"/*.css "$here"/frame.js "$tmp/shots/"

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$tmp" >/dev/null 2>&1 &
server=$!
sleep 1

mkdir -p "$here/out"
shoot() { # page, output name, color scheme (1 light, 0 dark)
  local png="$tmp/$2.png"
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --user-data-dir="$tmp/profile-$2" --window-size=1280,800 --force-device-scale-factor=2 \
    --virtual-time-budget=6000 --blink-settings=preferredColorScheme=${3:-1} --screenshot="$png" "http://127.0.0.1:$port/shots/$1" >/dev/null 2>&1
  # Rendered at 2x for clean text, then scaled to the store's 1280x800, with no alpha channel.
  sips -z 800 1280 "$png" >/dev/null
  sips -s format jpeg -s formatOptions 100 "$png" --out "$tmp/$2.jpg" >/dev/null
  sips -s format png "$tmp/$2.jpg" --out "$here/out/$2.png" >/dev/null
  echo "out/$2.png"
}
shoot shot1-timer.html 1-timer
shoot shot2-switch.html 2-switch
shoot shot3-start.html 3-start
shoot shot4-finish.html 4-finish
shoot shot5-away.html 5-away
shoot shot1-timer.html 1-timer-dark 0
