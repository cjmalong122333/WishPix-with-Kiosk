#!/usr/bin/env bash
# Copies the WishPix database and pictures to a folder (e.g. a USB stick):
#   sudo ./deploy/backup.sh /media/pi/USB
set -euo pipefail

DEST="${1:?Usage: backup.sh <folder>}"
DATA=/opt/wishpix/apps/web/data
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DEST/wishpix-backup-$STAMP"

mkdir -p "$OUT"
sqlite3 "$DATA/wishpix.db" ".backup '$OUT/wishpix.db'"
cp -r "$DATA/images" "$OUT/images"
echo "Backup saved to $OUT"
