# Deploying WishPix on the kiosk

For a summary of every setting that changes from practice mode to the real kiosk (AI
keys, printer, security), see [going-live.md](going-live.md).

## Hardware

- Raspberry Pi 4 Model B (4 GB or 8 GB) with the official 5.1 V 3 A power supply
- Raspberry Pi Touch Display 2 (7-inch), connected by the DSI ribbon cable
- HP OfficeJet 250 Mobile (USB), 4R (4×6 in) matte inkjet sticker paper
- USB omnidirectional microphone (on a USB extension, at the front of the kiosk)
- Speaker on the 3.5 mm jack (e.g. Creative Pebble 2.0, powered from a separate USB charger)
- Three arcade push buttons for the children (the screen is not used as a touchscreen):
  **Yes** (green), **No** (purple) and **Talk** (held down while the child speaks)

## 1. Prepare the Raspberry Pi

1. Flash **Raspberry Pi OS (64-bit, with desktop, Bookworm)** with Raspberry Pi Imager.
   Set the user (e.g. `pi`), Wi-Fi, locale and enable SSH in the Imager settings.
2. Boot, connect to the internet and update: `sudo apt update && sudo apt full-upgrade -y`.
3. Copy this repository to the Pi (e.g. `git clone` or a USB stick).

## 2. Install WishPix

```bash
cd wishpix
sudo ./deploy/setup-pi.sh
```

The script installs Node.js 22, Python, CUPS + HPLIP and Chromium, copies the app to
`/opt/wishpix`, builds it, asks for the first teacher's username and password and the
kiosk name, and sets up:

| Part | How it runs |
|---|---|
| Web app | `wishpix-web.service` (port 3000, runs database migrations on start) |
| Hardware service | `wishpix-hardware.service` (127.0.0.1:8765, CUPS mode) |
| Kiosk screen | Chromium in kiosk mode, started by the desktop session (`~/.config/labwc/autostart`) |
| Microphone permission | Chromium policy `/etc/chromium/policies/managed/wishpix.json` |

## 3. Printer

```bash
sudo hp-setup -i            # follow the steps; choose USB
lpstat -p                   # note the printer name
lpoptions -d <printer-name> # make it the default
lpoptions -p <printer-name> -l | grep -i media   # check 4x6 is listed
sudo systemctl restart wishpix-hardware
```

Settings in `/opt/wishpix/services/hardware/.env`: `CUPS_PRINTER` (empty = default
printer), `CUPS_MEDIA` (default `4x6`), `CUPS_EXTRA_OPTIONS`, `PAPER_CAPACITY` (sheets the
tray holds; teachers press *Refill paper* after loading).

Print a test page from **Teacher App → Print Management → Test page**.

**Optional 58 mm thermal printer** instead of the inkjet: plug it in by USB (or put it
on the network), then in the same `.env` set `PRINTER_MODE=escpos` and
`ESCPOS_DEVICE=/dev/usb/lp0` (or `tcp://<printer-ip>:9100`), and restart
`wishpix-hardware`. The `wishpix` user is in the `lp` group (`setup-pi.sh`), so it can
write to `/dev/usb/lp0`. All the settings are in [going-live.md](going-live.md), "Optional:
a 58 mm thermal printer".

The hardware service draws PDF pages with `pypdfium2` (in `requirements.txt`; it has
ready-made wheels for the Pi's 64-bit OS, so nothing needs compiling).

## 4. Microphone and speaker

```bash
arecord -l    # find the USB microphone card name
aplay -l      # find the speaker
sudo nano /etc/asound.conf
arecord -d 3 test.wav && aplay test.wav
```

## 5. Kiosk buttons

The kiosk screen listens for three keys (`apps/web/src/components/kiosk/use-kiosk-buttons.ts`):

| Button | Key | Linux key code |
|---|---|---|
| Yes (green) | Enter | `KEY_ENTER` = 28 |
| No (purple) | Escape | `KEY_ESC` = 1 |
| Talk (hold) | Space | `KEY_SPACE` = 57 |

Wire each button between a GPIO pin and ground (no resistor needed; the pin's pull-up is
used), then turn the pins into keys with Raspberry Pi OS's `gpio-key` overlay. Add to
`/boot/firmware/config.txt` (the pins below are an example; use the ones you wired) and
reboot:

```
# WishPix kiosk buttons: Yes, No, Talk
dtoverlay=gpio-key,gpio=17,active_low=1,gpio_pull=up,keycode=28,label="wishpix-yes"
dtoverlay=gpio-key,gpio=27,active_low=1,gpio_pull=up,keycode=1,label="wishpix-no"
dtoverlay=gpio-key,gpio=22,active_low=1,gpio_pull=up,keycode=57,label="wishpix-talk"
```

Check them with `sudo evtest` (pick the `wishpix-…` devices and press each button). A USB
"arcade encoder" board that shows up as a keyboard works too, if it can send these keys.
Without the buttons (for example on a laptop) the same keys on a keyboard work.

To use other keys, change `BUTTON_KEYS` in `use-kiosk-buttons.ts` (and this table).

## 6. AI services (optional)

Edit `/opt/wishpix/apps/web/.env`, then `sudo systemctl restart wishpix-web`:

```
ELEVENLABS_API_KEY=...   # speech-to-text (Scribe v2)
OPENAI_API_KEY=...       # moderation, prompt processing, bilingual labels
GEMINI_API_KEY=...       # pictures (Gemini 3.1 Flash Image)
```

Model names can be changed there too (`OPENAI_MODEL`, `GEMINI_IMAGE_MODEL`,
`ELEVENLABS_STT_MODEL`). **Kiosk Management → Services** in the Teacher App shows what
is in use. Keep the `.env` files private: they hold the keys and the sign-in secret.

## 7. Teachers

Teachers open `http://<kiosk-ip>:3000/teacher` on the daycare Wi-Fi. Give the Pi a fixed
address in the router so the link never changes. Optional: install nginx with
`deploy/nginx/wishpix.conf` to use `http://<kiosk-ip>/teacher` instead.

Accounts (on the Pi):

```bash
cd /opt/wishpix/apps/web
sudo -u wishpix npm run teacher -- list
sudo -u wishpix npm run teacher -- add maria "Teacher Maria"
sudo -u wishpix npm run teacher -- password maria
```

## Updating, backups, logs

```bash
sudo ./deploy/update.sh                 # from a newer checkout; backs up the database first
sudo ./deploy/backup.sh /media/pi/USB   # database + pictures to a USB stick
journalctl -u wishpix-web -f            # web app log
journalctl -u wishpix-hardware -f       # printer log
```

## Troubleshooting

| Problem | Check |
|---|---|
| Teacher App says the kiosk is offline | Is Chromium open on the kiosk screen? `journalctl -u wishpix-web` |
| A kiosk button does nothing | `sudo evtest`: does the button send its key? Check the `dtoverlay=gpio-key` lines (section 5) |
| Emoji show as empty boxes on the kiosk | `sudo apt install fonts-noto-color-emoji`, then restart Chromium |
| "The printer service is not running" | `systemctl status wishpix-hardware` |
| Prints fail with "The printer is turned off" | `lpstat -p` shows *disabled*? Fix the printer, then *Printer is fixed* in Print Management |
| Kiosk never hears the child | `arecord -l`, `/etc/asound.conf`; Chromium policy file in place |
| Pictures fail | Internet on the Pi; Kiosk Management → Health check; keys in `.env` |
