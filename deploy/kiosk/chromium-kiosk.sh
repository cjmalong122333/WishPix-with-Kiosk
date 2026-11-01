#!/usr/bin/env bash
# Opens the WishPix kiosk screen full screen on the Raspberry Pi touchscreen.
# Started by the desktop session (see labwc-autostart); waits for the web app.
set -u

URL="${WISHPIX_KIOSK_URL:-http://localhost:3000/kiosk}"

# Wait until the web app answers (it starts with the Pi).
for _ in $(seq 1 90); do
  curl -fsS -o /dev/null "http://localhost:3000/api/health" && break
  sleep 2
done

# Hide the mouse pointer on the touchscreen.
command -v unclutter >/dev/null && unclutter -idle 0.5 -root &

BROWSER=$(command -v chromium || command -v chromium-browser)
exec "$BROWSER" \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate,TouchpadOverscrollHistoryNavigation \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --password-store=basic
