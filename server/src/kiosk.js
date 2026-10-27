import crypto from 'node:crypto';
import { db, parseSession, getSetting, setSetting } from './db.js';
import { buildPrompt } from './catalog.js';
import { checkSafety } from './safety.js';
import { generateImage } from './image-gen.js';
import { markReviewed, pendingCount } from './moderation.js';
import * as printer from './printer.js';
import { screenPrefs } from './settings.js';
import { logEvent } from './events.js';

// Kiosk modes, in the order a normal request moves through them:
// waiting (no session) -> ready (QR shown) -> listening -> processing
// -> generating -> printing -> preview -> ready.
// Side modes: blocked, error, paused. The screen can also be asleep in any
// quiet mode (waiting, ready, paused); a touch, a child or the teacher wakes it.
const runtime = {
  kioskSockets: new Set(),
  mode: 'waiting',
  session: null,
  joinToken: null,
  current: null, // the request on screen right now
  overrides: [], // request ids a teacher overrode, waiting for the kiosk to be free
  sleeping: false,
  lastActivity: Date.now(),
  connectedAt: null, // when the kiosk screen connected, for uptime
};

let io = null;
const KIOSK_ID = 1;
const BLOCKED_SCREEN_MS = 6000;
const ERROR_SCREEN_MS = 6000;
const QUIET_MODES = ['waiting', 'ready', 'paused'];
// Colorful Free Play pages use more ink than black line art.
const inkFor = (activityType) => (activityType === 'free_play' ? 4 : 1);

export function attach(socketServer) {
  io = socketServer;
  const row = db.prepare("SELECT * FROM sessions WHERE status IN ('active','paused') ORDER BY id DESC LIMIT 1").get();
  if (row) {
    runtime.session = parseSession(row);
    runtime.joinToken = row.join_token ?? newToken();
    runtime.mode = row.status === 'paused' ? 'paused' : 'ready';
    db.prepare('UPDATE sessions SET join_token = ? WHERE id = ?').run(runtime.joinToken, row.id);
    // A request that was mid-way when the server stopped can't finish.
    db.prepare("UPDATE requests SET status = 'failed' WHERE status IN ('processing','generating')").run();
  }
  printer.onPrinterChange(broadcast);
  setInterval(autoSleep, 30_000).unref();
}

export const kioskOnline = () => runtime.kioskSockets.size > 0;
export const isQueuedOverride = (id) => runtime.overrides.includes(id);
export const currentSession = () => runtime.session;
export const isValidJoinToken = (t) => !!t && t === runtime.joinToken;

export function publicState() {
  return {
    kioskName: db.prepare('SELECT name FROM kiosks WHERE id = ?').get(KIOSK_ID)?.name,
    kioskOnline: kioskOnline(),
    mode: runtime.mode,
    session: runtime.session,
    current: runtime.current,
    pendingModeration: pendingCount(),
    phones: io?.sockets.adapter.rooms.get('children')?.size ?? 0,
    screen: { sleeping: runtime.sleeping, brightness: Number(getSetting('kiosk_brightness', 100)) },
    printer: printer.printerState(),
    prefs: screenPrefs(),
  };
}

export function broadcast() {
  const state = publicState();
  io.to('kiosk').to('teachers').emit('state', state);
  io.to('children').emit('state', {
    language: state.prefs.language,
    mode: state.mode,
    session: state.session && { theme: state.session.theme, languages: state.session.languages },
    current: state.current && { id: state.current.id, recognizedText: state.current.recognizedText, status: state.current.status },
  });
}

function setMode(mode, current = runtime.current) {
  if (mode !== runtime.mode) {
    runtime.lastActivity = Date.now();
    runtime.sleeping = false;
  }
  runtime.mode = mode;
  runtime.current = current;
  broadcast();
}

// ---------- Kiosk connections ----------

export function kioskConnected(socket) {
  if (runtime.kioskSockets.size === 0) runtime.connectedAt = new Date().toISOString();
  runtime.kioskSockets.add(socket.id);
  db.prepare("UPDATE kiosks SET last_seen = datetime('now') WHERE id = ?").run(KIOSK_ID);
  broadcast();
}

export function kioskDisconnected(socket) {
  runtime.kioskSockets.delete(socket.id);
  db.prepare("UPDATE kiosks SET last_seen = datetime('now') WHERE id = ?").run(KIOSK_ID);
  if (runtime.kioskSockets.size === 0) runtime.connectedAt = null;
  broadcast();
}

// "Test sound" on the Settings page.
export function playSound(name) {
  io.to('kiosk').emit('kiosk:sound', name);
}

export function restartKiosk() {
  runtime.sleeping = false;
  io.to('kiosk').emit('kiosk:reload');
}

// ---------- Kiosk screen (Kiosk Management) ----------

export function kioskInfo() {
  const kiosk = db.prepare('SELECT * FROM kiosks WHERE id = ?').get(KIOSK_ID);
  return {
    name: kiosk.name,
    firmware: kiosk.firmware,
    lastSeen: kiosk.last_seen,
    online: kioskOnline(),
    connectedAt: runtime.connectedAt,
    mode: runtime.mode,
    autoSleep: getSetting('auto_sleep') === 'true',
    autoSleepMinutes: Number(getSetting('auto_sleep_minutes', 15)),
  };
}

export function renameKiosk(name) {
  db.prepare('UPDATE kiosks SET name = ? WHERE id = ?').run(name, KIOSK_ID);
  broadcast();
}

export function setBrightness(percent) {
  setSetting('kiosk_brightness', Math.round(Math.min(100, Math.max(30, percent))));
  broadcast();
}

// Only a quiet kiosk can sleep; a child in the middle of a picture keeps it awake.
export function sleepKiosk() {
  if (!QUIET_MODES.includes(runtime.mode)) return false;
  runtime.sleeping = true;
  broadcast();
  return true;
}

export function wakeKiosk() {
  runtime.lastActivity = Date.now();
  if (!runtime.sleeping) return;
  runtime.sleeping = false;
  broadcast();
}

function autoSleep() {
  if (runtime.sleeping || !QUIET_MODES.includes(runtime.mode) || getSetting('auto_sleep') !== 'true') return;
  const minutes = Number(getSetting('auto_sleep_minutes', 15));
  if (Date.now() - runtime.lastActivity >= minutes * 60_000 && sleepKiosk()) logEvent('kiosk_sleep', { auto: true });
}

export function joinUrl(publicBase) {
  return runtime.joinToken ? `${publicBase}/play?t=${runtime.joinToken}` : null;
}

// ---------- Sessions (teacher) ----------

export function startSession(teacherId, config) {
  if (runtime.session) endSession();
  const info = db
    .prepare(
      `INSERT INTO sessions (kiosk_id, teacher_id, activity_type, activity_subtype, theme, safety_level,
                             languages, blocked_words, allowed_words, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
    )
    .run(
      KIOSK_ID,
      teacherId,
      config.activityType,
      config.activitySubtype,
      config.theme,
      config.safetyLevel,
      JSON.stringify(config.languages),
      JSON.stringify(config.blockedWords ?? []),
      JSON.stringify(config.allowedWords ?? [])
    );
  runtime.joinToken = newToken();
  db.prepare('UPDATE sessions SET join_token = ? WHERE id = ?').run(runtime.joinToken, info.lastInsertRowid);
  runtime.session = parseSession(db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid));
  setMode('ready', null);
  return runtime.session;
}

export function pauseSession() {
  if (!runtime.session) return;
  updateSessionStatus('paused');
  setMode('paused', null);
}

export function resumeSession() {
  if (!runtime.session) return;
  updateSessionStatus('active');
  setMode('ready', null);
  runNextOverride();
}

export function endSession() {
  if (!runtime.session) return;
  db.prepare("UPDATE sessions SET status = 'ended', ended_at = datetime('now') WHERE id = ?").run(runtime.session.id);
  runtime.session = null;
  runtime.joinToken = null;
  runtime.overrides = [];
  io.to('children').disconnectSockets();
  setMode('waiting', null);
}

function updateSessionStatus(status) {
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, runtime.session.id);
  runtime.session.status = status;
}

// ---------- Child requests ----------

export function childJoined() {
  runtime.lastActivity = Date.now();
  runtime.sleeping = false;
  broadcast();
}

export function childLeft() {
  if (runtime.mode === 'listening') setMode('ready', null);
  else broadcast(); // the teacher's phone count changes
}

export function childListening(isListening) {
  if (isListening && runtime.mode === 'ready') setMode('listening', null);
  else if (!isListening && runtime.mode === 'listening') setMode('ready', null);
}

// Returns an error message for the child page, or null when accepted.
export function submitPrompt({ text, language }) {
  const session = runtime.session;
  const clean = String(text ?? '').trim().slice(0, 200);
  if (!session || session.status !== 'active') return 'The kiosk is not ready yet. Ask your teacher.';
  if (!['ready', 'listening'].includes(runtime.mode)) return 'The kiosk is busy. Please wait a moment.';
  if (!clean) return "I didn't hear anything. Try again!";

  const queueNumber =
    db.prepare('SELECT COUNT(*) AS n FROM requests WHERE session_id = ?').get(session.id).n + 1;
  const id = db
    .prepare(
      `INSERT INTO requests (session_id, queue_number, original_speech, recognized_text, language, status)
       VALUES (?, ?, ?, ?, ?, 'processing')`
    )
    .run(session.id, queueNumber, clean, clean, language ?? null).lastInsertRowid;

  runPipeline(Number(id), queueNumber, clean, session).catch((err) => console.error('Pipeline error:', err));
  return null;
}

// override: a teacher approved this blocked request, so the safety check is skipped.
async function runPipeline(id, queueNumber, text, session, override = false) {
  const current = { id, queueNumber, recognizedText: text, status: 'processing', imageUrl: null, override };
  setMode('processing', current);

  const verdict = override ? { allowed: true } : checkSafety(text, session);
  if (!verdict.allowed) {
    updateRequest(id, {
      status: 'blocked',
      block_category: verdict.category,
      block_reason: verdict.reason,
      block_match: verdict.matched,
      moderation_status: 'pending',
    });
    setMode('blocked', { ...current, status: 'blocked' });
    setTimeout(() => backToReady(id), BLOCKED_SCREEN_MS);
    return;
  }

  const built = buildPrompt(session, text);
  updateRequest(id, { status: 'generating', final_prompt: built.prompt, sheet: JSON.stringify(built.sheet) });
  setMode('generating', { ...current, status: 'generating' });

  try {
    const file = await generateImage(built, id);
    updateRequest(id, { status: 'success', image_file: file, generated_at: now() });
    setMode('printing', { ...current, status: 'success', imageUrl: `/images/${file}`, sheet: built.sheet });
    printer.print({ requestId: id, kind: 'child', ink: inkFor(session.activity_type) }, (problem) => {
      updateRequest(id, problem ? { print_status: 'failed', print_error: problem } : { print_status: 'printed', printed_at: now(), print_error: null });
      // The child still sees the picture on screen; the teacher reprints it later.
      if (runtime.mode === 'printing' && runtime.current?.id === id) {
        setMode('preview', { ...runtime.current, printProblem: problem && printer.PROBLEMS[problem] });
      } else broadcast();
    });
  } catch (err) {
    console.error(`Request ${id} failed:`, err.message);
    updateRequest(id, { status: 'failed' });
    setMode('error', { ...current, status: 'failed' });
    setTimeout(() => backToReady(id), ERROR_SCREEN_MS);
  }
}

// The kiosk calls this when the preview times out or the child taps "Done".
export function kioskNext(id) {
  if (runtime.mode === 'preview' && runtime.current?.id === id) backToReady(id);
}

function backToReady(id) {
  if (runtime.current?.id !== id) return;
  setMode(runtime.session?.status === 'active' ? 'ready' : runtime.session ? 'paused' : 'waiting', null);
  runNextOverride();
}

// ---------- Moderation (teacher) ----------

export function keepBlocked(id, teacherId) {
  const ok = markReviewed(id, 'kept_blocked', teacherId);
  if (ok) broadcast();
  return ok;
}

// Returns null when the request was already reviewed, otherwise what happens
// next: 'now' (picture starts), 'queued' (once the kiosk is free) or
// 'saved' (its session has ended, so only the decision is kept).
export function overrideRequest(id, teacherId) {
  if (!markReviewed(id, 'overridden', teacherId)) return null;
  const row = db.prepare('SELECT session_id FROM requests WHERE id = ?').get(id);
  if (row.session_id !== runtime.session?.id) {
    broadcast();
    return 'saved';
  }
  runtime.overrides.push(id);
  const startedNow = runNextOverride();
  if (!startedNow) broadcast();
  return startedNow ? 'now' : 'queued';
}

// Overridden requests wait until the kiosk is back on the QR screen, so a
// child who is speaking or looking at a picture is never interrupted.
function runNextOverride() {
  if (runtime.mode !== 'ready' || runtime.session?.status !== 'active' || runtime.overrides.length === 0) return false;
  const id = runtime.overrides.shift();
  const row = db.prepare('SELECT queue_number, recognized_text FROM requests WHERE id = ?').get(id);
  runPipeline(id, row.queue_number, row.recognized_text, runtime.session, true).catch((err) => console.error('Pipeline error:', err));
  return true;
}

// ---------- Printing (Print Management) ----------

// Prints a finished picture again, or for the first time if its print failed.
// Returns an error message, or null when the page is on its way.
export function reprint(id) {
  const row = db
    .prepare('SELECT r.status, s.activity_type FROM requests r JOIN sessions s ON s.id = r.session_id WHERE r.id = ?')
    .get(id);
  if (!row || row.status !== 'success') return 'This picture was not made, so it cannot be printed.';
  const problem = printer.problem();
  if (problem) return `${printer.PROBLEMS[problem]}. Fix the printer first.`;
  printer.print({ requestId: id, kind: 'reprint', ink: inkFor(row.activity_type) }, (failed) => {
    const firstPrint = db.prepare('SELECT print_status FROM requests WHERE id = ?').get(id).print_status !== 'printed';
    if (failed) updateRequest(id, firstPrint ? { print_status: 'failed', print_error: failed } : { print_error: failed });
    else if (firstPrint) updateRequest(id, { print_status: 'printed', printed_at: now(), print_error: null });
    else db.prepare("UPDATE requests SET reprint_count = reprint_count + 1, print_error = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
    broadcast();
  });
  return null;
}

// Sends every picture whose print failed to the printer again.
export function retryFailedPrints() {
  const problem = printer.problem();
  if (problem) return { error: `${printer.PROBLEMS[problem]}. Fix the printer first.` };
  const ids = db.prepare("SELECT id FROM requests WHERE status = 'success' AND print_status = 'failed' ORDER BY id").all();
  for (const { id } of ids) reprint(id);
  return { count: ids.length };
}

export function testPrint() {
  const problem = printer.problem();
  if (problem) return `${printer.PROBLEMS[problem]}. Fix the printer first.`;
  printer.print({ requestId: null, kind: 'test', ink: 1 }, () => {});
  return null;
}

// SQLite's own UTC format, like datetime('now').
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function updateRequest(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE requests SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...fields, id });
}

const newToken = () => crypto.randomBytes(9).toString('base64url');
