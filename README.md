# WishPix

An AI-powered, voice-activated learning and sticker printing kiosk for early childhood
education centers. A child holds the talk button on the kiosk and says an idea
("isang masayang pusa"). The kiosk is not a touchscreen: children use three buttons, Yes
(green), No (purple) and Talk. The kiosk checks that it is a happy idea, makes the page for
the mode the teacher chose, shows it, and prints it:

| Mode | The printed page |
|---|---|
| Trace & Learn · Trace Word | The word in dotted capitals, 4 rows, "CAT / PUSA". No picture |
| Trace & Learn · Trace Image | The picture as a dashed outline to trace, and one dotted "CAT / PUSA" row |
| Color & Create | A coloring picture with thick outlines, and the word in heavy capitals |

Teachers run everything from the Teacher App on a phone, tablet or laptop on the same
Wi-Fi, and can also send their own PNG, JPG or PDF to the kiosk printer (Print to Kiosk).
Pages print on 4×6 sticker sheets (HP inkjet, recommended) or, optionally, a 58 mm
thermal roll.

## What is in this repository

| Folder | What it is | Built with |
|---|---|---|
| `apps/web` | Kiosk screen, Teacher App and API | Next.js 16 + TypeScript, Tailwind CSS + shadcn/ui, Zustand, i18next, Socket.IO, SQLite + Prisma, bcrypt + JWT |
| `services/hardware` | Page layout and printing | Python 3.11+, FastAPI + Uvicorn, Pillow + OpenCV, pypdfium2 (PDF pages), CUPS (`lp`/`lpstat`) or ESC/POS (optional thermal printer) |
| `deploy/` | Raspberry Pi setup, systemd services, Chromium kiosk mode, ALSA, nginx | Bash, systemd |
| `docs/` | [Running and stopping the server](docs/running-the-server.md), [Going live: real AI and hardware](docs/going-live.md), [Deployment on the Raspberry Pi](docs/deployment.md), [Architecture](docs/architecture.md), [Manual test checklist](docs/manual-test-checklist.md) | |

AI services (each is optional and has a free fallback):

| Job | Service | Without a key |
|---|---|---|
| Speech-to-text | ElevenLabs Scribe v2 | The browser's own speech recognition, or typing |
| Prompt processing, moderation, bilingual labels | OpenAI (`gpt-5.6-luna`, `omni-moderation-latest`) | The built-in English/Filipino word filter only |
| Picture generation | Google Gemini 3.1 Flash Image | Pollinations.ai (free) |

## Run it on a computer (development)

Needs Node.js 22 (the version CI, Docker and the Raspberry Pi use; `.nvmrc` has it) and
Python 3.11+.

```bash
npm run setup
```

```bash
npm run dev
```

- Kiosk screen: http://localhost:3000/kiosk (use it on the same computer; it needs the microphone).
  The keyboard stands in for the kiosk's three buttons: **Enter** = Yes, **Escape** = No,
  hold **Space** = Talk. The browser keeps it silent until the first Enter or Space. To
  look at any kiosk screen without a session, open for example
  http://localhost:3000/kiosk?screen=home (all options are in
  [docs/design/kiosk/README.md](docs/design/kiosk/README.md)).
- Screen language (English / Filipino) and the kiosk's colors: Teacher App → Settings →
  Display Language, Kiosk color. The kiosk has no buttons for them.
- `npm run dev` applies new database changes (migrations) before it starts.
- Teacher App: http://localhost:3000/teacher, first account `teacher` / `wishpix123`
  (change the password in Settings)

The printer runs in practice mode: pages are saved as PNG files in
`services/hardware/data/pages/`, and Print Management can simulate jams and empty trays.

When the AI accounts and the hardware arrive, follow [docs/going-live.md](docs/going-live.md):
it lists every setting to change, with no code changes needed.

With Docker instead: `docker compose up --build`.

Stop it with Ctrl+C. [docs/running-the-server.md](docs/running-the-server.md) explains how to
stop, check ports, force-stop a server left running, and run a production build.

If something will not start:

- `NODE_MODULE_VERSION` error from `better-sqlite3`: the database driver was built for a
  different Node.js version. `npm run dev` rebuilds it by itself; if you start `apps/web`
  on its own, run `npm rebuild better-sqlite3` there.
- "Another next dev server is already running": an earlier `npm run dev` is still open (it
  can keep running after its terminal closes). Stop that `node` process, then start again.
- `npm run build` downloads the fonts (Inter, Fredoka, Nunito) from Google Fonts, so building needs
  the internet once. The built app works offline.

## Checks

```bash
npm test
```

runs the web app tests (Vitest), checks every English text has a Filipino translation,
and runs the hardware service tests (pytest). CI runs these plus lint, type checks and a
production build on every push (`.github/workflows/ci.yml`).

With `npm run dev` running, this plays a whole session on the kiosk in a hidden Chrome,
Edge or Chromium window (start screen, hold to talk, Try again, picture, print, next
child, a blocked idea, pause, resume, a Trace Word session, Print to Kiosk, end), and
checks the screen timing, the chimes, "Test sound", the language and color settings, and
that a teacher's file waits for the child at the kiosk:

```bash
npm run e2e
```

It needs the internet (or a Gemini key) for the picture and the practice printer (mock
mode), and it ends the running session, so use it on a development computer, not during
a class. Details are at the top of `scripts/kiosk-e2e.mjs`. What to check by hand (on the
real printer too) is in [docs/manual-test-checklist.md](docs/manual-test-checklist.md).

## Put it on the kiosk

See [docs/deployment.md](docs/deployment.md). In short, on a Raspberry Pi 4 with Raspberry
Pi OS (64-bit, desktop):

```bash
sudo ./deploy/setup-pi.sh
```

## Teacher accounts

There is no sign-up page. The administrator manages accounts on the kiosk:

```bash
cd /opt/wishpix/apps/web && sudo -u wishpix npm run teacher -- add maria "Teacher Maria"
```

## Privacy

- No child names are stored. Children appear only as "Child #n".
- Voice recordings are never saved; they live in memory only while being turned into text.
- Children's pictures are shown only to the kiosk screen and signed-in teachers.
- Everything is stored on the kiosk itself (SQLite database and picture files).

## Coming from the simulator

The earlier prototype (Express + React/Vite, phone page with a QR code) is in the git
history (commit `16835b8`). Its data can be imported once:

```bash
cd apps/web && npm run db:import-legacy -- ../../legacy/simulator-data/wishpix.db
```
