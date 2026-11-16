# WishPix architecture

```
 Raspberry Pi 4 (the kiosk)                                        Internet
┌─────────────────────────────────────────────────────────────┐
│ Chromium kiosk mode ── http://localhost:3000/kiosk          │
│   microphone (Web Audio / MediaRecorder), 3 push buttons    │
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

The kiosk has no touchscreen: children use three buttons, **Yes** (green), **No** (purple)
and **Talk**, which they hold down while they speak.

0. **Session Setup** (Teacher App): the teacher picks a **mode preset**, Trace & Learn or
   Color & Create, then for Trace & Learn a **mode** (Trace Word or Trace Image), a
   **theme** (Free Expression, the default and recommended one, means no theme), the
   safety level, and starts. In the database the mode preset is a session's
   `activity_type` and the mode its `activity_subtype` (`src/server/catalog.ts`).
1. **ready**: the mode's start screen; **Yes** opens "Tell me what you want to
   create!" with ideas for the day's theme. The child speaks in the kiosk's language
   (Filipino recognition is used for Taglish).
2. **listening**: "Get ready…" for a second, then a chime, and the kiosk records while
   the talk button is held (max 15 s).
3. The recording goes to `POST /api/device/transcribe`, which sends it to ElevenLabs and
   forgets it. Without a key, the browser's speech recognition is used instead.
4. **heard**: "Here's what I heard… *a happy cat*". **Yes** makes it, **No** tries again
   (holding Talk again also works).
5. **processing**: the built-in word filter (`src/server/safety.ts`, English + Filipino,
   the teacher's own words) runs first. Then, when OpenAI is set up, the moderation model
   and a short prompt-processing call run together: they double-check safety, turn the
   idea into a clean English subject, and pick the one word printed on the page in
   English and Filipino ("cat" / "pusa"). Without OpenAI, the built-in word list in
   `src/server/words.ts` finds the word and its translation. Anything blocked goes to
   the Moderation Center, where a teacher can keep it blocked or override it.
6. **generating**: `src/server/catalog.ts` turns the subject into a prompt for the mode
   (a simple cartoon outline for Trace Image, a thick-outline coloring page for Color &
   Create; a theme is added unless it is Free Expression). Gemini draws it; Pollinations
   is the fallback. **Trace Word needs no picture**, so this step is skipped.
7. **printing**: the hardware service lays out the page (`services/hardware/app/layout.py`),
   always black on white, with every letter drawn from a font, never by the AI:
   - **Trace Word**: 4 rows of "CAT / PUSA" in dotted capitals, no picture.
   - **Trace Image**: the picture as a dashed outline (eyes and other small details stay
     solid), then one dotted "CAT / PUSA" row.
   - **Color & Create**: a short instruction, the picture with thick solid outlines and
     white insides, and the word in heavy capitals in the Display Language.
   The kiosk shows the same page while it prints (`/api/pages/<id>`, drawn by the same
   code, so the preview always matches the print).
8. **preview**: "Your worksheet is ready!"; after 20 s (or **Yes**) the next child starts
   on the mode's start screen.

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
- `prisma/schema.prisma`: the database; changes are migrations in `prisma/migrations`.
  `npm run dev` applies new ones before it starts (`scripts/dev.mjs`), and so do the
  Pi's `wishpix-web` service (on every start), Docker and `npm run setup`
  (`prisma migrate deploy`). November
  2026: `retire_free_play` (ends a Free Play session still running; old Free Play rows
  are kept, read-only, for history and reports) and `teacher_print_jobs` (the
  `print_jobs` table for Print to Kiosk).

### The kiosk screen (`src/components/kiosk`)

Built from the kiosk design in `docs/design/kiosk` (32 frames, English and Filipino; its
README lists every screen and where the build differs from the frames).

- `kiosk.tsx`: the live state, the talk flow, the buttons, sounds, and where Pixi stands
  on each screen (`PIXI`: its spot in design pixels, mood and thought-bubble words).
- `screen-for.ts`: `screenFor()` picks the screen from the server's kiosk mode plus what
  only the kiosk knows (start screen or idea screen, the talk button, a lost connection,
  the 5 s "Session ended" countdown, a printer that needs a teacher). Tested in
  `screen-for.test.ts`.
- Screens don't flick past: `HOLD` (in `screen-for.ts`) keeps "Starting up" at least 2 s,
  "Let me think…" and "Creating your picture…" at least 1.5 s, and waits 1.5 s after a
  Teacher App connects or a session starts. `onTheWay()` shows "Creating…" before an idea
  the word filter blocks at once. `useHeldScreen()` in `kiosk.tsx` applies both, so the
  kiosk can be a moment behind the server; the buttons act on the screen that is showing.
  Holding Talk shows "Get ready…" for `GET_READY_MS` (1 s) before the microphone opens.
- Sounds (`sounds.ts`): chimes made with Web Audio when the microphone opens and on
  "Here's what I heard", "Creating", "Printing", "Worksheet ready" and a blocked idea.
  A browser keeps a page silent until a key (not Escape) or click; the Pi's Chromium is
  started with `--autoplay-policy=no-user-gesture-required`, so there it always plays.
  "Sound on" in the header shows only when sound can really play. "Test sound" in
  Settings asks the open kiosk screens over Socket.IO (with an answer) and tells the
  teacher whether it played, and if not, why (no kiosk screen open, volume 0, or the
  browser is still blocking sound).
- Display Language and Kiosk color are Teacher App settings (Settings,
  `src/server/settings.ts`, saved in the `settings` table) sent with the live state over
  Socket.IO, so the kiosk changes at once, without a reload. The kiosk has no controls
  for either. The language is used by the Teacher App, every kiosk screen and the word
  under Color & Create pictures; tracing pages always print English and Filipino. Kiosk
  color sets `data-color` on the kiosk (the `--k-*` color sets in `globals.css`); "auto"
  keeps the design's colors for each mode. Session Setup's languages only choose what
  speech recognition listens for.
- Print to Kiosk ("Teacher Print"): a teacher sends a PNG, JPG or PDF from the Teacher App
  (`src/server/teacher-print.ts`, page `/teacher/print-to-kiosk`). The upload is checked
  (type from its first bytes, at most 10 MB, PDF page count from the hardware service)
  and kept in `data/uploads` for an hour while the teacher looks at the preview (drawn by
  the hardware service exactly as it will print) and picks pages and copies. "Send to
  Kiosk" makes a `PrintJob` row (pending). The kiosk screen asks for the next job
  (`POST /api/device/teacher-print`) only on a quiet screen (`QUIET_SCREENS`: the start
  screen before Yes, no session, or paused), so a child is never interrupted; the server
  checks again, shows "Printing teacher's file…" (mode `teacher_print`) with page
  progress, and returns to the start screen. Jobs end done or failed (with the printer's
  problem, e.g. "The printer is turned off"); failed jobs can be retried and pending ones
  cancelled. The file is deleted when the job is done or cancelled. Teacher prints are
  logged as "Teacher Print" (Activity Logs, Print to Kiosk, Print Management's "+ n
  Teacher Print") and never counted with the children's pictures.
- `screens.tsx`: one component per screen. The page is laid out on a 128rem × 80rem stage
  where 1rem = 10 px of the 1280×800 design (`html:has([data-kiosk])` in `globals.css`
  sets the root font size from the window), so the whole screen scales like a picture on
  any display. Colors are the `--k-*` tokens in `globals.css`; the font is Nunito.
- `use-kiosk-buttons.ts`: Yes = Enter, No = Escape, Talk = Space (held). On the Pi the
  buttons become these keys through the `gpio-key` overlay (docs/deployment.md, "Kiosk
  buttons"). On-screen buttons can also be clicked, for testing.
- `use-recorder.ts`: records until the talk button is let go; the loudness is a ref read
  every frame (the sound wave and Pixi), so the page is not re-rendered 60 times a second.
- "Connected" (frame 02B) needs to know who has the Teacher App open: `server.ts` keeps
  the open Teacher App sockets in `bus.teacherSockets` (`src/server/realtime.ts`, with
  a friendly device name from the browser), and `publicState()` adds `teacher` (name
  and device of the latest one).
- A printer that is out of paper, jammed or out of ink stops the kiosk on the
  "Printer needs paper / help" screen until it is fixed. A printer that is off or a
  hardware service that is not running does not: pictures are still shown and the
  teacher reprints them later.
- Try any screen without a session (development only):
  `/kiosk?screen=home&activity=trace_learn&lang=fil`; the options are listed in
  `src/app/kiosk/kiosk-screen.tsx`.
- The kiosk's root element carries `data-screen` (the `ScreenId` showing, or `sleep`), for
  debugging and automated checks. `scripts/kiosk-e2e.mjs` (`npm run e2e`) uses it to play a
  whole session in headless Chrome against a running server, with the buttons as keys and
  a stand-in for speech recognition. It also checks the hold times, the chimes, "Test
  sound", the Display Language and Kiosk color settings, a Color & Create and a Trace
  Word page, and Print to Kiosk (waiting for a child, pages and copies, cancel, a
  failure and Retry) (`E2E_TIMELINE=1` lists every screen and how long it showed).

### Pixi, the kiosk mascot (`src/components/pixi`)

A live three.js animation that stands beside the kiosk screens. three.js loads only on
screens that show Pixi.

- `<Pixi mood level picture wish paused onUnavailable>` (`pixi.tsx`). Moods: `idle`,
  `listening`, `thinking`, `generating`, `printing`, `success`; the kiosk picks one per
  screen (`PIXI` in `src/components/kiosk/kiosk.tsx`). `onUnavailable` fires when
  there is no WebGL or the computer stays too slow, and the kiosk then shows a flat
  drawing of Pixi (`FlatPixi` in `screens.tsx`) instead.
- `scene.ts`: the scene, camera and what each mood does. `character.ts`: Pixi's rig.
  `doodles.ts`, `materials.ts`, `strokes.ts`: the crayon look.
- `<ThoughtBubble text mood>` (`thought-bubble.tsx`): Pixi's words in a cloud above its
  head. Put it inside `<Pixi>`: the scene reports where the head is on screen every frame
  (`usePixiAnchor`), and the bubble moves with CSS transforms only (no React re-renders),
  so it stays cheap on the Pi. It also asks for room above the crest
  (`usePixiHeadroom`), and the camera zooms out just enough, so the bubble never covers
  Pixi on small screens or when Pixi jumps. No text fades it away. It follows reduced motion and is
  display only. The cloud outline is drawn by `cloud.ts`; the font is Fredoka
  (`--font-round`, loaded in `src/app/layout.tsx`).
- `lines.ts`: what Pixi says in each mood on the preview page (the kiosk screens set
  their own words in `PIXI`). Pass the page's `t` to get Filipino; a new line
  needs its Filipino in `src/i18n/fil.ts` (`npm run i18n:check` lists missing ones).
- Try it without a session: `/kiosk/pixi` (keys 1-6 switch moods, 0 hides the bubble;
  `?mood=`, `?tour=1`, `?ui=0`, `?img=`), or the real kiosk screens with
  `/kiosk?screen=ready` (any screen id; development only).
- Not yet tried on the Raspberry Pi 4: check the frame rate there before going live.

### Security

- Teachers sign in with a username and password (bcrypt). The session is a JWT in an
  httpOnly cookie; changing the password signs out every other device. Repeated wrong
  passwords lock sign-in for 5 minutes.
- The kiosk API (`/api/device/*`) and the kiosk Socket.IO role only accept connections
  from the Pi itself (loopback, not through a proxy or tunnel).
- The hardware service listens on 127.0.0.1 only and checks a shared token.
- Children's pictures (`/images/*`) are served only to the kiosk and signed-in teachers.

## The hardware service (`services/hardware`)

Two page formats, set by the printer (`PAGE_FORMAT` in `services/hardware/.env`):
**4x6** (the HP inkjet through CUPS, 300 dpi; recommended and the default) and **58mm**
(an optional thermal printer: 384 dots wide at 203 dpi, ESC/POS). A thermal page goes
through `thermal_ready()`: contrast, then Floyd-Steinberg dithering to pure black and
white. Dots, dashes and lines are drawn black at the printer's own resolution, at least
about 0.6 mm wide, so they come through dithering unchanged. Trace Word on a thermal
roll is laid out along the paper (landscape) and printed sideways, because 48 mm is too
narrow for "CAT / PUSA" at a size a child can trace.

- `app/layout.py`: the pages (Pillow + OpenCV). Pages saved before November 2026
  (letter/number/shape sheets, Free Play) print as the closest new page.
- `app/tracing.py`: dotted letters and dashed outlines. A shape is thinned to its centre
  line (Zhang-Suen), followed as paths, and dots or dashes are placed evenly along them.
- `app/thermal.py`: the thermal steps (contrast + Floyd-Steinberg) and ESC/POS raster
  (`GS v 0`) bytes.
- `app/files.py`: teachers' files (Print to Kiosk): PNG, JPG and PDF (pages drawn with
  pypdfium2), fitted to a 4x6 page or scaled to the roll and dithered.
- `app/drivers.py`: `CupsPrinter` (lp / lpstat / cancel / cupsenable, ink levels over IPP
  when `ipptool` is installed), `EscPosPrinter` (USB `/dev/usb/lp0` or `tcp://host:9100`;
  the paper sensor is read with `DLE EOT 4`) and `MockPrinter` for development and
  practice.
- `app/service.py`: the print queue (one job at a time: a child's page, or a teacher's
  file with pages × copies), paper and ink counters (a thermal printer has no ink), and
  the rule that a job waiting on a jammed printer is cancelled after 30 s so the kiosk
  can move on (the teacher reprints it from Print Management).
- `app/main.py`: the HTTP API the web app uses: `/jobs` (print), `/render` (the page as
  it would print, for previews), `/files/inspect`, `/files/preview`, `/files/jobs`.
