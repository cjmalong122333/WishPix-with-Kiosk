// End-to-end check of the kiosk with a real session, in headless Chrome
// (or Edge / Chromium). It plays one child's turn with the three kiosk
// buttons as keys (Enter = Yes, Escape = No, Space held = Talk), and the
// teacher's pause / resume / end. Speech recognition is replaced by a
// stand-in that "hears" a fixed idea, so no microphone is needed. It also
// checks: the Display Language and Kiosk color settings (the kiosk has no
// controls of its own), the chimes (and "Test sound"), that screens stay as
// long as HOLD in src/components/kiosk/screen-for.ts says, the two mode
// presets with Free Expression, a Color & Create page and a Trace Word page
// (letters only, no picture), and Print to Kiosk: a teacher's PDF waits while
// a child is in the middle of a wish, prints with the right pages and copies,
// fails with the printer's problem, is retried or cancelled, and its file is
// deleted once printed. It uses the practice printer's problems, so the
// printer service must be in mock mode (the default on a computer).
//
//   npm run dev        (in one terminal)
//   npm run e2e        (in another; or: node scripts/kiosk-e2e.mjs http://localhost:3000)
//
// Needs Node.js 22+, Chrome, Edge or Chromium, and the internet (or a Gemini
// key) to make the picture. It ENDS the running session and starts its own,
// so don't run it on a kiosk during a class. Settings (optional):
//   WISHPIX_USER / WISHPIX_PASSWORD   teacher account (default teacher / wishpix123)
//   CHROME_PATH                       the browser to use
//   E2E_SCREENSHOTS                   folder for a screenshot of each step
//   E2E_TIMELINE=1                    list every screen and how long it showed
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const user = process.env.WISHPIX_USER ?? 'teacher';
const password = process.env.WISHPIX_PASSWORD ?? 'wishpix123';
const shots = process.env.E2E_SCREENSHOTS ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof WebSocket === 'undefined') {
  console.error('This check needs Node.js 22 or newer (see .nvmrc).');
  process.exit(1);
}

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const files = {
    win32: [
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  }[process.platform];
  if (files) return files.find((f) => fs.existsSync(f)) ?? null;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {}
  }
  return null;
}

const browserPath = findBrowser();
if (!browserPath) {
  console.error('No Chrome, Edge or Chromium found. Set CHROME_PATH to the browser to use.');
  process.exit(1);
}
try {
  await fetch(`${base}/api/health`);
} catch {
  console.error(`WishPix is not answering at ${base}. Start it first with npm run dev.`);
  process.exit(1);
}

const port = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wishpix-e2e-'));
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--window-size=1280,800', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank',
]);

// One DevTools connection per browser tab.
async function openTab(name) {
  const info = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      waiting.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const err = r.result?.exceptionDetails;
    if (err) throw new Error(`${name}: ${err.exception?.description ?? err.text}`);
    return r.result?.result?.value;
  };
  const KEYS = { Enter: ['Enter', 13], Escape: ['Escape', 27], Space: [' ', 32] };
  const key = (type, code) => send('Input.dispatchKeyEvent', { type, code, key: KEYS[code][0], windowsVirtualKeyCode: KEYS[code][1] });
  return {
    name,
    send,
    evaluate,
    errors,
    go: (url) => send('Page.navigate', { url: url.startsWith('http') || url === 'about:blank' ? url : base + url }),
    down: (code) => key('keyDown', code),
    up: (code) => key('keyUp', code),
    press: async (code) => {
      await key('keyDown', code);
      await key('keyUp', code);
    },
    close: () => ws.close(),
  };
}

let failed = 0;
function check(ok, what) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
}

let kiosk;
let teacher;
let restoreLanguage = null;
let restoreColor = null;

// A small PDF with numbered pages, for Print to Kiosk (base64).
function makePdf(pages) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>'];
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  for (let i = 0; i < pages; i++) {
    const content = `BT /F1 48 Tf 72 700 Td (Page ${i + 1}) Tj ET 6 w 72 150 m 520 150 l 520 600 l 72 600 l h S`;
    const font = '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>';
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + i * 2} 0 R /Resources ${font} >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1').toString('base64');
}

try {
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    await sleep(200);
    ready = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
  }
  if (!ready) throw new Error(`the browser did not start (${browserPath})`);

  kiosk = await openTab('kiosk');
  // Stand-in for the browser's speech recognition: "hears" window.__say when the talk key is let go.
  await kiosk.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__say = 'a happy cat';
      class StandInRecognition {
        start() {}
        stop() { const said = window.__say; setTimeout(() => { if (said) this.onresult?.({ results: [[{ transcript: said }]] }); this.onend?.(); }, 100); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = StandInRecognition;
      window.webkitSpeechRecognition = StandInRecognition;
      // Every screen change and title change, and every chime (its first note's pitch), with the time.
      // Checks read these records: asking a busy page "what is on screen now?" can take seconds.
      window.__screens = [];
      window.__titles = [];
      window.__sounds = [];
      const shown = () => document.querySelector('[data-kiosk]')?.dataset.screen;
      setInterval(() => {
        const s = shown();
        if (s && s !== window.__screens.at(-1)?.s) window.__screens.push({ s, t: performance.now() });
        const h = document.querySelector('[data-kiosk] h1')?.textContent;
        if (h && h !== window.__titles.at(-1)) window.__titles.push(h);
      }, 25);
      const AC = window.AudioContext;
      window.AudioContext = class extends AC {
        createOscillator() {
          const o = super.createOscillator();
          const start = o.start.bind(o);
          o.start = (when) => { window.__sounds.push({ f: o.frequency.value, screen: shown() }); return start(when); };
          return o;
        }
      };`,
  });
  teacher = await openTab('teacher');
  await kiosk.send('Page.bringToFront'); // background tabs get no animation frames

  const screen = () => kiosk.evaluate(`document.querySelector('[data-kiosk]')?.dataset.screen ?? null`);
  const text = () => kiosk.evaluate(`document.querySelector('[data-kiosk]')?.innerText ?? ''`);
  let shotNo = 0;
  // Each step looks for its screen in the record, after the one the previous step found
  // (the same one can count again: "creating or printing", then "printing").
  let seen = 0;
  async function step(label, want, ms = 30000) {
    const list = [].concat(want);
    const find = () =>
      kiosk.evaluate(`(() => { const l = window.__screens; for (let i = ${seen}; i < l.length; i++) if (${JSON.stringify(list)}.includes(l[i].s)) return [i, l[i].s]; return null; })()`);
    const end = Date.now() + ms;
    let found = await find();
    while (!found && Date.now() < end) {
      await sleep(250);
      found = await find();
    }
    if (found) seen = found[0];
    const now = found ? found[1] : await screen();
    if (shots) {
      await sleep(900);
      fs.mkdirSync(shots, { recursive: true });
      const s = await kiosk.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shots, `${String(++shotNo).padStart(2, '0')}-${label}.png`), Buffer.from(s.result.data, 'base64'));
    }
    check(list.includes(now), `${label}: the kiosk shows "${now}"${list.includes(now) ? '' : ` (expected ${list.join(' or ')})`}`);
    return now;
  }
  async function until(test, ms) {
    const end = Date.now() + ms;
    while (!(await test()) && Date.now() < end) await sleep(100);
    return test();
  }
  // How long screen `s` showed the last time it did (ms), or null.
  const shownFor = (s) =>
    kiosk.evaluate(`(() => { const l = window.__screens; for (let i = l.length - 2; i >= 0; i--) if (l[i].s === ${JSON.stringify(s)}) return Math.round(l[i + 1].t - l[i].t); return null; })()`);
  // Whether a chime starting with `pitch` Hz played on `screen` (see src/components/kiosk/sounds.ts).
  const chimed = (screen, pitch) => kiosk.evaluate(`window.__sounds.some((x) => x.screen === ${JSON.stringify(screen)} && x.f === ${pitch})`);
  const call = (method, url, body) =>
    teacher.evaluate(
      `fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { 'content-type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`
    );
  const post = (url, body = {}) => call('POST', url, body);
  // A file chosen on the Print to Kiosk page (bytes as base64).
  const upload = (name, base64) =>
    teacher.evaluate(
      `(async () => { const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0)); const form = new FormData(); form.append('file', new Blob([bytes]), ${JSON.stringify(name)}); const r = await fetch('/api/print-files', { method: 'POST', body: form }); return { status: r.status, body: await r.json().catch(() => null) }; })()`
    );
  const job = async (id) => ((await call('GET', '/api/print-jobs')).body?.jobs ?? []).find((j) => j.id === id) ?? null;
  // Waits for an image whose address contains `part` to load on the kiosk.
  const imageLoaded = (part) =>
    kiosk.evaluate(
      `new Promise((r) => { const end = Date.now() + 20000; const f = () => { const img = [...document.querySelectorAll('[data-kiosk] img')].find((i) => i.src.includes(${JSON.stringify(part)})); if (img?.complete && img.naturalWidth > 0) r(true); else if (Date.now() > end) r(false); else setTimeout(f, 250); }; f(); })`
    );

  // Sign in, and start from no session with the Teacher App closed, in English.
  await teacher.go('/teacher/login');
  await sleep(1500);
  const login = await post('/api/auth/login', { username: user, password });
  check(login.status === 200, `teacher signs in as "${user}"`);
  if (login.status !== 200) throw new Error('could not sign in (set WISHPIX_USER / WISHPIX_PASSWORD)');
  const settings = (await call('GET', '/api/settings')).body?.settings ?? {};
  restoreLanguage = settings.language;
  restoreColor = settings.kiosk_color;
  if (settings.language !== 'en' || settings.kiosk_color !== 'auto') await call('PATCH', '/api/settings', { language: 'en', kiosk_color: 'auto' });
  await post('/api/printer/clear');
  const sound = settings.volume > 0;
  if (!sound) console.log('NOTE  the kiosk volume is 0 in Settings, so the chimes are not checked');
  await post('/api/sessions/current/end');
  await teacher.go('about:blank');
  await sleep(1000);

  console.log('Opening the kiosk (in development the first visit compiles the page, which can take a minute)…');
  await kiosk.go('/kiosk');
  await step('waiting-for-teacher', 'waiting', 180000);
  const starting = await shownFor('starting');
  check(starting >= 1950, `"Hi! I'm Pixi!" stays ${starting} ms while the kiosk connects (at least 2000)`);

  await teacher.go('/teacher/dashboard');
  if ((await step('teacher-connected', 'connected', 90000)) === 'connected') {
    check((await text()).includes(login.body.teacher.displayName), `"Connected" shows the teacher's name (${login.body.teacher.displayName})`);
  }

  // The screen language and colors are Teacher App settings; the kiosk has
  // no controls for them and follows a change at once, without a reload.
  const controls = await kiosk.evaluate(`document.querySelectorAll('[data-kiosk] header button, [data-kiosk] header [role=radio]').length`);
  check(controls === 0, 'the kiosk has no language or color buttons');
  check((await call('PATCH', '/api/settings', { language: 'fil' })).status === 200, 'teacher sets the Display Language to Filipino');
  check(await until(async () => (await text()).includes('Nakakonekta'), 5000), 'the kiosk follows: "Connected" becomes "Nakakonekta"');
  await call('PATCH', '/api/settings', { language: 'en' });
  check(await until(async () => (await text()).includes('Connected'), 5000), 'and back to English');
  const color = () => kiosk.evaluate(`document.querySelector('[data-kiosk]')?.dataset.color ?? 'auto'`);
  check((await call('PATCH', '/api/settings', { kiosk_color: 'blue' })).status === 200, 'teacher sets the Kiosk color to blue');
  check(await until(async () => (await color()) === 'blue', 5000), 'the kiosk turns blue');
  await call('PATCH', '/api/settings', { kiosk_color: 'auto' });
  check(await until(async () => (await color()) === 'auto', 5000), 'and back to its own colors (auto)');

  // Session Setup offers Trace & Learn and Color & Create (no Free Play), and Free Expression first.
  const catalog = (await call('GET', '/api/catalog')).body ?? {};
  check(JSON.stringify(catalog.activities?.map((a) => a.id)) === '["trace_learn","color_create"]', 'two mode presets: Trace & Learn and Color & Create');
  check(catalog.themes?.[0]?.name === 'Free Expression' && catalog.themes[0].recommended === true, 'Free Expression is the first theme, recommended');

  // "Test sound" in Settings: the kiosk answers whether it really played it.
  const test = await post('/api/settings/test-sound');
  check(sound ? test.body?.played === true : test.body?.reason === 'muted', `"Test sound" on the kiosk: ${JSON.stringify(test.body)}`);

  const sessionAt = await kiosk.evaluate('performance.now()');
  const started = await post('/api/sessions', {
    activityType: 'color_create',
    activitySubtype: 'coloring_page',
    theme: 'Free Expression',
    safetyLevel: 'standard',
    languages: ['English', 'Filipino'],
    blockedWords: [],
    allowedWords: [],
  });
  check(started.status === 200, 'teacher starts a Color & Create session with Free Expression');
  if ((await step('start-screen', 'home')) === 'home') {
    const wait = Math.round((await kiosk.evaluate(`window.__screens.findLast((x) => x.s === 'home').t`)) - sessionAt);
    check(wait >= 1450, `"Connected" stays ${wait} ms after the session starts (at least 1500)`);
  }

  await kiosk.press('Enter');
  await step('yes-tell-me-your-idea', 'ready');

  // Hold Talk: "Get ready…" for a second, then the microphone opens with a chime.
  const titlesFrom = await kiosk.evaluate('window.__titles.length');
  const titles = () => kiosk.evaluate(`window.__titles.slice(${titlesFrom})`);
  await kiosk.down('Space');
  check(await until(async () => (await titles()).includes('Get ready…'), 5000), 'holding Talk shows "Get ready…" first');
  await step('hold-talk-listening', 'listening', 10000);
  const micOpen = async () => {
    const l = await titles();
    return l.indexOf('Listening…', l.indexOf('Get ready…')) > 0;
  };
  check(await until(micOpen, 8000), 'then the microphone opens: "Listening…"');
  if (sound) check(await chimed('listening', 660), 'a chime when the microphone opens');
  await sleep(500);
  await kiosk.up('Space');
  await step('let-go-heres-what-i-heard', 'heard', 15000);
  check(/happy cat/i.test(await text()), '"Here\'s what I heard" shows "a happy cat"');
  const thinking = await shownFor('thinking');
  check(thinking >= 1450, `"Let me think…" stays ${thinking} ms (at least 1500)`);
  if (sound) check(await chimed('heard', 784), 'a chime on "Here\'s what I heard"');

  await kiosk.press('Escape');
  await step('no-try-again', 'ready', 10000);
  await kiosk.down('Space');
  await sleep(2500);
  await kiosk.up('Space');
  await step('talk-again', 'heard', 15000);

  await kiosk.press('Enter');
  await step('yes-creating', ['creating', 'printing', 'done'], 15000);
  const made = await step('picture-ready-printing', ['printing', 'done'], 180000);
  if (made === 'printing') check(await imageLoaded('/api/pages/'), 'the page preview shows the page as it prints');
  await step('worksheet-ready', 'done', 90000);
  if (sound) {
    const chimes = [['creating', 523], ['printing', 196], ['done', 1047]];
    const missing = [];
    for (const [s, pitch] of chimes) if (!(await chimed(s, pitch))) missing.push(s);
    check(!missing.length, `chimes on "Creating", "Printing" and "Worksheet ready"${missing.length ? ` (none on ${missing.join(', ')})` : ''}`);
  }

  await kiosk.press('Enter');
  await step('yes-next-child', 'home', 15000);

  await kiosk.evaluate(`window.__say = 'a gun that kills'`);
  await kiosk.press('Enter');
  await step('next-child-idea', 'ready', 10000);
  await kiosk.down('Space');
  await sleep(2500);
  await kiosk.up('Space');
  const heardOrBlocked = await step('unsafe-idea-heard', ['heard', 'blocked'], 15000);
  if (heardOrBlocked === 'heard') await kiosk.press('Enter');
  if ((await step('unsafe-idea-blocked', 'blocked', 30000)) === 'blocked') {
    const creating = await shownFor('creating');
    check(creating >= 1450, `"Creating your picture…" stays ${creating} ms before "Let's try another idea!" (at least 1500)`);
    if (sound) check(await chimed('blocked', 440), 'a chime on "Let\'s try another idea!"');
  }
  await kiosk.evaluate(`window.__say = 'a happy cat'`);

  check((await post('/api/sessions/current/pause')).status === 200, 'teacher pauses');
  await step('paused', 'paused', 10000);
  check((await post('/api/sessions/current/resume')).status === 200, 'teacher resumes');
  await step('resumed', 'home', 10000);

  // Trace & Learn, Trace Word: letters only ("CAT / PUSA" in 4 rows), so no picture is made.
  const trace = await post('/api/sessions', {
    activityType: 'trace_learn',
    activitySubtype: 'trace_word',
    theme: 'Free Expression',
    safetyLevel: 'standard',
    languages: ['English', 'Filipino'],
    blockedWords: [],
    allowedWords: [],
  });
  check(trace.status === 200, 'teacher starts a Trace & Learn session (Trace Word)');
  // The old session ends first: "Session ended" shows for 5 s, then the new start screen.
  await sleep(1000);
  await until(async () => (await screen()) === 'home', 20000);
  await kiosk.press('Enter');
  await step('trace-word-idea', 'ready', 10000);
  await kiosk.down('Space');
  await sleep(2500);
  await kiosk.up('Space');
  await step('trace-word-heard', 'heard', 15000);
  await kiosk.press('Enter');
  if ((await step('trace-word-printing', ['printing', 'done'], 30000)) === 'printing') {
    check(await imageLoaded('/api/pages/'), 'the Trace Word page shows in the preview');
  }
  const latest = (await call('GET', '/api/print/history?view=all')).body?.items?.[0];
  check(
    latest?.image_url === null && latest?.sheet?.kind === 'trace_word' && latest.sheet.en === 'cat' && latest.sheet.fil === 'pusa',
    `Trace Word: no AI picture, the words are "cat" / "pusa" (${JSON.stringify(latest?.sheet)})`
  );
  await step('trace-word-done', 'done', 60000);
  await kiosk.press('Enter');
  await step('trace-word-next-child', 'home', 15000);

  // Print to Kiosk: a teacher's file.
  const refused = await upload('notes.txt', Buffer.from('hello').toString('base64'));
  check(refused.status === 422, `a text file is refused: "${refused.body?.error}"`);
  const pdf = makePdf(2);
  const file = await upload('worksheet.pdf', pdf);
  check(file.status === 200 && file.body?.pages === 2, `teacher uploads a 2-page PDF (${JSON.stringify(file.body)})`);
  const preview = await teacher.evaluate(
    `fetch('/api/print-files/${file.body?.upload}/preview?page=2').then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }))`
  );
  check(preview.status === 200 && preview.type === 'image/png' && preview.size > 1000, 'the preview shows page 2 as it will print');
  const extra = await upload('extra.pdf', pdf);

  // A child is in the middle of a wish: the files wait.
  await kiosk.press('Enter');
  await step('child-pressed-yes', 'ready', 10000);
  const sent = await post('/api/print-jobs', { upload: file.body?.upload, copies: 2, pageRange: '2' });
  check(sent.status === 200 && sent.body?.job?.status === 'pending' && sent.body.job.sheetsTotal === 2, 'teacher sends page 2, 2 copies, to the kiosk');
  const other = await post('/api/print-jobs', { upload: extra.body?.upload, copies: 1, pageRange: 'all' });
  check((await post(`/api/print-jobs/${other.body?.job?.id}/cancel`)).status === 200, 'teacher cancels a second file before it prints');
  const cancelled = await job(other.body?.job?.id);
  check(cancelled?.status === 'cancelled' && !cancelled.fileKept, 'the cancelled file is deleted');
  await sleep(4000);
  check((await screen()) === 'ready' && (await job(sent.body?.job?.id))?.status === 'pending', 'the kiosk waits: the child on "Tell me your idea" is not interrupted');
  await kiosk.press('Escape');
  await step('teacher-file-printing', 'teacher_print', 20000);
  await step('back-home-after-teacher-file', 'home', 90000);
  const printed = await job(sent.body?.job?.id);
  check(printed?.status === 'done' && printed.sheetsDone === 2 && !printed.fileKept, `the file printed 2 sheets and was deleted (${printed?.status}, ${printed?.sheetsDone} sheets)`);

  // The printer is off: the job fails with the reason; after the fix, Retry prints it.
  await post('/api/printer/simulate', { problem: 'offline' });
  await sleep(3500);
  const third = await upload('again.pdf', pdf);
  const failing = await post('/api/print-jobs', { upload: third.body?.upload, copies: 1, pageRange: '1' });
  const failedJob = await until(async () => (await job(failing.body?.job?.id))?.status === 'failed', 20000).then(() => job(failing.body?.job?.id));
  check(failedJob?.status === 'failed' && /turned off/.test(failedJob.errorMessage ?? '') && failedJob.fileKept, `with the printer off it fails: "${failedJob?.errorMessage}"`);
  await post('/api/printer/clear');
  await sleep(3500);
  check((await post(`/api/print-jobs/${failing.body?.job?.id}/retry`)).status === 200, 'teacher presses Retry after turning the printer on');
  check(await until(async () => (await job(failing.body?.job?.id))?.status === 'done', 60000), 'the retried file prints');

  check((await post('/api/sessions/current/end')).status === 200, 'teacher ends the session');
  await step('session-ended', 'ended', 10000);
  await step('back-to-connected', 'connected', 12000);

  if (process.env.E2E_TIMELINE) {
    const timeline = await kiosk.evaluate(`window.__screens.map((x, i, l) => x.s + ' ' + Math.round((l[i + 1]?.t ?? performance.now()) - x.t) + ' ms').join('\\n')`);
    console.log(`Screens, and how long each showed:\n${timeline}`);
  }

  // Shader messages from software rendering are not WishPix errors.
  for (const tab of [kiosk, teacher]) {
    const own = tab.errors.filter((e) => !/THREE\.|WebGL|Shader|Program Info Log|VALIDATE_STATUS/.test(e));
    check(own.length === 0, `${tab.name} page: no errors${own.length ? '\n      ' + own.join('\n      ') : ''}`);
  }
} catch (err) {
  check(false, `stopped early: ${err.message}`);
} finally {
  // Put the screen language and kiosk color back the way they were, and the practice printer on.
  if (teacher) {
    const back = { ...(restoreLanguage ? { language: restoreLanguage } : {}), ...(restoreColor ? { kiosk_color: restoreColor } : {}) };
    await teacher
      .evaluate(`fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(back))} })`)
      .catch(() => {});
    await teacher.evaluate(`fetch('/api/printer/clear', { method: 'POST' })`).catch(() => {});
  }
  kiosk?.close();
  teacher?.close();
  browser.kill();
  await sleep(1000);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
if (shots) console.log(`Screenshots: ${path.resolve(shots)}`);
process.exit(failed ? 1 : 0);
