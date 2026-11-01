# WishPix build progress

Last updated: 2026-11-01

## Where things stand

WishPix was rebuilt from the simulator prototype into the production app, on the original
tech stack from `WishPix_Software_Components.xlsx`:

| Part | Stack |
|---|---|
| `apps/web` | Next.js 16 + TypeScript (custom server with Socket.IO), Tailwind CSS + shadcn/ui, Zustand, i18next, SQLite + Prisma 7, bcrypt + JWT |
| `services/hardware` | Python FastAPI + Uvicorn, Pillow + OpenCV, CUPS |
| AI | ElevenLabs Scribe v2, OpenAI (gpt-5.6-luna + omni-moderation), Gemini 3.1 Flash Image; each has a free fallback |
| Deploy | Raspberry Pi 4, systemd, Chromium kiosk mode, ALSA, optional nginx, Docker for dev, GitHub Actions CI |

Decisions made with the user (2026-11-01):
- Stack: the Next.js + Prisma document (not the FastAPI + Vite one).
- The child speaks into the **kiosk microphone** (no phone, no QR code, no Expo app).
  New kiosk step: "Did you say…?" with *Yes, make it!* / *Try again*.
- Paid AI APIs with free fallbacks (browser speech recognition / word filter only / Pollinations).
- Printer: **inkjet through CUPS** (HP OfficeJet 250, 4×6 in sticker paper), not thermal ESC/POS.

Everything from simulator steps 1–6 was carried over (sessions, safety filter + moderation,
live session, print and kiosk management, logs, analytics, reports, settings, English/Filipino).

## Checks (all passing)

- `npm test` at the root: Vitest (safety filter, prompt builder), translation check, pytest (page layout, print queue).
- `npm run lint`, `npm run typecheck`, `npm run build` in `apps/web`; `ruff` in `services/hardware`.

## Not done / next ideas

1. Try it on the real Raspberry Pi with the touchscreen, USB microphone and HP printer
   (`sudo ./deploy/setup-pi.sh`, see `docs/deployment.md`). Not tested on hardware yet.
2. Add the API keys and try the paid services; in this development sandbox outbound HTTPS
   from the dev server was blocked, so real picture generation was not exercised here.
3. Research Evaluation Report: still "Coming soon" (contents not decided).
4. The three.js intro / listening animations from the prototype were demo pages only; they
   are in git history (commit 16835b8, `client/src/intro/`) if wanted on the kiosk later.
5. The old simulator's data is in `legacy/` (git-ignored) and can be imported with
   `npm run db:import-legacy -- ../../legacy/simulator-data/wishpix.db` in `apps/web`.

## Notes for the next session

- Dev: `npm run setup` once, then `npm run dev` (web on :3000, hardware on :8765, mock printer).
- Test account: `teacher` / `wishpix123` (seeded in development only).
- Live state is shared between `server.ts` and the route handlers through `globalThis`
  (`src/server/realtime.ts`); the kiosk runtime is `src/server/kiosk.ts`.
- New text: wrap in `t('…')`, add the Filipino to `src/i18n/fil.ts`, run `npm run i18n:check`.
- Git Bash heredocs with quotes sometimes fail in this environment; writing files with the
  editor tool is more reliable.
