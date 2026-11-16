# Running and stopping the server

This page covers starting, stopping and unblocking WishPix on a development computer. For
the Raspberry Pi kiosk, see [deployment.md](deployment.md) (and the last section here).

| What | Port | Started by |
|---|---|---|
| Web app (kiosk screen, Teacher App, Socket.IO) | 3000 | `npm run dev`, or `npm start` in `apps/web` |
| Hardware service (printer; practice mode on a computer) | 8765 | `npm run dev` |

## Start (development)

The first time only, from the repo root:

```bash
npm run setup
```

After that, every time, from the repo root:

```bash
npm run dev
```

This starts both the web app and the hardware service, with their output in one terminal
(lines are tagged `[web]` and `[hardware]`). First it applies any new database changes
that came with an update (it prints `Database updated: …` when there were some). When it prints
`WishPix development server on http://localhost:3000`, open:

- Kiosk screen: http://localhost:3000/kiosk
- Pixi preview: http://localhost:3000/kiosk/pixi (keys 1–6 change the state; 0 shows or
  hides the thought bubble)
- Teacher App: http://localhost:3000/teacher (development account `teacher` / `wishpix123`)

The first visit to each page takes a few seconds while it compiles.

To run only the web app, without the printer service: `cd apps/web`, then `npm run dev`.
Printing will then say the printer service is not running.

To use another port: `cd apps/web`, then `npm run dev -- --port 3001`.

## Try a whole session

The kiosk has no touchscreen. On a computer, the keyboard stands in for its three buttons:

| Kiosk button | Key |
|---|---|
| Yes (green) | Enter |
| No (purple) | Escape |
| Talk (hold while speaking) | Space |

1. Open the Teacher App, sign in, and start a session in **Session Setup**: a mode preset
   (Trace & Learn, then Trace Word or Trace Image; or Color & Create), a theme (Free
   Expression is chosen for you), the safety level.
2. Open the kiosk screen in another window. It shows the mode's start screen.
3. Press **Enter**, then hold **Space**, say an idea ("a happy cat") and let go. Speech
   recognition needs the microphone and, without an ElevenLabs key, Chrome's own speech
   recognition (which needs the internet). With no speech recognition at all, the kiosk
   shows a box where a teacher types the idea.
4. **Enter** on "Here's what I heard" makes the picture (**Escape** tries again). In practice
   mode the printed page is saved as a PNG in `services/hardware/data/pages/`. Trace Word
   makes no picture, so it is quick.

Holding **Space** first shows "Get ready…" for a second; start talking when it says
"Listening…" (with a chime).

**Sound**: a browser plays no sound until you press a key (not Escape) or click on the
page. Until then the kiosk header says "Sound off"; after the first **Enter** or **Space**
it says "Sound on". **Test sound** in the Teacher App's Settings says whether the kiosk
really played it. (On the Pi, Chromium is started so that sound works from the start.)

**Filipino and colors**: the screen language is in the Teacher App, **Settings → Display
Language** (it changes the Teacher App, the kiosk and the word under Color & Create
pictures), and the kiosk's colors are **Settings → Kiosk color**. The kiosk has no
buttons for either; it follows a change at once. The languages in **Session Setup** only
choose what the kiosk listens for.

**Print to Kiosk**: in the Teacher App, **Print to Kiosk**, choose a PNG, JPG or PDF
(up to 10 MB), look at the preview, pick copies and pages, and **Send to Kiosk**. The
kiosk prints it when no child is in the middle of a wish (on its start screen, or with no
session), showing "Printing teacher's file…". In practice mode the pages are saved in
`services/hardware/data/pages/`. Uploaded files wait in `apps/web/data/uploads/` and are
deleted once printed or cancelled.

**Thermal pages**: to see the optional 58 mm thermal printer's pages without one, set
`PAGE_FORMAT=58mm` in `services/hardware/.env` and restart.

To look at one screen without a session, open `/kiosk?screen=<screen>` (for example
`?screen=home&activity=trace_learn&lang=fil`); the list is in
[design/kiosk/README.md](design/kiosk/README.md).

To play the whole session automatically, run `npm run e2e` in a second terminal (see the
README, "Checks").

## Stop

Press **Ctrl+C once** in the terminal that is running it, then wait until both `[web]` and
`[hardware]` say `stopped`.

Always stop it with Ctrl+C. If you close the terminal window, or stop it from an editor or
tool, the `node` process can keep running in the background. It then holds port 3000 and
the dev lock, so the next `npm run dev` will not start (see below).

## Check that the ports are free

Do this before starting if you're not sure whether an old server is still running.

Windows (Command Prompt or PowerShell):

```bat
netstat -ano | findstr :3000
netstat -ano | findstr :8765
```

macOS / Linux:

```bash
lsof -i :3000
lsof -i :8765
```

No output means the port is free. Otherwise, the `LISTENING` line shows the PID that holds
the port: the last number on Windows, or the `PID` column on macOS / Linux. Ignore the
`ESTABLISHED` lines with other PIDs; those are browser tabs connected to the server.

## Force-stop a server that is still running

Use the PID from the check above.

Windows:

```bat
tasklist /FI "PID eq <pid>"
taskkill /PID <pid> /T /F
```

`/T` also stops the processes that one started.

macOS / Linux:

```bash
ps -p <pid>
kill <pid>
```

If it is still running after `kill`, use `kill -9 <pid>`.

The first command in each pair shows what the process is. Check that it is `node.exe` /
`node` (or `python` for port 8765) before stopping it. Then run `npm run dev` again.

## Problems starting

**"Another next dev server is already running"**

An old dev server is still alive, even if port 3000 looks free. It holds the lock file
`apps/web/.next/dev/lock`. To list every WishPix dev server that is running:

Windows (PowerShell):

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object CommandLine -like '*server.ts --dev*' | Select-Object ProcessId, CommandLine
```

macOS / Linux:

```bash
ps aux | grep "server.ts --dev"
```

Each dev server shows up as two `node` processes: the `tsx` launcher and the server itself.
Stop all the PIDs listed, as shown above, then start again.

On Windows the lock file can't be opened while its server is running. If that server has
stopped and the error still appears, delete `apps/web/.next/dev/lock` and start again.

**`EADDRINUSE` / "address already in use"**, or the page never loads

Something else is using port 3000 or 8765. A common cause is a production server
(`npm start`) still running. Check the ports and force-stop the old server as described
above. A dev server that started while the port was taken does not recover by itself:
press Ctrl+C and run `npm run dev` again.

**`NODE_MODULE_VERSION` error from `better-sqlite3`**

The database driver was built for a different Node.js version (for example after switching
versions with nvm). `npm run dev` from the repo root notices this and rebuilds it for the
Node.js it runs on. If you start `apps/web` on its own (`npm run dev` or `npm start` there),
run `npm rebuild better-sqlite3` in `apps/web` yourself. If the rebuild fails with `EPERM`
or `EBUSY`, another WishPix server still has the driver open: stop it first (see above).

**A page keeps reloading** (the kiosk flashes "Hi! I'm Pixi!" again and again, or a
Teacher App page shows only a spinner, and the terminal prints `✓ Compiled` and
`GET /kiosk` or `GET /teacher/…` over and over)

The development build cache is out of date. This can happen after updating many files
while the server was stopped. Stop the server (Ctrl+C), delete the folder
`apps/web/.next`, and start again. The first visit then compiles again (a few seconds).

**"Could not update the database"** when starting

`npm run dev` applies new database changes first. If another WishPix server is running,
stop it, then start again (or run `npx prisma migrate deploy` in `apps/web`).

**`[hardware] could not start`**

The Python environment is missing. Run `npm run setup` from the repo root.

## Production build on a computer

Use this to see the app as the kiosk runs it: faster, and with no dev overlay.

```bash
npm run build
cd apps/web
npm start
```

It prints `WishPix production server on http://localhost:3000`. Stop it with Ctrl+C. This
does not start the hardware service; for printing, run `npm run dev` instead, or start the
hardware service on its own. Building needs the internet once, to download the fonts.

## On the Raspberry Pi

On the Pi, systemd runs both parts and restarts them on boot, so `npm run dev` is not used
there:

```bash
sudo systemctl restart wishpix-web        # or: stop, start, status
sudo systemctl restart wishpix-hardware
journalctl -u wishpix-web -f              # follow the log (Ctrl+C to leave)
```

More in [deployment.md](deployment.md).
