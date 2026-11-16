# Kiosk screen design

The kiosk screen design, exported from the team's Figma file ("capstone-copy") on
2026-11-14. Each screen has an English frame and a Filipino frame (`-fil`), all
1280×800. The kiosk is built from these frames in `apps/web/src/components/kiosk`
(`screens.tsx` draws them, `screen-for.ts` picks one).

| Frame | Screen id | When the kiosk shows it |
|---|---|---|
| `01-starting-up` | `starting` | While the kiosk connects to the server |
| `02-waiting-for-teacher` | `waiting` | No mode is running and no Teacher App is open |
| `02b-connected` | `connected` | No mode is running, but a Teacher App is open (shows the teacher's name and device) |
| `03a-color-and-create`, `03b-trace-and-learn` | `home` | The mode's start screen, shown to each new child. **Yes** begins |
| `04-tell-pixi-your-idea` | `ready` | Before talking. Ideas to try come from the day's theme |
| `05-listening` | `listening` | While the talk button is held down (first "Get ready…" for 1 s, see below) |
| `06-check-your-idea` | `heard` | **Yes** = That's It (make the picture), **No** = Try Again |
| `07-creating-your-picture` | `creating` | Safety checks (Thinking…), then drawing (Drawing…, Almost ready… after 12 s) |
| `08-preview-and-printing` | `printing` | The page is ready and printing |
| `09-worksheet-ready` | `done` | After printing. Next child after 20 s, or sooner with **Yes** |
| `11a-connection-unavailable` | `offline` | The kiosk lost its connection to the server for more than 3 s |
| `11b-printer-needs-paper` | `printer` | The printer is out of paper, jammed or out of ink (the kiosk waits for a teacher), or this child's worksheet did not print |
| `11c-service-unavailable` | `error` | The picture could not be made |
| `12-session-ended` | `ended` | The teacher ended the session; back to `02` / `02B` after 5 s |

There is no frame 10. Frame `03c-free-print-and-play` is kept in this folder for the
record, but Free Play was removed in November 2026 and the kiosk no longer shows it.
These screens have no frame and use the same style:

| Screen id | When |
|---|---|
| `paused` | The teacher paused the mode (layout of `02`) |
| `blocked` | The safety check stopped the idea (layout of `11`) |
| `thinking` | The recording is being turned into text (layout of `05`), at least 1.5 s |
| "Get ready…" | The first second of `05`, before the microphone opens (no glowing button yet) |
| `typing` | No speech recognition at all, so a teacher types the idea (layout of `04`) |
| `teacher_print` | "Printing teacher's file…" with page progress (layout of `01`): a file a teacher sent (Print to Kiosk), only while no child is in the middle of a wish, at least 1.5 s; then back to `03` |
| sleep | The screen is asleep. Any button wakes it |
| "I didn't hear anything" | A note on `04` and in Pixi's thought bubble |

## Where the build differs from the frames

These were decided with the project owner on 2026-11-14:

- **Pixi** is the 3D Pixi (`apps/web/src/components/pixi`), standing where the frames
  draw the flat star. Its words are in its cloud-shaped thought bubble rather than the
  frames' rounded bubble. If WebGL is missing or too slow, a flat star like the one in
  the frames is shown instead.
- **Buttons**: the kiosk has three physical buttons, Yes (green), No (purple) and a talk
  button that is **held** while speaking. The frames say "Press the green button to start
  talking" and "Press the green button when you're done"; the build says "Hold the talk
  button…" and "Let go…" instead. The start screens (`03`) also say "Press the green
  button to begin."
- **"Hear instructions again"** on `04` is left out until spoken instructions are added.
- **No language pills**: the frames have English / Filipino pills at the top. The kiosk
  has no language or color controls (November 2026): both are Teacher App settings
  (Settings → Display Language, Kiosk color) and the kiosk follows them at once.
- **Kiosk color**: "Auto" keeps the frames' colors (purple for Color & Create, green for
  Trace & Learn). Purple, green, blue, orange or pink recolor the whole kiosk in every
  mode (`[data-color]` in `apps/web/src/app/globals.css`).
- **The page preview on `08`** is the page itself as the printer prints it (drawn by the
  hardware service): a 4×6 sheet, or a 58 mm thermal strip when that printer is used.
  `03b`'s card says "Let's trace a word".
- **"Sound on"** shows only while the browser lets the kiosk play sound (always on the Pi;
  in a laptop browser, after the first Yes or Talk press). Otherwise it says "Sound off".
- **Timing** (added on 2026-11-14 at the owner's request): holding Talk shows "Get ready…"
  for 1 s before the microphone opens; "Let me think…" and "Creating your picture…" stay at
  least 1.5 s; "Starting up" stays at least 2 s; and "Waiting for Teacher…" / "Connected"
  wait 1.5 s before the next screen. The numbers are `HOLD` in
  `apps/web/src/components/kiosk/screen-for.ts` and `GET_READY_MS` / `THINKING_MS` in
  `kiosk.tsx`.
- **Ideas on `04`** change with the theme (Animals, Fruits…); the frame shows the
  default set (cat, fire truck, dinosaur), which is also used for Free Expression.

## Looking at the screens without a session

With `npm run dev`, open `http://localhost:3000/kiosk?screen=<screen id>`, for example
`?screen=home&activity=trace_learn&lang=fil`, `?screen=listening&getready=1`,
`?screen=printing&activity=trace_learn&mode=trace_word`, `?screen=teacher_print`,
`?screen=home&color=blue` or `?screen=printer&problem=jam`. The options are listed at
the top of `apps/web/src/app/kiosk/kiosk-screen.tsx`. This only works in development,
and the page preview there is drawn roughly (there is no real page).
