# WishPix build progress

Last updated: 2026-10-27

| Step | What | Status |
|---|---|---|
| 1 | Server, database, live connection | Done |
| 2 | Kiosk display and child speech page | Done |
| 3 | Teacher login, system check, dashboard, Session Setup | Done |
| 4 | Safety filter + Moderation Center | Done |
| 5 | Live Session, Print Management, Kiosk Management (hardware simulated) | Done |
| 6 | Activity Logs, Analytics, Reports, Settings (English/Filipino) | Done |

All six planned steps are built.

## Where we stopped (2026-10-27)

- Steps 1–6 are finished, tested and saved in git (commit "WishPix checkpoint: build steps 4-6").
- Last thing discussed: the Pixi animations from the earlier session. They work but only at
  http://localhost:5173/intro and http://localhost:5173/listen (run `npm run dev` first). They are
  not used by the kiosk or the child phone yet.
- Ideas for next time (nothing is half-done):
  1. Put the Pixi animations into the kiosk (e.g. intro on the waiting screen, the listening
     animation while a child talks) and/or the child phone.
  2. Decide what the Research Evaluation Report should contain, then build it (Reports page
     shows it as "Coming soon").
  3. Match any new Figma screenshots (steps 4–6 had none).
  4. Try the real flow by hand: kiosk sounds after touching the kiosk screen, auto sign-out,
     and Print / Save as PDF on a report.

## Notes for the next session

- Safety filter: `server/src/safety.js`, English + Filipino word lists by category. Standard blocks
  violence, weapons, adult, drugs/alcohol, bad language, hate, self-harm and personal info
  (phone, email, address). Strict adds scary things and rough play. Custom = Standard + the
  teacher's blocked words; allowed words are never blocked by the built-in lists. Tests:
  `npm test` in `server/`. The blocked word is saved in `requests.block_match`.
- Moderation Center (`/teacher/moderation`): Needs review / Reviewed tabs, Keep Blocked or
  Override, and a "Test the safety filter" box. An override in the current session waits until
  the kiosk is back on the QR screen, then makes the picture ("Your teacher said yes!"). An
  override after the session ended only saves the decision. Queued overrides are dropped if
  the session ends or the server restarts.
- Simulated printer: `server/src/printer.js` (50-sheet tray, ink %, faults: jam / off, saved in the
  settings table). The server decides when printing ends (4.5 s per page). If the printer has a
  problem, the child still sees the picture and the print is marked failed for the teacher.
- Print Management (`/teacher/print`), Kiosk Management (`/teacher/kiosk`), Live Session
  (`/teacher/live`): see step 5. Menu badges: Moderation (pending count), Print Management (!),
  Kiosk Management (! when offline). The bell opens the first page that needs attention.
- Step 6:
  - **Language (English/Filipino)** is one setting for the Teacher App, kiosk and child phone.
    `client/src/i18n/`: the English text is the key, `fil.js` holds the Filipino; missing keys show
    in English. Use `const t = useT()` and `t('Text {n}', { n })`; server messages go through
    `t.error(message)`. After adding text, run `npm run i18n:check` in `client/`.
    Speech language on the phone (English/Filipino/Taglish) is separate from the screen language.
  - **Activity Logs** (`/teacher/logs`): children's requests (date range, status, search, CSV
    download) and teacher & system actions. Actions are logged to the `events` table via
    `server/src/events.js` `logEvent(type, data, teacherId)`; the client words them in `teacher/events.js`.
  - **Analytics** (`/teacher/analytics`): totals, requests per day, busiest hours, themes,
    activities, block reasons, languages. Charts are plain HTML (`teacher/charts.jsx`) with hover
    tooltips and a table view; colors in `teacher/chartColors.js` were checked for color-blindness.
    Average wait uses `requests.generated_at` (only pictures made after step 6 have it).
  - **Reports** (`/teacher/reports`): Daily summary, Session report, Safety report; saved as
    snapshots in the `reports` table, printable / Save as PDF, CSV download. Research Evaluation
    Report is "Coming soon". Queries live in `server/src/insights.js`.
  - **Settings** (`/teacher/settings`): language, theme color (5), kiosk sound volume + test sound,
    kiosk auto-sleep, teacher auto sign-out, display name, change password. Validation in
    `server/src/settings.js`. Kiosk sounds are synthesized (`client/src/kiosk/sounds.js`); the
    browser only allows them after the kiosk screen is touched once (the kiosk shows a hint).
- None of the step 4–6 screens had Figma screenshots; they were designed to match the others.
- Screenshots from Git Bash: set `MSYS_NO_PATHCONV=1` or "/teacher/..." arguments get rewritten.
- `DATA_DIR` in the environment points the server at another database folder (used for tests).
- Pixi animations (three.js, `client/src/intro/`): `/intro` is the 12 s logo intro; `/listen` is the
  4-state "listening to your wish" animation (idle / listening / thinking / done). Both can save
  WebM video. `pixiKit.js` holds the shared Pixi model. Not wired into the kiosk or phone yet.
- Designs come from Figma screenshots the user sent (the Figma tool hit its plan limit).
- Free images: Pollinations.ai, 1 image per 45 seconds per IP; the server waits and retries.
- Phone mic needs the Cloudflare quick tunnel; its URL changes every run and goes in
  `server/.env` as `PUBLIC_URL`.
- This folder has its own git repo (branch `main`), local only: there is no GitHub remote.
  Checkpoints: steps 1–3 in the first commit, steps 4–6 (and the Pixi animations) in the second.

To continue, tell Claude: **"continue WishPix"** and say which of the ideas above to do.
