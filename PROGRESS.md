# WishPix build progress

Last updated: 2026-11-15

## Where things stand

WishPix was rebuilt from the simulator prototype into the production app, on the original
tech stack from `WishPix_Software_Components.xlsx`:

| Part | Stack |
|---|---|
| `apps/web` | Next.js 16 + TypeScript (custom server with Socket.IO), Tailwind CSS + shadcn/ui, Zustand, i18next, SQLite + Prisma 7, bcrypt + JWT |
| `services/hardware` | Python FastAPI + Uvicorn, Pillow + OpenCV, pypdfium2, CUPS (inkjet) or ESC/POS (optional 58 mm thermal) |
| AI | ElevenLabs Scribe v2, OpenAI (gpt-5.6-luna + omni-moderation), Gemini 3.1 Flash Image; each has a free fallback |
| Deploy | Raspberry Pi 4, systemd, Chromium kiosk mode, ALSA, optional nginx, Docker for dev, GitHub Actions CI |

Decisions made with the user (2026-11-01):
- Stack: the Next.js + Prisma document (not the FastAPI + Vite one).
- The child speaks into the **kiosk microphone** (no phone, no QR code, no Expo app).
  New kiosk step: "Did you say…?" with *Yes, make it!* / *Try again*.
- Paid AI APIs with free fallbacks (browser speech recognition / word filter only / Pollinations).
- Printer: **inkjet through CUPS** (HP OfficeJet 250, 4×6 in sticker paper), not thermal ESC/POS.

Decisions from the user's revision list (2026-11-14, session log "Modes, Print to Kiosk"):
- **Modes**, not activities: Trace & Learn (Trace Word | Trace Image) and Color & Create.
  **Free Play is removed.** Free Expression is the default, recommended theme.
- Printer: the **4×6 inkjet stays the recommended one**; a **58 mm thermal printer is an
  optional setting** ("thermal printer is optional, inkjet is the recommended").
- Display Language and Kiosk color are Teacher App settings only (no kiosk controls).
- Teachers can send files to the kiosk printer (Print to Kiosk).

Everything from simulator steps 1–6 was carried over (sessions, safety filter + moderation,
live session, print and kiosk management, logs, analytics, reports, settings, English/Filipino).

**Current state (2026-11-16):** everything in the session log is built, passes every check
(see "Checks") and is committed on the branch `november-revisions` (the new kiosk design,
Pixi, `npm run e2e`, sound/language/timing, and the November revisions). `main` still ends
at `59d2702` (going-live guide).

Both branches are on GitHub: <https://github.com/jessiejames111105/capstone> (`origin`).

**Next:** merge `november-revisions` into `main` through a pull request once GitHub CI
passes, then the user tries the revisions and prints the three pages on real paper (and
on a thermal printer if one is bought). Use the prompt at the end of the session log to
continue in a new session.

## Checks (all passing)

- `npm test` at the root: Vitest (38: safety filter, modes and prompts, words, kiosk
  screens), translation check, pytest (31: page layouts in both formats, thermal steps,
  ESC/POS bytes, teacher files, print queue).
- `npm run lint`, `npm run typecheck`, `npm run build` in `apps/web`; `ruff` in `services/hardware`.
- `npm run e2e` at the root, with `npm run dev` running: plays a whole kiosk session in
  headless Chrome (71 checks, including the screen timing, the chimes, "Test sound", the
  Display Language and Kiosk color, a Color & Create and a Trace Word page, and Print to
  Kiosk). Not part of CI (it needs a running server and the internet).
- By hand: `docs/manual-test-checklist.md` (the printed pages on real paper, both flows).

## Not done / next ideas

1. Try it on the real Raspberry Pi with the three kiosk buttons (Yes, No, hold-to-talk; the
   screen is not a touchscreen), USB microphone and HP printer
   (`sudo ./deploy/setup-pi.sh`, see `docs/deployment.md`). Not tested on hardware yet.
2. Add the API keys and try the paid services (ElevenLabs, OpenAI, Gemini). The free
   picture service (Pollinations) worked from the dev laptop on 2026-11-14; its pictures
   carry a small logo that gets printed (see `docs/going-live.md`).
3. Research Evaluation Report: still "Coming soon" (contents not decided).
4. The three.js intro / listening animations from the prototype were demo pages only; they
   are in git history (commit 16835b8, `client/src/intro/`) if wanted on the kiosk later.
5. The old simulator's data is in `legacy/` (git-ignored) and can be imported with
   `npm run db:import-legacy -- ../../legacy/simulator-data/wishpix.db` in `apps/web`.
6. Pixi (3D mascot) and its thought bubble: look at every mood on a real screen, then check
   the frame rate on the Raspberry Pi 4 (see "Pixi" in `docs/architecture.md`).
7. New kiosk design (2026-11-14): works end to end with a running session (`npm run e2e`).
   Still to do: wire the three buttons on the Pi (`docs/deployment.md`, "Kiosk buttons"),
   try a real child's voice through the microphone, and add spoken instructions later.
8. The November revisions (modes, new pages, Print to Kiosk, thermal option) are built
   and tested on a laptop with the practice printer. Still to do: print the three pages
   on the real inkjet and check the dots and dashes on paper; if a 58 mm thermal printer
   is bought, test it on real thermal paper (`docs/going-live.md`, "Optional: a 58 mm
   thermal printer"; the sizes may need tuning); check page drawing time on the Pi 4 (on
   the laptop a Trace Image page takes about 0.5–1.5 s).
9. Two decisions for the user, still open:
   - When to merge `november-revisions` into `main` (open a pull request on GitHub, wait
     for CI).
   - Whether to stop tracking `.claude/launch.json`. It holds this laptop's full paths, so
     it is wrong on any other computer.

## Notes for the next session

- Dev: `npm run setup` once, then `npm run dev` (web on :3000, hardware on :8765, mock printer).
  Stopping, ports and stuck servers: `docs/running-the-server.md`.
- Kiosk keys on a computer: Enter = Yes, Escape = No, hold Space = Talk. `npm run e2e` plays
  a whole session against the running server.
- After switching Node.js versions, `npm run dev` rebuilds the database driver by itself.
- Screen language: Teacher App → Settings → Display Language (kiosk, Teacher App, the
  Color & Create word). Kiosk colors: Settings → Kiosk color. The kiosk has no controls for
  either. Session Setup's languages are only what the kiosk listens for.
- Modes: `src/server/catalog.ts` (activity_type = mode preset, activity_subtype = mode).
  Page layouts: `services/hardware/app/layout.py`; the preview the kiosk and Teacher App
  show is the same page (`/api/pages/<id>`). Print to Kiosk: `src/server/teacher-print.ts`.
- `npm run dev` applies new migrations first. If a page keeps reloading after an update,
  stop the server and delete `apps/web/.next`.
- Thermal pages without a printer: `PAGE_FORMAT=58mm` in `services/hardware/.env`.
- Sound in a laptop browser starts after the first Enter or Space on the kiosk (not Escape);
  the header says "Sound off" until then. On the Pi it plays from the start.
- How long screens stay ("Get ready…", "Let me think…", "Connected"…): `HOLD` in
  `src/components/kiosk/screen-for.ts`, `GET_READY_MS` / `THINKING_MS` in `kiosk.tsx`.
- Test account: `teacher` / `wishpix123` (seeded in development only).
- Live state is shared between `server.ts` and the route handlers through `globalThis`
  (`src/server/realtime.ts`); the kiosk runtime is `src/server/kiosk.ts`.
- New text: wrap in `t('…')`, add the Filipino to `src/i18n/fil.ts`, run `npm run i18n:check`.
- Git Bash heredocs with quotes sometimes fail in this environment; writing files with the
  editor tool is more reliable.

## Session log

### 2026-11-13: tech stack and database review

No code was changed. We went back over the stack decisions from 2026-11-01.

- Confirmed the stack: the Next.js + Prisma sheet (`WishPix_Software_Components.xlsx`), not
  `wishpix-tech-stack*.xlsx` (FastAPI + React/Vite + Expo).
- Confirmed the database: **SQLite through Prisma 7**, using the `better-sqlite3` driver
  (`@prisma/adapter-better-sqlite3`). Data is one file, `apps/web/data/wishpix.db`
  (`DATABASE_URL` in `apps/web/.env.example`). It needs no database server on the Pi.
  Moving to PostgreSQL or MySQL later (for several kiosks sharing one database) would mean
  changing the Prisma provider and driver and re-creating the migrations.
- The full log of the 2026-11-01 stack session is saved locally and can be reopened with
  `/resume` or `claude --resume aab0dec3-6a8b-4d55-b325-4af2d11026f5`.
- Still uncommitted at the time of this session: the Pixi 3D mascot
  (`apps/web/src/components/pixi/`, preview page `apps/web/src/app/kiosk/pixi/`, wired into
  `apps/web/src/components/kiosk/kiosk.tsx`). It has not been tested on the Raspberry Pi yet.

### 2026-11-13 to 2026-11-14: Pixi's thought bubble

- Pixi's lines ("Wow! Let's draw that together!" and the rest) moved from a caption under
  Pixi into a cartoon thought bubble above its head: `ThoughtBubble` in
  `apps/web/src/components/pixi/thought-bubble.tsx`, lines in `lines.ts`. It is on the
  preview page and on the kiosk (new Filipino lines in `fil.ts`). See "Pixi" in
  `docs/architecture.md`.
- Lint, typecheck, tests (22), `i18n:check` and `npm run build` pass (run on Node 24).
- Checked by eye on the production build: every mood on `/kiosk/pixi`, and every mood at
  the sizes the kiosk gives Pixi on a 1920x1080 screen. On the kiosk's smaller area the
  camera zooms out a little to make room for the bubble. Not yet seen on the live kiosk
  with a running session (start an activity in the Teacher App, then open `/kiosk`).
- Node.js: CI, Docker and the Pi use Node 22; `.nvmrc` now says so. On Node 24 the
  `better-sqlite3` driver had to be rebuilt (`npm rebuild better-sqlite3`); the README now
  lists this under "If something will not start".
- Still uncommitted: Pixi and the thought bubble (the user asked to hold the commit, as they
  may adjust some of the animation themselves first).
- Files changed: new `apps/web/src/components/pixi/thought-bubble.tsx`,
  `thought-bubble.module.css`, `cloud.ts`, `cloud.test.ts` and `lines.ts`; changed `pixi.tsx`
  (overlay children and the `usePixiAnchor` / `usePixiHeadroom` hooks), `scene.ts` (reports
  where the head is each frame, makes room for the bubble), `character.ts` (`headAnchors`),
  `apps/web/src/app/kiosk/pixi/pixi-preview.tsx`, `apps/web/src/components/kiosk/kiosk.tsx`,
  `apps/web/src/app/layout.tsx` (Fredoka font), `apps/web/src/i18n/fil.ts`, plus `.nvmrc`,
  `README.md`, `docs/architecture.md` and this file.
- New guide `docs/running-the-server.md`: starting, stopping, checking ports, force-stopping
  a server left running, production build, and the Pi services. It is linked from the README.
- Dev server: stopping `npm run dev` from a tool can leave its `node` process running and
  holding `apps/web/.next/dev/lock`, so the next `npm run dev` refuses to start. Fix: close
  that `node` process (Task Manager, or `taskkill /PID <pid> /F`), then start again. Also make
  sure nothing else (such as a production `node dist/server.js`) is using port 3000 first.
  On 2026-11-14 a dev server was started while the production server still held port 3000,
  so it never opened the page; it has to be stopped with Ctrl+C and started again.
- Still open:
  1. Look at the bubble on the live `/kiosk` during a running session.
  2. On the kiosk's listening screen the heading "I'm listening…" repeats the bubble's
     text. (Settled by the new kiosk design on 2026-11-14: that screen has no bubble.)
  3. Frame rate of Pixi and the bubble on the Raspberry Pi 4.
- The full session is saved on this laptop. Reopen it with `/resume`, or
  `claude --resume db449ed7-a9ea-4a1d-8538-571f03ebf096` from the repo folder. The earlier
  session that built Pixi (2026-11-02) is `93a729ff-2897-4e5d-b28e-3b2e7d55dfcb`.

#### Prompt to continue the Pixi work (older; for the latest, see the end of the log)

Anyone can paste this into Claude Code from the repo root, with or without the saved session:

```text
Continue the WishPix kiosk work on Pixi's thought bubble. Read PROGRESS.md (the session log
entry "Pixi's thought bubble") and the "Pixi" section of docs/architecture.md first.

Where it stands: Pixi's lines show in a cartoon thought bubble above its head
(apps/web/src/components/pixi/thought-bubble.tsx, lines in lines.ts), on the preview page
/kiosk/pixi and on the kiosk (apps/web/src/components/kiosk/kiosk.tsx). Lint, typecheck,
tests, i18n:check and the production build pass. Nothing is committed yet. Don't commit
until I ask, because I may change some of the animation myself first.

Rules: the kiosk has no touchscreen (only Yes, No and hold-to-talk buttons), so the bubble
only displays. Keep it light for the Raspberry Pi 4. Put new text through t() with Filipino in
src/i18n/fil.ts. Keep the work ready for other developers: run the CI checks on Node 22, and
update docs/architecture.md and PROGRESS.md.

Next:
1. Start the app (npm run dev at the root; check port 3000 is free first), start an activity
   in /teacher, and check the bubble on the live /kiosk in every state.
2. (Done: the duplicate "I'm listening…" was settled by the new kiosk design.)
3. Then: [what I want next]
```

### 2026-11-14: new kiosk design from Figma

- The team exported a new kiosk design from the Figma file "capstone-copy": 16 screens, each
  in English and Filipino, at 1280×800. The 32 frames are in `docs/design/kiosk/`, with a
  README that says which kiosk screen each frame is and when it shows. There is no frame 10.
- Decisions made with the user:
  - Keep the 3D Pixi. It stands where the design draws the flat purple star.
  - Keep three buttons with hold-to-talk. The design's "Press the green button to start
    talking" hints now say "Hold the talk button…" and "Let go…". Colors follow the
    design: Yes is green, No is purple.
  - Design the screens that have no frame (idea blocked, paused, sleep, "I didn't hear
    anything") in the same style.
  - Text only for now. "Hear instructions again" is hidden until spoken instructions are
    added. The English/Filipino and "Sound on" pills only show the setting (the teacher
    picks the language in Settings), and the language picker on the talk screen is gone.
- The kiosk screen was rebuilt from the frames (`apps/web/src/components/kiosk`):
  - `screens.tsx`: one component per frame.
  - `screen-for.ts`: which screen shows when (tested in `screen-for.test.ts`).
  - `use-kiosk-buttons.ts`: Enter = Yes, Escape = No, hold Space = Talk.
  - `kiosk.tsx`: the talk flow, buttons, sounds and where Pixi stands on each screen.
  - The layout scales from the 1280×800 design to any screen size. Colors and the Nunito
    font are in `globals.css` and `layout.tsx`. The old drawings (`art.tsx`) were removed.
- Server: the kiosk now knows who has the Teacher App open, for the "Connected" screen
  (`bus.teacherSockets` in `src/server/realtime.ts`, `teacher` in `publicState()` in
  `src/server/kiosk.ts`). The Teacher App's status texts no longer mention touching the screen.
- Filipino: every new text is in `fil.ts`, mostly word for word from the Filipino frames.
  Old kiosk texts that nothing uses any more were removed.
- Raspberry Pi: `docs/deployment.md` has a new "Kiosk buttons" section (wiring the three
  buttons to GPIO pins and turning them into keys). `deploy/setup-pi.sh` also installs
  `fonts-noto-color-emoji`.
- Any screen can be opened without a session in development, e.g.
  `/kiosk?screen=home&activity=trace_learn&lang=fil` (list in `docs/design/kiosk/README.md`).
- README: the intro no longer says "touchscreen", the keyboard keys for testing are listed,
  and Nunito is added to the fonts the build downloads.
- Checks on Node 22.19.0: lint, typecheck, tests (30), `i18n:check` and `npm run build` pass.
- Checked by eye in headless Chrome at 1280×800: every frame in English (03B only in
  Filipino), the Filipino start, idea and paused screens, and the four new screens, all with
  the 3D Pixi. Headless
  Chrome draws Pixi in software, so this says nothing about speed on the Pi.
- The session that did most of this (`f2b932cc-83a4-47d0-b8b5-958c7ba6163e`) stopped before
  its last checks. The next session (`a6035be2-a692-4bbb-8ff8-a8cef4235225`) ran them,
  looked at the last screens and wrote this entry.
- Still open:
  1. Go through the kiosk with a running session: start an activity in `/teacher`, then
     use `/kiosk` with Enter, Escape, Space and the microphone.
  2. Wire the three buttons on the Pi and check the frame rate there.
  3. Spoken instructions ("Hear instructions again", "Sound on").
  4. ~~The "Listening…" heading and Pixi's "I'm listening…" bubble~~: settled. In the new
     design Pixi has no thought bubble on the listening screen, so only the heading shows
     ("I'm listening…" is only on the `/kiosk/pixi` preview page).
- Still uncommitted, together with Pixi and the thought bubble.

### 2026-11-14: end-to-end check and handoff readiness

The user asked to make the project fully working and ready to hand over to other
developers.

- **Fresh setup, as a new developer would get it.** The files a commit would contain
  (tracked and new files, nothing git-ignored) were copied to an empty folder, and
  `npm run setup` was run there on Node 22.19.0. Setup worked and changed none of those
  files. In that copy, lint, typecheck, Vitest (30), `i18n:check`, pytest (16), `ruff check`,
  `ruff format --check` and `npm run build` all pass.
- **A whole session, live** (that copy, `npm run dev`, headless Chrome): waiting →
  Connected (teacher name and device) → start screen → Yes → hold Talk → "Here's what I
  heard" → No (Try again) → Yes → picture (free Pollinations) → printed in practice mode
  (`services/hardware/data/pages/`) → Worksheet ready → Yes (next child) → an unsafe idea is
  blocked → pause, resume, end → "Session ended" → Connected. No page errors on the kiosk or
  the Teacher App. Every Teacher App page also opens without errors.
- Pixi's fallback was seen working: in headless Chrome's software renderer Pixi gets too
  slow and turns into the flat star, which then stands in the right place on every screen.
  Pixi's position after each screen change was measured: it reaches its spot in about
  0.65 s (the glide is 0.7 s).
- **Added:**
  - `npm run e2e` (`scripts/kiosk-e2e.mjs`): plays that whole session (29 checks) against a
    running server. It uses Chrome, Edge or Chromium on Windows, macOS or Linux and Node
    22's built-in WebSocket. It ends the running session, so it is for development
    computers only. Not in CI.
  - `data-screen` on the kiosk's root element (which screen is showing), used by the check.
  - `npm run dev` now notices a database driver built for another Node.js version and
    rebuilds it (`scripts/dev.mjs`). Tested both ways: the rebuild under Node 24, and the
    message when another server has the driver open.
- **Fixed wording left over from the touchscreen:** the Teacher App's Live page ("When a
  child holds the talk button…", with Filipino), `deploy/setup-pi.sh` (also lists wiring
  the buttons as a step), `deploy/kiosk/chromium-kiosk.sh`, the going-live checklist (now
  tests the real buttons), and code comments. Two unused Filipino texts ("Tap and talk",
  "Tap and say what you want to see") were removed.
- **Docs:** README ("Checks": `npm run e2e`), `docs/running-the-server.md` (new "Try a whole
  session" section, the automatic driver rebuild), `docs/architecture.md` (`data-screen`,
  the e2e check), `docs/going-live.md` (kiosk buttons row; the Pollinations logo).
- **Known limitation:** Pollinations (the free picture service) puts a small
  "pollinations.ai" logo in the corner, and it ends up on the printed page. It ignores
  `nologo` for anonymous use. With a Gemini key, Pollinations is only a backup.
- **For the user to decide:**
  1. `.claude/launch.json` is tracked in git but holds this laptop's full paths
     (`C:\Users\Admin\CAPSTONE SIMULATOR\…`), so it is wrong on any other computer.
  2. When to commit. Nothing is committed yet, and the repository has no remote; other
     developers can only get this work once it is committed (and pushed somewhere).
- Final checks on this laptop (Node 22.19.0): lint, typecheck, tests, `i18n:check` and the
  production build pass.


### 2026-11-14: Filipino, sound and screen timing

The user asked why the Filipino translation was not working, to make sure the sound
works, and to slow down a few screens: at least 1 s before talking, 1–2 s on "thinking",
and 1–2 s around waiting for and connecting to the Teacher App.

- **Filipino.** Translations were complete (0 missing) and the kiosk switched at once when
  the Teacher App's Settings → Language was set to Filipino (checked on every kiosk screen
  and Teacher App page). The likely trouble: the **English / Filipino pills** at the top of
  the kiosk looked like buttons but only showed the language, and the languages in
  Session Setup only choose what the kiosk listens for. Changes:
  - Clicking a pill (with a mouse) now changes the screen language setting
    (`POST /api/device/language`, kiosk only, logged as a settings change).
  - Development fix: the server kept the `fil.ts` it started with, so Filipino texts added
    while `npm run dev` ran were rendered in English first (a hydration error in the Next.js
    overlay). `src/i18n/index.tsx` now loads the edited file.
- **Sound.** The chimes worked, but a laptop browser blocks sound until the first key press
  (Escape doesn't count), the header said "Sound on" anyway, and "Test sound" always said
  it was playing. Changes:
  - "Sound on" shows only when the browser really lets the kiosk play sound
    (`useSoundReady()` in `sounds.ts`); otherwise "Sound off".
  - "Test sound" waits for the kiosk's answer (Socket.IO acknowledgement) and tells the
    teacher: played, no kiosk screen open, volume 0, or press Yes or Talk on the kiosk first.
  - Chimes now follow the screens that are showing (so they match the delays): a chime when
    the microphone opens, on "Here's what I heard", "Creating", "Printing", "Worksheet
    ready" and a blocked idea.
  - Checked in a browser without the Pi's autoplay flag: "Sound off" and "blocked" before any
    key, "Sound on" and "played" after one Enter.
- **Timing** (`HOLD` and `onTheWay()` in `screen-for.ts`, applied by `useHeldScreen()` in
  `kiosk.tsx`; unit-tested in `screen-for.test.ts`):
  - Hold Talk: "Get ready…" for 1 s (new state of the listening screen, "Keep holding the
    talk button."), then a chime and "Listening…". A press shorter than that says "Hold the
    talk button while you talk!".
  - "Let me think…" at least 1.5 s; "Creating your picture…" at least 1.5 s, also before an
    idea the word filter blocks within a millisecond (the browser never saw "processing"
    then, hence `onTheWay()`); its "Thinking…" step also shows at least 1.5 s.
  - "Hi! I'm Pixi!" (starting) at least 2 s; "Waiting for Teacher…" and "Connected" wait
    1.5 s after the Teacher App opens or the session starts.
- **Also fixed:** letting go of the on-screen talk button with the mouse anywhere now ends
  the recording (the screen changes under the pointer).
- **`npm run e2e`** now has 43 checks: the hold times (measured from a record the page keeps,
  since asking a busy headless page "what is on screen now?" can take seconds), "Get ready…"
  before "Listening…", each chime, "Test sound", and switching the language from the Teacher
  App and from the kiosk pills. It restores the language it found. `E2E_TIMELINE=1` prints
  every screen and how long it showed.
- **Docs:** `docs/design/kiosk/README.md` (Get ready, pills, Sound on, timing),
  `docs/architecture.md` (timing, sounds, language), `docs/running-the-server.md` (sound and
  language for testers; "a page keeps reloading" = delete `apps/web/.next`, seen once on a
  test copy with a stale build cache), README, going-live checklist (Test sound, language).
- Checks on Node 22.19.0: lint, typecheck, Vitest (34), `i18n:check` (680 used, 0 missing),
  pytest (16), production build, and `npm run e2e` (43/43) on a clean copy.
- Nothing committed (the user's choice). The user's own `npm run dev` (port 3000) picked up
  the changes by itself; refresh the kiosk tab to see them.
- The full session is saved on this laptop: `/resume`, or
  `claude --resume a6035be2-a692-4bbb-8ff8-a8cef4235225` from the repo folder.

#### Prompt to continue this work (older; for the latest, see the end of the log)

```text
Continue the WishPix work. First read PROGRESS.md ("Where things stand", "Not done / next
ideas", "Notes for the next session" and the last session log entry), then
docs/architecture.md and docs/design/kiosk/README.md.

Where it stands: the new kiosk design, Pixi, npm run e2e, and the Filipino, sound and
screen timing fixes are built and pass every check. Nothing has been committed since
59d2702. Don't commit until I ask.

Rules:
- The kiosk has no touchscreen. It has only Yes (Enter), No (Escape) and hold-to-talk
  (Space).
- Put new text through t(), with the Filipino in src/i18n/fil.ts.
- Keep the work ready for other developers:
  - Run the CI checks on Node 22: lint, typecheck, npm test and the build.
  - Run npm run e2e against a dev server.
  - Update docs/architecture.md and PROGRESS.md.
- If my npm run dev is running on port 3000, don't stop it. Test on another port instead
  (node scripts/kiosk-e2e.mjs http://localhost:<port>).

Next: my revisions to the UI and functions of the kiosk and the Teacher App:
1. [revision]
2. [revision]
```

### 2026-11-14 to 2026-11-15: Modes, Free Play removed, new pages, Print to Kiosk

The user sent a revision spec for the kiosk and the Teacher App (pasted into the session).
It assumed a 58 mm thermal printer with an "existing" dithering pipeline (there was none:
the kiosk prints 4×6 on the HP inkjet). The user then said: **"thermal printer is
optional, inkjet is the recommended"**, so both page formats were built, with the inkjet
as the default. "Kiosk flow" in the spec is the Teacher App's Session Setup (it sets up
the kiosk; children can't pick safety levels, and the kiosk has no touchscreen).

What changed, and why:

- **Free Play removed** (`src/server/catalog.ts`, Session Setup, kiosk start screen,
  `globals.css`, `sheet.tsx`, prompts, hardware layout). Old Free Play sessions are kept
  read-only for history and reports (`src/lib/labels.ts` keeps the name); migration
  `20261114120000_retire_free_play` ends a Free Play session that is still running.
  Modes are plain strings in SQLite, so no enum change was needed.
- **"Activity" is now "Mode"** in the Teacher App and kiosk text (Session Setup,
  dashboard, reports, analytics, CSV columns "Mode preset" / "Mode", kiosk "Mode paused").
  "Activity Logs" kept its name: it is the log of teacher actions, not the mode. The
  database columns (`activity_type`, `activity_subtype`) and code names were kept, to
  avoid a risky rename; comments explain the mapping.
- **Session Setup** (`src/app/teacher/(app)/setup/page.tsx`): Select Mode Preset →
  (Trace & Learn only: Select Mode, Trace Word | Trace Image) → Select Theme → Select
  Safety → Start; the step bar shows 5 or 4 steps and Back follows them. Old sub-types
  (letter, number, shape, pre-writing, word; single object, scene, craft, card) are no
  longer offered; their names stay for history.
- **Free Expression** (`catalog.ts`): first theme, chosen by default, "Recommended" badge
  and glow, no theme added to the prompt (safety still applies). Custom themes still work.
- **The printed pages** (`services/hardware/app/layout.py`, `tracing.py`): Trace Word (4
  dotted "CAT / PUSA" rows, no picture, and no AI picture is made at all), Trace Image
  (dashed outline with solid eyes/small details + one dotted row), Color & Create
  (instruction, thick-outline picture, heavy word in the Display Language). Dotted
  letters follow the letters' centre lines (Zhang-Suen thinning, then evenly spaced
  dots); AI outlines become dashes the same way. Long labels break after the slash.
  The words come from OpenAI (`word_en` / `word_fil`) or the built-in list
  (`src/server/words.ts`). Prompts per mode use the spec's wording.
- **Thermal option** (`thermal.py`, `drivers.py` `EscPosPrinter`, `config.py`):
  `PRINTER_MODE=escpos` / `PAGE_FORMAT=58mm`; 384 dots, contrast + Floyd-Steinberg,
  ESC/POS raster, paper sensor; no ink. Trace Word runs along the roll.
- **Previews = prints**: `/api/pages/<id>` asks the hardware service (`/render`) for the
  page with the same code and paper; the kiosk's printing screen and Print Management
  show it (`sheet.tsx` draws a rough version only when the service is down).
- **Display Language / Kiosk color** (`settings.ts`, Settings page, `kiosk.tsx`,
  `globals.css`): the kiosk's English / Filipino pills and `POST /api/device/language`
  were removed; "Language" became "Display Language"; new `kiosk_color` setting (auto,
  purple, green, blue, orange, pink), synced over Socket.IO like the language.
- **Print to Kiosk** (`src/server/teacher-print.ts`, `/teacher/print-to-kiosk`,
  `/api/print-files`, `/api/print-jobs`, `/api/device/teacher-print`,
  `services/hardware/app/files.py`): upload (PNG/JPG/PDF, 10 MB, type from content),
  preview as printed, copies 1–10, page ranges, kiosk choice when there is more than one,
  queue with Pending → Printing → Done / Failed, Cancel and Retry, files deleted after
  Done/Cancelled. The kiosk asks for a job only on a quiet screen (start screen before
  Yes, no session, paused), shows "Printing teacher's file…" with progress, and returns
  home. Migration `20261114120100_teacher_print_jobs` (table `print_jobs`). Logged as
  "Teacher Print"; not counted with the children's pictures (there is no children's
  print quota to exempt them from).
  - The spec's "kiosk endpoint to fetch the next job and report status" is
    `POST /api/device/teacher-print`. The server on the Pi does the printing and records
    the status itself, because the kiosk screen and the server are the same device.
- **`npm run dev`** now applies new migrations before it starts (`scripts/dev.mjs`).
- **Tests and checks**: `catalog.test.ts` (modes, prompts, words), `test_layout.py` (both
  formats, old pages), new `test_files.py` (files, page ranges, thermal, ESC/POS bytes),
  `test_api.py` (render, Trace Word without a picture, files and copies, thermal);
  `npm run e2e` extended to 71 checks; `docs/manual-test-checklist.md` (new).
- **Docs**: README, `architecture.md`, `going-live.md` (thermal printer, checklist),
  `deployment.md` (thermal, pypdfium2), `running-the-server.md` (Print to Kiosk,
  migrations, reloading pages), `docs/design/kiosk/README.md`.
- **Database changes, and how to apply them**: the two migrations above. `npm run dev`
  applies them; by hand: `cd apps/web && npx prisma migrate deploy`. On the Pi the
  `wishpix-web` service applies them on start (`sudo ./deploy/update.sh` installs the new
  Python package `pypdfium2` too).
- Checked on a copy of this laptop's database (with its old Free Play, letter, number and
  shape requests): the migrations applied, every old page renders in the new layouts,
  and every Teacher App page loads at phone width without errors. Previews and Print
  Management were also checked with `PAGE_FORMAT=58mm`.
- Checks on Node 22.19.0: lint, typecheck, Vitest (38), `i18n:check` (728 used, 0
  missing), pytest (31), ruff, production build, and `npm run e2e` (71/71) on a clean copy.
- Not done: printing on the real inkjet or a real thermal printer (no hardware here);
  the drawing time on the Pi 4.

### 2026-11-16: first commit of the November work

- Session Setup (`teacher/(app)/setup/page.tsx`) was edited by hand on 2026-11-15: the mode
  preset step is now called **"Activity"** ("Choose an Activity", and "Activity" in the
  summary). The three new texts had no Filipino, so `i18n:check` failed. Added them to
  `fil.ts` (Aktibidad, as in "Choose an activity.") and fixed "Choose a activity" →
  "Choose an activity".
- Checks on Node 22.19.0: lint, typecheck, Vitest (38), `i18n:check` (729 used, 0
  missing), ruff, pytest (31). The production build was not run on this laptop (the
  user's `npm run dev` was running from the same folder); GitHub CI runs it.
- Everything since `59d2702` is committed on the new branch `november-revisions`.
- GitHub: added `origin` = `https://github.com/jessiejames111105/capstone.git` (empty
  repository) and pushed `main` and `november-revisions`. On this laptop, Git's OpenSSL
  failed with "unable to get local issuer certificate", so the repository's local config
  now has `http.sslBackend=schannel` (the Windows certificate store). Other computers
  don't need it. The pull request was not opened (the GitHub CLI was not signed in).

#### Prompt to continue this work

Anyone can paste this into Claude Code from the repo root, with or without the saved session:

```text
Continue the WishPix work. First read PROGRESS.md ("Where things stand", "Not done / next
ideas", "Notes for the next session" and the last session log entry), then
docs/architecture.md and docs/manual-test-checklist.md.

Where it stands: the November revisions (modes instead of activities, Free Play removed,
Free Expression, the Trace Word / Trace Image / Color & Create pages, Display Language and
Kiosk color in Settings, Print to Kiosk, the optional 58 mm thermal printer) are built and
pass every check. They are committed on the branch november-revisions and pushed to
GitHub (origin, https://github.com/jessiejames111105/capstone). Don't commit until I ask.

Rules:
- The kiosk has no touchscreen. It has only Yes (Enter), No (Escape) and hold-to-talk
  (Space).
- The 4x6 inkjet is the recommended printer; the 58 mm thermal printer is optional.
- Put new text through t(), with the Filipino in src/i18n/fil.ts.
- Keep the work ready for other developers:
  - Run the CI checks on Node 22: lint, typecheck, npm test and the build.
  - Run npm run e2e against a dev server.
  - Update docs/architecture.md and PROGRESS.md.
- If my npm run dev is running on port 3000, don't stop it. Test on another port instead
  (node scripts/kiosk-e2e.mjs http://localhost:<port>).

Next: [what I want next]
```
