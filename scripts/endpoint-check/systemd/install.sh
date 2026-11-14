#!/usr/bin/env bash
# Installs and starts the daily systemd user timer for the endpoint check, pointing at this checkout.
#   ./systemd/install.sh            install or update, and enable the timer
#   ./systemd/install.sh --remove   stop and remove it
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=$(pwd)
UNITS="$HOME/.config/systemd/user"
NAME=reckonry-endpoint-check
if [[ "${1:-}" == "--remove" ]]; then
  systemctl --user disable --now "$NAME.timer" 2>/dev/null || true
  rm -f "$UNITS/$NAME.service" "$UNITS/$NAME.timer"
  systemctl --user daemon-reload
  echo "Removed the $NAME timer."; exit 0
fi
NODE=$(command -v node)
[ -d node_modules/playwright ] || npm ci --silent
mkdir -p "$UNITS"
# .bashrc is read for GH_TOKEN (the GitHub alert); node is called by its full path, since nvm may not load.
cat > "$UNITS/$NAME.service" <<UNIT
[Unit]
Description=Reckonry Timer: daily Karbon endpoint check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$DIR
ExecStart=/bin/bash -c '. "\$HOME/.bashrc" >/dev/null 2>&1; exec "$NODE" run.mjs'
TimeoutStartSec=15min
UNIT
cat > "$UNITS/$NAME.timer" <<UNIT
[Unit]
Description=Reckonry Timer: daily Karbon endpoint check at 6 AM

[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now "$NAME.timer"
systemctl --user list-timers "$NAME.timer" --no-pager
echo "Installed. Run it now with: systemctl --user start $NAME.service"
