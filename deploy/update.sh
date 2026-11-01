#!/usr/bin/env bash
# Updates an installed kiosk to the code in this checkout:  sudo ./deploy/update.sh
# Keeps the .env files and the data folders; database migrations run on start.
set -euo pipefail

APP=/opt/wishpix
SRC="$(cd "$(dirname "$0")/.." && pwd)"
[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }

# Back up the database first.
DB=$APP/apps/web/data/wishpix.db
[[ -f $DB ]] && sqlite3 "$DB" ".backup '$DB.$(date +%Y%m%d-%H%M%S).bak'"

rsync -a --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude data --exclude .venv --exclude .env \
  --exclude .git "$SRC/" "$APP/"
chown -R wishpix:wishpix "$APP"

sudo -u wishpix -H bash -c "cd $APP/apps/web && npm ci && npm run build"
sudo -u wishpix -H bash -c "cd $APP/services/hardware && .venv/bin/pip install -r requirements.txt"

systemctl restart wishpix-hardware wishpix-web
echo "Updated. The kiosk screen reloads by itself, or use Restart Kiosk in the Teacher App."
