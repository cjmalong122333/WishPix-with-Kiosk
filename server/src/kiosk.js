import crypto from 'node:crypto';
import { db, parseSession } from './db.js';
import { buildPrompt } from './catalog.js';
import { checkSafety } from './safety.js';
import { generateImage } from './image-gen.js';

// Kiosk modes, in the order a normal request moves through them:
// waiting (no session) -> ready (QR shown) -> listening -> processing
// -> generating -> printing -> preview -> ready.
// Side modes: blocked, error, paused.
const runtime = {
  kioskSockets: new Set(),
  mode: 'waiting',
  session: null,
  joinToken: null,
  current: null, // the request on screen right now
};

let io = null;
const KIOSK_ID = 1;
const BLOCKED_SCREEN_MS = 6000;
const ERROR_SCREEN_MS = 6000;

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
}

export const kioskOnline = () => runtime.kioskSockets.size > 0;
export const isValidJoinToken = (t) => !!t && t === runtime.joinToken;

export function publicState() {
  return {
    kioskName: db.prepare('SELECT name FROM kiosks WHERE id = ?').get(KIOSK_ID)?.name,
    kioskOnline: kioskOnline(),
    mode: runtime.mode,
    session: runtime.session,
    current: runtime.current,
  };
}

export function broadcast() {
  const state = publicState();
  io.to('kiosk').to('teachers').emit('state', state);
  io.to('children').emit('state', {
    mode: state.mode,
    session: state.session && { theme: state.session.theme, languages: state.session.languages },
    current: state.current && { id: state.current.id, recognizedText: state.current.recognizedText, status: state.current.status },
  });
}

function setMode(mode, current = runtime.current) {
  runtime.mode = mode;
  runtime.current = current;
  broadcast();
}

// ---------- Kiosk connections ----------

export function kioskConnected(socket) {
  runtime.kioskSockets.add(socket.id);
  db.prepare("UPDATE kiosks SET last_seen = datetime('now') WHERE id = ?").run(KIOSK_ID);
  broadcast();
}

export function kioskDisconnected(socket) {
  runtime.kioskSockets.delete(socket.id);
  broadcast();
}

export function restartKiosk() {
  io.to('kiosk').emit('kiosk:reload');
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
}

export function endSession() {
  if (!runtime.session) return;
  db.prepare("UPDATE sessions SET status = 'ended', ended_at = datetime('now') WHERE id = ?").run(runtime.session.id);
  runtime.session = null;
  runtime.joinToken = null;
  io.to('children').disconnectSockets();
  setMode('waiting', null);
}

function updateSessionStatus(status) {
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, runtime.session.id);
  runtime.session.status = status;
}

// ---------- Child requests ----------

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

async function runPipeline(id, queueNumber, text, session) {
  const current = { id, queueNumber, recognizedText: text, status: 'processing', imageUrl: null };
  setMode('processing', current);

  const verdict = checkSafety(text, session);
  if (!verdict.allowed) {
    updateRequest(id, {
      status: 'blocked',
      block_category: verdict.category,
      block_reason: verdict.reason,
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
    updateRequest(id, { status: 'success', image_file: file });
    setMode('printing', { ...current, status: 'success', imageUrl: `/images/${file}`, sheet: built.sheet });
  } catch (err) {
    console.error(`Request ${id} failed:`, err.message);
    updateRequest(id, { status: 'failed' });
    setMode('error', { ...current, status: 'failed' });
    setTimeout(() => backToReady(id), ERROR_SCREEN_MS);
  }
}

// The kiosk calls this when its "printing" animation finishes.
export function kioskPrinted(id) {
  if (runtime.mode !== 'printing' || runtime.current?.id !== id) return;
  updateRequest(id, { print_status: 'printed' });
  setMode('preview');
}

// The kiosk calls this when the preview times out or the child taps "Done".
export function kioskNext(id) {
  if (runtime.mode === 'preview' && runtime.current?.id === id) backToReady(id);
}

function backToReady(id) {
  if (runtime.current?.id !== id) return;
  setMode(runtime.session?.status === 'active' ? 'ready' : runtime.session ? 'paused' : 'waiting', null);
}

function updateRequest(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE requests SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...fields, id });
}

const newToken = () => crypto.randomBytes(9).toString('base64url');
