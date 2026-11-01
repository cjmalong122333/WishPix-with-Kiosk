# WishPix

An AI-powered, voice-activated learning and sticker printing kiosk for early childhood
education centers. A child taps the microphone on the kiosk touchscreen and says an idea
("isang masayang pusa"). The kiosk checks that it is a happy idea, makes a coloring page,
tracing worksheet or picture, shows it, and prints it. Teachers run everything from the
Teacher App on a phone, tablet or laptop on the same Wi-Fi.

## What is in this repository

| Folder | What it is | Built with |
|---|---|---|
| `apps/web` | Kiosk screen, Teacher App and API | Next.js 16 + TypeScript, Tailwind CSS + shadcn/ui, Zustand, i18next, Socket.IO, SQLite + Prisma, bcrypt + JWT |
| `services/hardware` | Page layout and printing | Python 3.11+, FastAPI + Uvicorn, Pillow + OpenCV, CUPS (`lp`/`lpstat`) |
| `deploy/` | Raspberry Pi setup, systemd services, Chromium kiosk mode, ALSA, nginx | Bash, systemd |
| `docs/` | [Architecture](docs/architecture.md), [Deployment on the Raspberry Pi](docs/deployment.md) | |

AI services (each is optional and has a free fallback):

| Job | Service | Without a key |
|---|---|---|
| Speech-to-text | ElevenLabs Scribe v2 | The browser's own speech recognition, or typing |
| Prompt processing, moderation, bilingual labels | OpenAI (`gpt-5.6-luna`, `omni-moderation-latest`) | The built-in English/Filipino word filter only |
| Picture generation | Google Gemini 3.1 Flash Image | Pollinations.ai (free) |

## Run it on a computer (development)

Needs Node.js 20.9+ and Python 3.11+.

```bash
npm run setup
```

```bash
npm run dev
```

- Kiosk screen: http://localhost:3000/kiosk (use it on the same computer; it needs the microphone)
- Teacher App: http://localhost:3000/teacher, first account `teacher` / `wishpix123`
  (change the password in Settings)

The printer runs in practice mode: pages are saved as PNG files in
`services/hardware/data/pages/`, and Print Management can simulate jams and empty trays.

With Docker instead: `docker compose up --build`.

## Checks

```bash
npm test
```

runs the web app tests (Vitest), checks every English text has a Filipino translation,
and runs the hardware service tests (pytest). CI runs these plus lint, type checks and a
production build on every push (`.github/workflows/ci.yml`).

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
