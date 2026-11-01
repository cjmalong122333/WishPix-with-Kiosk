# Going live: switching from practice mode to the real AI and hardware

Right now WishPix runs in **practice mode**: free services, a simulated printer, and your
laptop standing in for the kiosk. This guide lists exactly what to change when you get
the AI accounts and the hardware. **No code needs to change**, only settings in two files:

| File | What it controls |
|---|---|
| `apps/web/.env` | AI keys and models, sign-in secret, connection to the printer service |
| `services/hardware/.env` | Printer mode, printer name, paper size, tray size |

After editing a `.env` file, restart WishPix (`Ctrl+C`, then `npm run dev` on a laptop;
`sudo systemctl restart wishpix-web` or `wishpix-hardware` on the Pi).

You can do the parts in any order. Each part works on its own; whatever is not set up yet
keeps using its free or practice version.

---

## Part 1. AI services (works on the laptop too)

Put each key in `apps/web/.env`. Leave a line empty to keep its free fallback.

### 1a. Speech-to-text: ElevenLabs Scribe v2

| | |
|---|---|
| Get a key | elevenlabs.io → sign in → your profile → **API Keys** |
| Set | `ELEVENLABS_API_KEY=...` |
| Model (change only if ElevenLabs renames it) | `ELEVENLABS_STT_MODEL=scribe_v2` |
| Before (free) | The browser's speech recognition, Chrome/Edge only, less accurate with Filipino and children's voices |
| After | The kiosk records the child, sends the audio to ElevenLabs, and gets the text back. The audio is never saved. |

### 1b. Safety check, prompt cleanup and bilingual labels: OpenAI

| | |
|---|---|
| Get a key | platform.openai.com → **API keys** (add a payment method under Billing) |
| Set | `OPENAI_API_KEY=sk-...` |
| Models | `OPENAI_MODEL=gpt-5.6-luna`, `OPENAI_MODERATION_MODEL=omni-moderation-latest` |
| Before (free) | Only the built-in English/Filipino word list blocks unsafe wishes; the child's exact words go to the picture service; no label on the printed page |
| After | The word list still runs first. Then OpenAI double-checks safety, turns Filipino/Taglish into a clean English description for the picture, and writes a short label in English and Filipino ("Happy cat" / "Masayang pusa") printed on the page |

Check the model name on platform.openai.com → **Models** before you start. The name
above came from third-party sites. If your account lists a different name, put that
in `OPENAI_MODEL`. Any model that supports structured JSON output works.

### 1c. Pictures: Google Gemini 3.1 Flash Image

| | |
|---|---|
| Get a key | aistudio.google.com → **Get API key** (image models may need billing turned on in Google Cloud) |
| Set | `GEMINI_API_KEY=...` |
| Model | `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image` (use `gemini-3.1-flash-image-preview` if your account only has the preview) |
| Fallback | `IMAGE_FALLBACK=pollinations` keeps the free service as a backup if Gemini fails. Set `none` to only use Gemini. |
| Before (free) | Pollinations.ai: about one picture every 45 seconds, sometimes busy |
| After | Faster, more reliable, better line art. Pollinations is used only if Gemini has a problem |

### Check the AI setup

1. Restart WishPix.
2. Teacher App → **Kiosk Management → Services** should show ElevenLabs, "Word filter + OpenAI" and Gemini with the model names.
3. Start a session and make a few wishes at the kiosk, including one in Filipino and one that should be blocked (e.g. "a gun").
4. If something fails, the kiosk shows "Oops" and goes back to ready; the reason is in the terminal running `npm run dev` (lines starting with `[kiosk]`, `[stt]` or `[image]`).

### Costs and keys

- Every wish uses each service once (speech once, OpenAI twice: moderation is free, the
  prompt call is not, and one picture). Check each provider's pricing page and set a
  monthly spending limit in each account.
- Keep `.env` private: never commit it, share it in chat or put it in screenshots. If a
  key leaks, delete it in the provider's dashboard and make a new one.

---

## Part 2. The printer

The real printer works through **CUPS**, the Linux printing system, so it runs on the
Raspberry Pi (or any Linux computer), **not on Windows**. Until the Pi is ready, keep
`PRINTER_MODE=mock` and the pages are saved as pictures in `services/hardware/data/pages/`.

On the Pi, in `services/hardware/.env` (`setup-pi.sh` already sets the mode and token):

| Setting | Practice | Real printer |
|---|---|---|
| `PRINTER_MODE` | `mock` | `cups` |
| `CUPS_PRINTER` | — | Printer name from `lpstat -p` (empty = the CUPS default printer) |
| `CUPS_MEDIA` | — | Paper size. `4x6` for 4R sticker paper. Check the names with `lpoptions -p <printer> -l` |
| `CUPS_EXTRA_OPTIONS` | — | `fit-to-page print-quality=4` (4 = best quality; use 3 for faster, cheaper prints) |
| `PAPER_CAPACITY` | `20` | How many sticker sheets the tray holds. Teachers press **Refill paper** after loading |

Steps:

1. Plug the HP OfficeJet 250 into the Pi by USB and run `sudo hp-setup -i`.
2. `lpstat -p` to see its name, then `lpoptions -d <name>` to make it the default.
3. Edit the settings above, then `sudo systemctl restart wishpix-hardware`.
4. Teacher App → **Print Management → Test page**. The practice "Hardware simulator" box disappears in real mode.

What changes for teachers:
- Paper count is counted by WishPix (printers don't report it), so press **Refill paper** after loading.
- Ink level is read from the printer when it reports it; otherwise WishPix estimates it.
- After fixing the printer, press **Clear paper jam** (for a jam) or **Printer is fixed**
  (when it was off or reported an error) so CUPS starts printing again.

A different printer? Any printer with a Linux (CUPS) driver works with the same settings.
A thermal ESC/POS sticker printer would need a new driver class in
`services/hardware/app/drivers.py` next to `CupsPrinter`.

---

## Part 3. Kiosk screen, microphone and speaker (Raspberry Pi)

Follow [deployment.md](deployment.md). `sudo ./deploy/setup-pi.sh` sets everything up;
then:

| Part | What to check or change |
|---|---|
| Touchscreen | Opens the kiosk full screen at boot (Chromium kiosk mode). Nothing to change |
| USB microphone | `arecord -l` to find its name; edit `/etc/asound.conf` (`pcm.mic`). Test with `arecord -d 3 test.wav && aplay test.wav` |
| Speaker | `aplay -l`; edit `pcm.speaker` in `/etc/asound.conf`. Volume is in Teacher App → Settings → Kiosk sounds |
| Brightness | Teacher App → Kiosk Management → Brightness |
| Kiosk name | Teacher App → Kiosk Management (pencil icon), or `KIOSK_NAME` before the first setup |

---

## Part 4. Settings that must change for real use

| Setting | Where | Practice | Real kiosk |
|---|---|---|---|
| First teacher password | Teacher App → Settings → Change password | `wishpix123` | A strong password. `setup-pi.sh` asks for it on the Pi |
| More teachers | `npm run teacher -- add <username> "<Name>"` | — | One account per teacher |
| `JWT_SECRET` | `apps/web/.env` | Any value | Long random value (`setup-pi.sh` makes one). Changing it signs everyone out |
| `HARDWARE_TOKEN` | both `.env` files | Empty is fine | Same random value in both files (`setup-pi.sh` does this) |
| `KIOSK_ALLOW_REMOTE` | `apps/web/.env` | `false` | Always `false`. `true` would let any device on the Wi-Fi act as the kiosk |
| Time zone | The Pi | — | `Asia/Manila` (`setup-pi.sh` sets it); reports use it for "today" |

---

## Part 5. Final checklist before children use it

- [ ] Kiosk Management → Health check: everything green
- [ ] Kiosk Management → Services: the AI services you set up are listed
- [ ] Print Management → Test page comes out on sticker paper, the right size
- [ ] A full wish: tap the microphone, speak, "Did you say…", picture, printed page
- [ ] A Filipino wish and a Taglish wish
- [ ] A wish that must be blocked appears in Moderation; Override makes the picture
- [ ] Turn the printer off mid-session: the teacher sees the problem, the child still sees the picture, Reprint works after
- [ ] Reboot the Pi: the kiosk opens by itself and the Teacher App reconnects
- [ ] The default password is changed; each teacher has their own account
- [ ] A backup works: `sudo ./deploy/backup.sh /media/pi/USB`

## Going back to practice mode

Empty the key lines in `apps/web/.env` and set `PRINTER_MODE=mock` in
`services/hardware/.env`, then restart. Everything else keeps working.
