# WishPix architecture

```
 Raspberry Pi 4 (the kiosk)                                        Internet
┌─────────────────────────────────────────────────────────────┐
│ Chromium kiosk mode ── http://localhost:3000/kiosk          │
│   microphone (Web Audio / MediaRecorder), touchscreen       │
│        │  HTTP + Socket.IO                                  │
│ ┌──────▼──────────────────────────────┐   ┌──────────────┐  │   ElevenLabs (speech)
│ │ apps/web  (Node.js, port 3000)      │──▶│ hardware      │  │   OpenAI (moderation,
│ │  server.ts: Next.js + Socket.IO     │   │ (FastAPI,     │  │     prompt, labels)
│ │  route handlers: kiosk runtime,     │   │  127.0.0.1:   │  │   Gemini (pictures)
│ │   safety, AI calls, reports         │   │  8765)        │  │   Pollinations (free
│ │  SQLite via Prisma (data/)          │   │ Pillow+OpenCV │  │     fallback)
│ └──────▲──────────────────────────────┘   │ CUPS ── USB ──┼──┼─▶ HP OfficeJet 250
│        │                                   └──────────────┘  │
└────────┼────────────────────────────────────────────────────┘
         │ Wi-Fi
   Teacher App (any browser): http://<kiosk-ip>:3000/teacher
```

## A wish, step by step

1. **ready**: the kiosk shows a big microphone button (and English / Filipino / Taglish if
   the session allows more than one).
2. **listening**: the child taps; the kiosk records until a short silence (max 10 s).
3. The recording goes to `POST /api/device/transcribe`, which sends it to ElevenLabs and
   forgets it. Without a key, the browser's speech recognition is used instead.
4. **heard**: "Did you say… *a happy cat*?" The child taps *Yes, make it!* or *Try again*.
5. **processing**: the built-in word filter (`src/server/safety.ts`, English + Filipino,
   the teacher's own words) runs first. Then, when OpenAI is set up, the moderation model
   and a short prompt-processing call run together: they double-check safety, turn the
   idea into a clean English subject and write a 1–3 word label in English and Filipino.
   Anything blocked goes to the Moderation Center, where a teacher can keep it blocked or
   override it.
6. **generating**: `src/server/catalog.ts` turns the subject into a prompt for the activity
   (coloring page, tracing sheet, storybook picture…). Gemini draws it; Pollinations is
   the fallback.
7. **printing**: the picture goes to the hardware service, which lays out a 4×6 in page at
   300 dpi (line art cleanup, dotted letters/numbers/shapes for tracing, the label, a name
   line) and prints it through CUPS.
8. **preview**: the child sees the page; after "I'm done" or 30 s the kiosk is ready again.

## The web app (`apps/web`)

- `server.ts`: the custom server. Next.js handles pages and API routes; Socket.IO pushes
  the live kiosk state to the kiosk screen and every Teacher App. Socket.IO and the route
  handlers share state through `globalThis` (`src/server/realtime.ts`).
- `src/server/kiosk.ts`: the kiosk runtime (modes, the wish pipeline, overrides, prints).
- `src/server/*`: settings, events log, reports (`insights.ts`, plain SQL through Prisma),
  printer client, AI clients in `ai/`.
- `src/app/kiosk`, `src/app/teacher`: the screens. UI is Tailwind + shadcn/ui
  (`src/components/ui`), live state is a Zustand store (`src/stores/live.ts`), text is
  i18next with the English text as the key (`src/i18n/fil.ts` holds the Filipino).
- `prisma/schema.prisma`: the database. Migrations run on every start.

### Security

- Teachers sign in with a username and password (bcrypt). The session is a JWT in an
  httpOnly cookie; changing the password signs out every other device. Repeated wrong
  passwords lock sign-in for 5 minutes.
- The kiosk API (`/api/device/*`) and the kiosk Socket.IO role only accept connections
  from the Pi itself (loopback, not through a proxy or tunnel).
- The hardware service listens on 127.0.0.1 only and checks a shared token.
- Children's pictures (`/images/*`) are served only to the kiosk and signed-in teachers.

## The hardware service (`services/hardware`)

- `app/layout.py`: the printed page (Pillow + OpenCV).
- `app/drivers.py`: `CupsPrinter` (lp / lpstat / cancel / cupsenable, ink levels over IPP
  when `ipptool` is installed) and `MockPrinter` for development and practice.
- `app/service.py`: the print queue (one page at a time), paper and ink counters, and the
  rule that a job waiting on a jammed printer is cancelled after 30 s so the kiosk can
  move on (the teacher reprints it from Print Management).
- `app/main.py`: the HTTP API the web app uses.
