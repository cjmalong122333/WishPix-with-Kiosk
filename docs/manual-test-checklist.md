# Manual test checklist

For the November 2026 changes: modes instead of activities, Free Play removed, Free
Expression, the new printed pages, Display Language and Kiosk color in the Teacher App,
and Print to Kiosk. Most of this is also played automatically by `npm run e2e` (README,
"Checks"); the printed pages and the thermal printer need a person and real paper.

Set up: `npm run dev`, the kiosk screen at http://localhost:3000/kiosk, the Teacher App at
http://localhost:3000/teacher (on the Pi: the kiosk screen and a phone). Kiosk keys on a
computer: Enter = Yes, Escape = No, hold Space = Talk.

## 1. Session Setup: both flows and the Back buttons

- [ ] Step 1 is **Select Mode Preset** with two cards: Trace & Learn and Color & Create.
      There is no Free Play anywhere in the Teacher App.
- [ ] Trace & Learn: the step bar shows **5 steps** (Mode Preset, Mode, Theme, Safety,
      Start) and "Step 1 of 5".
- [ ] Step 2 **Select Mode** offers Trace Word and Trace Image; Continue stays off until
      one is picked.
- [ ] Back from step 3 goes to Select Mode, Back again to Select Mode Preset.
- [ ] Color & Create: the step bar shows **4 steps** (Mode Preset, Theme, Safety, Start)
      and Continue goes straight to the theme ("Step 2 of 4"). Back from the theme goes
      to the mode preset.
- [ ] The Start step lists Mode Preset (and Mode for Trace & Learn), Theme and Safety
      Rules, each with Edit. Back from Start goes to Safety.
- [ ] Start a session of each kind; the kiosk shows the mode's start screen.

## 2. Free Expression

- [ ] On the theme step, in both modes, **Free Expression** is first, already chosen,
      with a **Recommended** badge and a blue glow.
- [ ] Choosing Animals moves the selection; the badge and glow stay on Free Expression.
- [ ] With Free Expression the kiosk says "Today's theme · Free Expression", and any idea
      works (try "a rocket"): the prompt saved with the request has no theme in it
      (`final_prompt` in the `requests` table; `npx prisma studio` in `apps/web` shows
      it). Unsafe ideas are still blocked ("a gun").
- [ ] With another theme (e.g. Animals), the prompt ends with ", theme: Animals" as before.

## 3. The three printed pages (preview and print)

For each, compare the kiosk's preview while printing with the printed page (practice
mode: `services/hardware/data/pages/`). They must be the same.

- [ ] **Trace Word** (say "cat"): text only, no picture. "CAT / PUSA" in dotted
      capitals, **4 rows** filling the page, wide letter spacing, black on white.
- [ ] **Trace Image** (say "cat"): the picture as a **dashed** outline (short dashes,
      small gaps), eyes and other small details **solid**, then **one** dotted
      "CAT / PUSA" row.
- [ ] **Color & Create** (say "dinosaur"): a short instruction at the top, one big
      picture with **thick solid** outlines and white insides, then the word in **heavy
      solid** capitals ("DINOSAUR"), in the Display Language ("DINOSAURO" in Filipino).
- [ ] A word that is not in the built-in list (without OpenAI) prints in the language it
      was said, alone ("ZORBLE").
- [ ] Long words ("butterfly") break after the slash onto two lines instead of becoming
      too small (Trace Image, 4×6).
- [ ] **On real paper**: the dots and dashes are clear dots and dashes, big enough for a
      crayon, and the outlines did not break.
- [ ] **Thermal printer (optional)**: `PAGE_FORMAT=58mm` (or a real one,
      `PRINTER_MODE=escpos`). Trace Word prints sideways along the roll; the others are
      48 mm wide. After printing on **real thermal paper**, the dotted letters and dashed
      lines are still clear (not merged into gray, not vanished). If not, adjust the sizes
      named in [going-live.md](going-live.md) ("Optional: a 58 mm thermal printer").

## 4. Free Play is gone; old data still works

- [ ] Session Setup, the kiosk and Analytics' choices show only Trace & Learn and Color
      & Create.
- [ ] Old Free Play sessions and pictures still appear in Live Session history, Print
      Management, Activity Logs, Analytics and Reports, labelled "Free Play", with no
      errors.
- [ ] Reprinting an old picture (any mode, including Free Play and the old letter /
      number / shape sheets) prints it in the closest new layout.
- [ ] A database with a Free Play session still running: after the update it is ended
      (migration `retire_free_play`) and the kiosk waits for a new session.

## 5. Display Language and Kiosk color

- [ ] The kiosk has **no** English / Filipino buttons and no color controls.
- [ ] Teacher App → Settings → **Display Language** → Filipino: the Teacher App and
      the kiosk switch at once, without a reload. Back to English.
- [ ] The Color & Create word follows the Display Language; tracing pages always print
      "ENGLISH / FILIPINO".
- [ ] Settings → **Kiosk color**: Blue, Green, Orange, Pink and Purple recolor the whole
      kiosk at once; Auto brings back each mode's own colors (purple for Color & Create,
      green for Trace & Learn).
- [ ] Both settings survive a server restart (saved in the database).

## 6. Print to Kiosk

- [ ] The sidebar has **Print to Kiosk** (with a badge while files wait).
- [ ] A `.txt` or `.gif` file is refused with a clear message; a file over 10 MB too.
- [ ] Upload a **PNG**: the preview shows it as it will print (on a 4×6 sheet, or the
      58 mm roll in black and white, dithered).
- [ ] Upload a **JPG** photo: same. On a thermal printer the photo is dithered into dots.
- [ ] Upload a **multi-page PDF**: page count shown, the preview can step through the
      pages, and "All pages" or "Only these pages" (e.g. `2`, `1-3, 5`) can be chosen.
      A page that is not in the file is refused.
- [ ] Copies 1–10 (the − / + buttons stop at 1 and 10).
- [ ] The Kiosk choice only appears when there is more than one kiosk.
- [ ] **Send to Kiosk** with no child at the kiosk (start screen, no session or paused):
      the kiosk shows **"Printing teacher's file…"** with progress, prints the chosen
      pages × copies, then goes back to the start screen. The job list goes
      **Pending → Printing (n of m) → Done**.
- [ ] Send a job while a child is **in the middle of a wish** (pressed Yes, talking,
      checking the idea, or the picture is being made or printed): the kiosk does **not**
      interrupt. The job stays **Pending** until the child is done and the kiosk is back
      on its start screen, then prints.
- [ ] **Cancel** a pending job: it shows Cancelled and never prints.
- [ ] Turn the printer off (Print Management → Hardware simulator → Turn printer off),
      send a file: it shows **Failed** with "The printer is turned off". Fix the printer
      (Printer is fixed), press **Retry**: it prints.
- [ ] Uploaded files are deleted: after Done or Cancelled, the file is gone from
      `apps/web/data/uploads/` (a failed job keeps its file for Retry; a preview that was
      never sent is removed after an hour).
- [ ] Activity Logs show "Teacher Print: …" entries. Print Management shows "+ n Teacher
      Print" next to the children's "printed today", and the children's numbers
      (printed today, Analytics) do not include teacher prints.
- [ ] Sending files needs a signed-in teacher; the kiosk screen itself has no upload.
