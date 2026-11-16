#!/usr/bin/env bash
# WishPix: one-time setup of a Raspberry Pi 4 (Raspberry Pi OS Bookworm, 64-bit,
# desktop). Run from a checkout of this repository:
#
#   sudo ./deploy/setup-pi.sh
#
# It installs Node.js, Python, CUPS + HPLIP and Chromium, copies WishPix to
# /opt/wishpix, builds it, creates the services and makes the screen open
# the kiosk on boot. Safe to run again (existing .env files are kept).
set -euo pipefail

APP=/opt/wishpix
KIOSK_USER="${KIOSK_USER:-${SUDO_USER:-pi}}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }
echo "==> Installing WishPix from $SRC to $APP (kiosk user: $KIOSK_USER)"

# ---------- System packages ----------
apt-get update
apt-get install -y ca-certificates curl git rsync sqlite3 \
  python3 python3-venv python3-pip \
  cups cups-ipp-utils printer-driver-hpcups hplip \
  chromium unclutter fonts-dejavu-core fonts-noto-color-emoji \
  build-essential

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

timedatectl set-timezone Asia/Manila || true

# ---------- Service user and files ----------
id wishpix >/dev/null 2>&1 || useradd --system --home-dir /var/lib/wishpix --create-home --shell /usr/sbin/nologin wishpix
usermod -aG lpadmin,lp wishpix

mkdir -p "$APP"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude data --exclude .venv --exclude .env \
  --exclude .git "$SRC/" "$APP/"

# ---------- Web app ----------
WEB=$APP/apps/web
if [[ ! -f $WEB/.env ]]; then
  cp "$WEB/.env.example" "$WEB/.env"
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" "$WEB/.env"
  HW_TOKEN=$(openssl rand -hex 24)
  sed -i "s/^HARDWARE_TOKEN=.*/HARDWARE_TOKEN=$HW_TOKEN/" "$WEB/.env"
  echo "    Created $WEB/.env. Add your API keys there later (see docs/deployment.md)."
fi
mkdir -p "$WEB/data"
chown -R wishpix:wishpix "$APP"

sudo -u wishpix -H bash -c "cd $WEB && npm ci && npm run build"

if [[ -z "$(sudo -u wishpix sqlite3 "$WEB/data/wishpix.db" 'SELECT 1 FROM teachers LIMIT 1' 2>/dev/null || true)" ]]; then
  read -rp "First teacher username [teacher]: " ADMIN_USERNAME
  read -rsp "First teacher password (8+ characters): " ADMIN_PASSWORD; echo
  read -rp "Kiosk name [WishPix Kiosk]: " KIOSK_NAME
  sudo -u wishpix -H bash -c "cd $WEB && CHECKPOINT_DISABLE=1 npx prisma migrate deploy"
  sudo -u wishpix -H env ADMIN_USERNAME="${ADMIN_USERNAME:-teacher}" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    KIOSK_NAME="${KIOSK_NAME:-WishPix Kiosk}" NODE_ENV=production bash -c "cd $WEB && npm run db:seed"
fi

# ---------- Hardware service ----------
HW=$APP/services/hardware
if [[ ! -f $HW/.env ]]; then
  cp "$HW/.env.example" "$HW/.env"
  sed -i "s/^PRINTER_MODE=.*/PRINTER_MODE=cups/" "$HW/.env"
  TOKEN=$(grep '^HARDWARE_TOKEN=' "$WEB/.env" | cut -d= -f2)
  sed -i "s/^HARDWARE_TOKEN=.*/HARDWARE_TOKEN=$TOKEN/" "$HW/.env"
fi
mkdir -p "$HW/data"
chown -R wishpix:wishpix "$HW"
sudo -u wishpix -H bash -c "cd $HW && python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.txt"

# ---------- Services ----------
install -m 644 "$APP/deploy/systemd/wishpix-hardware.service" /etc/systemd/system/
install -m 644 "$APP/deploy/systemd/wishpix-web.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cups wishpix-hardware wishpix-web

# ---------- Kiosk screen ----------
install -d /etc/chromium/policies/managed
install -m 644 "$APP/deploy/kiosk/chromium-policy.json" /etc/chromium/policies/managed/wishpix.json
chmod +x "$APP/deploy/kiosk/chromium-kiosk.sh"
KIOSK_HOME=$(getent passwd "$KIOSK_USER" | cut -d: -f6)
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" "$KIOSK_HOME/.config/labwc"
install -m 644 -o "$KIOSK_USER" -g "$KIOSK_USER" "$APP/deploy/kiosk/labwc-autostart" "$KIOSK_HOME/.config/labwc/autostart"
raspi-config nonint do_boot_behaviour B4 2>/dev/null || true   # desktop, auto-login

# ---------- Audio ----------
[[ -f /etc/asound.conf ]] || install -m 644 "$APP/deploy/alsa/asound.conf" /etc/asound.conf

cat <<EOF

==> WishPix is installed.
    1. Connect the HP OfficeJet 250 by USB and run:  sudo hp-setup -i
       Then make it the default printer:              lpoptions -d <printer-name>
       (or set CUPS_PRINTER in $HW/.env), and run:   sudo systemctl restart wishpix-hardware
    2. Check the microphone and speaker names with 'arecord -l' / 'aplay -l' and adjust /etc/asound.conf.
    3. Add API keys to $WEB/.env (optional, free fallbacks are used without them),
       then:  sudo systemctl restart wishpix-web
    4. Wire the Yes, No and Talk buttons (docs/deployment.md, "Kiosk buttons").
    5. Reboot. The screen opens the kiosk; teachers open http://$(hostname -I | awk '{print $1}'):3000/teacher
EOF
