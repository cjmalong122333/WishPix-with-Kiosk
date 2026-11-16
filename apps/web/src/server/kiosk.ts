import type { Session } from '@/generated/prisma/client';
import { describeError } from './errors';
import { prisma } from './db';
import { buildPrompt, FREE_EXPRESSION, isFreeExpression, pageKind, type Sheet } from './catalog';
import { checkSafety, CATEGORIES } from './safety';
import { generateImage } from './ai/image';
import { moderate, openaiAvailable, processWish } from './ai/openai';
import { markReviewed, pendingCount } from './moderation';
import * as printer from './printer';
import { getSetting, screenPrefs, setSetting } from './settings';
import { logEvent } from './events';
import { parseJson } from './json';
import { bus, ROOM } from './realtime';
import * as teacherPrint from './teacher-print';
import { tidyWord, wordPair, type WordPair } from './words';

// The kiosk runtime. Modes, in the order a normal request moves through them:
//   waiting (no session) -> ready (big microphone button) -> listening
//   -> heard (child confirms what the kiosk understood) -> processing
//   -> generating -> printing -> preview -> ready.
// Side modes: blocked, error, paused, teacher_print (a file a teacher sent
// is printing; only starts while no child is in the middle of a wish). The
// screen can also be asleep in any quiet mode (waiting, ready, paused); a
// touch or the teacher wakes it.

export type KioskMode =
  | 'waiting' | 'ready' | 'listening' | 'heard' | 'processing' | 'generating'
  | 'printing' | 'preview' | 'blocked' | 'error' | 'paused' | 'teacher_print';

export type SessionView = {
  id: number;
  activity_type: string;
  activity_subtype: string;
  theme: string;
  safety_level: string;
  languages: string[];
  blocked_words: string[];
  allowed_words: string[];
  status: string;
  started_at: string;
};

export type Current = {
  id: number | null;
  queueNumber: number | null;
  recognizedText: string;
  language: string | null;
  status: string;
  imageUrl: string | null; // the AI picture (none for Trace Word)
  pageUrl?: string | null; // the page as it prints (/api/pages/<id>)
  sheet?: Sheet | null;
  label?: { en: string; fil: string } | null;
  override?: boolean;
  printProblem?: string | null;
};

// A teacher's file printing on the kiosk (Print to Kiosk).
export type TeacherPrint = { id: number; done: number; total: number };

type Runtime = {
  ready: Promise<void> | null;
  mode: KioskMode;
  session: SessionView | null;
  current: Current | null;
  overrides: number[]; // request ids a teacher overrode, waiting for the kiosk to be free
  teacherPrint: TeacherPrint | null;
  sleeping: boolean;
  lastActivity: number;
  connectedAt: string | null; // when the kiosk screen connected, for uptime
  idleTimer: NodeJS.Timeout | null;
};

const g = globalThis as unknown as { __wishpixKiosk?: Runtime };
const rt: Runtime = (g.__wishpixKiosk ??= {
  ready: null,
  mode: 'waiting',
  session: null,
  current: null,
  overrides: [],
  teacherPrint: null,
  sleeping: false,
  lastActivity: Date.now(),
  connectedAt: null,
  idleTimer: null,
});
rt.teacherPrint ??= null; // a runtime kept from before this field existed (development reloads)

const KIOSK_ID = 1;
const BLOCKED_SCREEN_MS = 6000;
const ERROR_SCREEN_MS = 6000;
// A child who walks away mid-wish: the kiosk goes back to the start.
const ABANDON_MS = { listening: 30_000, heard: 45_000 } as const;
const QUIET_MODES: KioskMode[] = ['waiting', 'ready', 'paused'];

const toView = (s: Session): SessionView => ({
  id: s.id,
  activity_type: s.activityType,
  activity_subtype: s.activitySubtype,
  theme: s.theme,
  safety_level: s.safetyLevel,
  languages: parseJson(s.languages, []),
  blocked_words: parseJson(s.blockedWords, []),
  allowed_words: parseJson(s.allowedWords, []),
  status: s.status,
  started_at: s.startedAt.toISOString(),
});

const rulesOf = (s: SessionView) => ({
  activityType: s.activity_type,
  activitySubtype: s.activity_subtype,
  theme: s.theme,
  safetyLevel: s.safety_level,
  blockedWords: s.blocked_words,
  allowedWords: s.allowed_words,
});

// Runs once per server start: restores a running session, makes sure the
// kiosk row exists and starts the background timers.
export function ensureRuntime() {
  rt.ready ??= (async () => {
    const kiosk = await prisma.kiosk.findUnique({ where: { id: KIOSK_ID } });
    if (!kiosk) {
      await prisma.kiosk.create({ data: { id: KIOSK_ID, name: process.env.KIOSK_NAME || 'WishPix Kiosk', firmware: process.env.npm_package_version || '1.0.0' } });
    }
    const row = await prisma.session.findFirst({ where: { status: { in: ['active', 'paused'] } }, orderBy: { id: 'desc' } });
    if (row) {
      rt.session = toView(row);
      rt.mode = row.status === 'paused' ? 'paused' : 'ready';
    }
    // A request that was mid-way when the server stopped can't finish.
    await prisma.request.updateMany({ where: { status: { in: ['processing', 'generating'] } }, data: { status: 'failed' } });
    // Neither can a teacher's file that was printing.
    await teacherPrint.recoverJobs();

    bus.hooks.kioskConnected = () => void kioskConnectionChanged(true);
    bus.hooks.kioskDisconnected = () => void kioskConnectionChanged(false);
    bus.hooks.teachersChanged = () => void broadcast();
    printer.onPrinterChange(() => void broadcast());
    printer.startPrinterPolling();
    setInterval(() => void autoSleep(), 30_000).unref();
    if (bus.kioskSockets.size > 0) rt.connectedAt = new Date().toISOString();
  })();
  return rt.ready;
}

export const kioskOnline = () => bus.kioskSockets.size > 0;
export const isQueuedOverride = (id: number) => rt.overrides.includes(id);

export async function currentSession() {
  await ensureRuntime();
  return rt.session;
}

// The teacher who opened the Teacher App most recently, while it is open:
// their name and device, for the kiosk's "Connected" screen.
async function connectedTeacher(): Promise<{ name: string; device: string } | null> {
  let latest: { teacherId: number; device: string; since: number } | null = null;
  for (const t of bus.teacherSockets.values()) if (!latest || t.since > latest.since) latest = t;
  if (!latest) return null;
  const user = await prisma.teacher.findUnique({ where: { id: latest.teacherId }, select: { displayName: true } });
  return user ? { name: user.displayName, device: latest.device } : null;
}

export async function publicState() {
  await ensureRuntime();
  const [kiosk, pending, prefs, brightness, teacher, teacherPrints] = await Promise.all([
    prisma.kiosk.findUnique({ where: { id: KIOSK_ID } }),
    pendingCount(),
    screenPrefs(),
    getSetting('kiosk_brightness'),
    connectedTeacher(),
    teacherPrint.pendingJobs(),
  ]);
  return {
    kioskName: kiosk?.name ?? 'Kiosk',
    kioskOnline: kioskOnline(),
    mode: rt.mode,
    session: rt.session,
    current: rt.current,
    // Print to Kiosk: files waiting for a quiet moment, and the one printing now.
    teacherPrint: { pending: teacherPrints, printing: rt.teacherPrint },
    pendingModeration: pending,
    screen: { sleeping: rt.sleeping, brightness: Number(brightness ?? 100) },
    printer: printer.printerState(),
    teacher,
    prefs,
  };
}
export type KioskState = Awaited<ReturnType<typeof publicState>>;

export async function broadcast() {
  if (!bus.io) return;
  const state = await publicState();
  bus.io.to([ROOM.kiosk, ROOM.teachers]).emit('state', state);
}

function setMode(mode: KioskMode, current: Current | null = rt.current) {
  if (mode !== rt.mode) {
    rt.lastActivity = Date.now();
    rt.sleeping = false;
  }
  rt.mode = mode;
  rt.current = current;
  if (rt.idleTimer) clearTimeout(rt.idleTimer);
  rt.idleTimer = null;
  if (mode === 'listening' || mode === 'heard') {
    rt.idleTimer = setTimeout(() => {
      if (rt.mode === mode) setMode(readyMode(), null);
    }, ABANDON_MS[mode]);
  }
  void broadcast();
}

const readyMode = (): KioskMode => (rt.session?.status === 'active' ? 'ready' : rt.session ? 'paused' : 'waiting');

// ---------- Kiosk connection and screen ----------

async function kioskConnectionChanged(connected: boolean) {
  if (connected && !rt.connectedAt) rt.connectedAt = new Date().toISOString();
  if (!connected && bus.kioskSockets.size === 0) {
    rt.connectedAt = null;
    // The child at the kiosk is gone with the screen.
    if (rt.mode === 'listening' || rt.mode === 'heard') setMode(readyMode(), null);
  }
  await prisma.kiosk.update({ where: { id: KIOSK_ID }, data: { lastSeen: new Date() } }).catch(() => {});
  await broadcast();
}

// "Test sound" on the Settings page. Each open kiosk screen answers whether
// it played the sound (SoundResult in src/components/kiosk/sounds.ts); no
// answers means no kiosk screen is open.
export type SoundAnswer = { played: boolean; reason?: string };

export function playSound(name: string): Promise<SoundAnswer[]> {
  const io = bus.io;
  if (!io) return Promise.resolve([]);
  return new Promise((resolve) => {
    // A screen that does not answer in time (an old page) is left out.
    io.to(ROOM.kiosk)
      .timeout(3000)
      .emit('kiosk:sound', name, (_err: unknown, answers: SoundAnswer[]) => resolve(Array.isArray(answers) ? answers : []));
  });
}

export function restartKiosk() {
  rt.sleeping = false;
  bus.io?.to(ROOM.kiosk).emit('kiosk:reload');
}

export async function kioskInfo() {
  await ensureRuntime();
  const [kiosk, autoSleep, minutes] = await Promise.all([
    prisma.kiosk.findUniqueOrThrow({ where: { id: KIOSK_ID } }),
    getSetting('auto_sleep'),
    getSetting('auto_sleep_minutes'),
  ]);
  return {
    name: kiosk.name,
    firmware: kiosk.firmware,
    lastSeen: kiosk.lastSeen?.toISOString() ?? null,
    online: kioskOnline(),
    connectedAt: rt.connectedAt,
    mode: rt.mode,
    autoSleep: autoSleep === 'true',
    autoSleepMinutes: Number(minutes ?? 15),
  };
}

export async function renameKiosk(name: string) {
  await prisma.kiosk.update({ where: { id: KIOSK_ID }, data: { name } });
  await broadcast();
}

export async function setBrightness(percent: number) {
  await setSetting('kiosk_brightness', Math.round(Math.min(100, Math.max(30, percent))));
  await broadcast();
}

// Only a quiet kiosk can sleep; a child in the middle of a picture keeps it awake.
export function sleepKiosk() {
  if (!QUIET_MODES.includes(rt.mode)) return false;
  rt.sleeping = true;
  void broadcast();
  return true;
}

export function wakeKiosk() {
  rt.lastActivity = Date.now();
  if (!rt.sleeping) return;
  rt.sleeping = false;
  void broadcast();
}

async function autoSleep() {
  if (rt.sleeping || !QUIET_MODES.includes(rt.mode) || (await getSetting('auto_sleep')) !== 'true') return;
  const minutes = Number((await getSetting('auto_sleep_minutes')) ?? 15);
  if (Date.now() - rt.lastActivity >= minutes * 60_000 && sleepKiosk()) await logEvent('kiosk_sleep', { auto: true });
}

// ---------- Sessions (teacher) ----------

export type SessionConfig = {
  activityType: string;
  activitySubtype: string;
  theme: string;
  safetyLevel: string;
  languages: string[];
  blockedWords: string[];
  allowedWords: string[];
};

export async function startSession(teacherId: number, config: SessionConfig) {
  await ensureRuntime();
  if (rt.session) await endSession();
  const row = await prisma.session.create({
    data: {
      kioskId: KIOSK_ID,
      teacherId,
      activityType: config.activityType,
      activitySubtype: config.activitySubtype,
      theme: config.theme,
      safetyLevel: config.safetyLevel,
      languages: JSON.stringify(config.languages),
      blockedWords: JSON.stringify(config.blockedWords),
      allowedWords: JSON.stringify(config.allowedWords),
      status: 'active',
    },
  });
  rt.session = toView(row);
  setMode('ready', null);
  return rt.session;
}

async function updateSessionStatus(status: 'active' | 'paused') {
  if (!rt.session) return;
  await prisma.session.update({ where: { id: rt.session.id }, data: { status } });
  rt.session = { ...rt.session, status };
}

export async function pauseSession() {
  await ensureRuntime();
  if (!rt.session) return;
  await updateSessionStatus('paused');
  setMode('paused', null);
}

export async function resumeSession() {
  await ensureRuntime();
  if (!rt.session) return;
  await updateSessionStatus('active');
  setMode('ready', null);
  runNextOverride();
}

export async function endSession() {
  await ensureRuntime();
  if (!rt.session) return;
  await prisma.session.update({ where: { id: rt.session.id }, data: { status: 'ended', endedAt: new Date() } });
  rt.session = null;
  rt.overrides = [];
  setMode('waiting', null);
}

// ---------- The child at the kiosk ----------

// Errors are short English sentences the kiosk translates.
type Result = { error: string } | { ok: true };

export async function startListening(): Promise<Result> {
  await ensureRuntime();
  if (!rt.session || rt.session.status !== 'active') return { error: 'The kiosk is not ready yet. Ask your teacher.' };
  if (rt.mode !== 'ready' && rt.mode !== 'heard') return { error: 'The kiosk is busy. Please wait a moment.' };
  rt.sleeping = false;
  setMode('listening', null);
  return { ok: true };
}

export async function cancelListening() {
  await ensureRuntime();
  if (rt.mode === 'listening' || rt.mode === 'heard') setMode(readyMode(), null);
}

// What the kiosk understood; the child says yes (submitWish) or tries again.
export async function heard(text: string, language: string | null): Promise<Result> {
  await ensureRuntime();
  const clean = text.trim().slice(0, 200);
  if (rt.mode !== 'listening' && rt.mode !== 'heard') return { error: 'The kiosk is busy. Please wait a moment.' };
  if (!clean) {
    setMode(readyMode(), null);
    return { error: "I didn't hear anything. Try again!" };
  }
  setMode('heard', { id: null, queueNumber: null, recognizedText: clean, language, status: 'heard', imageUrl: null });
  return { ok: true };
}

export async function submitWish(): Promise<Result> {
  await ensureRuntime();
  const session = rt.session;
  const wish = rt.current;
  if (!session || session.status !== 'active') return { error: 'The kiosk is not ready yet. Ask your teacher.' };
  if (rt.mode !== 'heard' || !wish?.recognizedText) return { error: 'The kiosk is busy. Please wait a moment.' };

  const queueNumber = (await prisma.request.count({ where: { sessionId: session.id } })) + 1;
  const request = await prisma.request.create({
    data: {
      sessionId: session.id,
      queueNumber,
      originalSpeech: wish.recognizedText,
      recognizedText: wish.recognizedText,
      language: wish.language,
      status: 'processing',
    },
  });
  runPipeline(request.id, queueNumber, wish.recognizedText, wish.language, session).catch((err) => console.error('[kiosk] pipeline error:', err));
  return { ok: true };
}

const updateRequest = (id: number, data: Parameters<typeof prisma.request.update>[0]['data']) =>
  prisma.request.update({ where: { id }, data });

const SPEECH_NAMES: Record<string, string> = { en: 'English', fil: 'Filipino', tl: 'Taglish' };

// override: a teacher approved this blocked request, so the safety checks are skipped.
async function runPipeline(id: number, queueNumber: number, text: string, language: string | null, session: SessionView, override = false) {
  const current: Current = { id, queueNumber, recognizedText: text, language, status: 'processing', imageUrl: null, override };
  setMode('processing', current);

  const block = async (category: string, matched: string, reason: string, source: 'filter' | 'ai') => {
    await updateRequest(id, { status: 'blocked', blockCategory: category, blockReason: reason, blockMatch: matched, blockSource: source, moderationStatus: 'pending' });
    setMode('blocked', { ...current, status: 'blocked' });
    setTimeout(() => backToReady(id), BLOCKED_SCREEN_MS);
  };

  // 1. The built-in word filter (English + Filipino, the teacher's own words).
  if (!override) {
    const verdict = checkSafety(text, rulesOf(session));
    if (!verdict.allowed) return block(verdict.category, verdict.matched, verdict.reason, 'filter');
  }

  // 2. OpenAI moderation + prompt processing, when set up. If the service is
  //    down the wish still goes ahead on the word filter's decision.
  let subject = text;
  let label: Current['label'] = null;
  // The word printed on the page; the built-in word list unless OpenAI picks it.
  let word: WordPair = wordPair(text);
  if (openaiAvailable()) {
    try {
      const [mod, wish] = await Promise.all([
        override ? Promise.resolve({ flagged: false as const }) : moderate(text),
        processWish(text, {
          activity: `${session.activity_type}/${session.activity_subtype}`,
          theme: isFreeExpression(session.theme) ? `none (${FREE_EXPRESSION}: any idea is fine)` : session.theme,
          strict: session.safety_level === 'strict',
          language: SPEECH_NAMES[language ?? ''] ?? 'unknown',
        }),
      ]);
      if (!override && mod.flagged) {
        return block(mod.category, text, `The AI safety check flagged this (${CATEGORIES[mod.category]?.toLowerCase() ?? mod.category}).`, 'ai');
      }
      if (!override && !wish.safe) {
        const category = wish.category === 'none' ? 'violence' : wish.category;
        return block(category, text, `The AI safety check flagged this (${CATEGORIES[category]?.toLowerCase() ?? category}).`, 'ai');
      }
      subject = wish.subject || text;
      label = wish.label_en ? { en: wish.label_en, fil: wish.label_fil || wish.label_en } : null;
      const en = tidyWord(wish.word_en);
      if (en) word = { en, fil: tidyWord(wish.word_fil) };
    } catch (err) {
      console.error(`[kiosk] OpenAI step failed for request ${id}, using the word filter only:`, describeError(err));
    }
  }

  // 3. The picture (Trace Word pages are letters only: no picture to make).
  const built = buildPrompt(rulesOf(session), subject, word);
  await updateRequest(id, {
    status: 'generating',
    finalPrompt: built.prompt || null,
    sheet: JSON.stringify(built.sheet),
    labelEn: label?.en ?? null,
    labelFil: label?.fil ?? null,
  });
  setMode('generating', { ...current, status: 'generating', label });

  let image: { file: string; provider: string } | null = null;
  if (built.needsImage) {
    try {
      image = await generateImage(built, id);
    } catch (err) {
      console.error(`[kiosk] request ${id} failed:`, describeError(err));
      await updateRequest(id, { status: 'failed' });
      setMode('error', { ...current, status: 'failed' });
      setTimeout(() => backToReady(id), ERROR_SCREEN_MS);
      return;
    }
  }

  await updateRequest(id, { status: 'success', imageFile: image?.file ?? null, imageProvider: image?.provider ?? null, generatedAt: new Date() });
  const shown: Current = {
    ...current,
    status: 'success',
    imageUrl: image ? `/images/${image.file}` : null,
    pageUrl: pageUrl(id),
    sheet: built.sheet,
    label,
  };
  setMode('printing', shown);

  // 4. The printed page. The child still sees it on screen if the printer
  //    has a problem; the teacher reprints it later.
  const prefs = await screenPrefs();
  const problem = await printer.print({
    requestId: id,
    kind: 'child',
    imageFile: image?.file ?? null,
    activityType: session.activity_type,
    theme: session.theme,
    sheet: built.sheet,
    language: prefs.language,
  });
  await updateRequest(id, problem ? { printStatus: 'failed', printError: problem } : { printStatus: 'printed', printedAt: new Date(), printError: null });
  if (rt.mode === 'printing' && rt.current?.id === id) {
    setMode('preview', { ...rt.current, printProblem: problem ? printer.PROBLEMS[problem] ?? problem : null });
  } else void broadcast();
}

// The kiosk calls this when "Worksheet ready" times out or the child presses Yes.
export async function kioskNext(id: number) {
  await ensureRuntime();
  if (rt.mode === 'preview' && rt.current?.id === id) backToReady(id);
}

function backToReady(id: number) {
  if (rt.current?.id !== id) return;
  setMode(readyMode(), null);
  runNextOverride();
}

// The printed page as an image (src/app/api/pages/[id]/route.ts). The query
// only tells the browser to fetch it again when the language or paper changes.
export function pageUrl(id: number, language?: string) {
  return `/api/pages/${id}?v=${language ?? ''}${printer.printerState().format ?? ''}`;
}

// ---------- Print to Kiosk (a teacher's file) ----------

// The kiosk screen calls this when no child is in the middle of a wish (it
// shows its start screen, or there is no session) and files are waiting.
// The child's turn is never interrupted: a busy kiosk just says no.
export async function claimTeacherPrint(): Promise<Result> {
  await ensureRuntime();
  if (rt.teacherPrint || !QUIET_MODES.includes(rt.mode)) return { error: 'The kiosk is busy. Please wait a moment.' };
  const job = await teacherPrint.takeNextJob();
  if (!job) return { ok: true };
  // The printer can't print: tell the teacher now instead of showing the children a print that won't come.
  const problem = printer.problem();
  if (problem) {
    await teacherPrint.failJob(job.id, problem);
    await logEvent('print_teacher', { jobId: job.id, fileName: job.fileName, status: 'failed', problem: printer.PROBLEMS[problem] ?? problem });
    await broadcast();
    return { ok: true };
  }
  rt.teacherPrint = { id: job.id, done: 0, total: job.sheetsTotal };
  setMode('teacher_print', null);
  void (async () => {
    await teacherPrint.runJob(job, (done, total) => {
      if (rt.teacherPrint?.id !== job.id) return;
      rt.teacherPrint = { id: job.id, done, total };
      void broadcast();
    });
    const row = await prisma.printJob.findUnique({ where: { id: job.id }, select: { status: true, errorMessage: true, sheetsDone: true } });
    await logEvent('print_teacher', { jobId: job.id, fileName: job.fileName, status: row?.status, sheets: row?.sheetsDone, problem: row?.errorMessage ?? undefined });
  })()
    .catch((err) => console.error('[kiosk] teacher print error:', describeError(err)))
    .finally(() => {
      rt.teacherPrint = null;
      setMode(readyMode(), null);
      runNextOverride();
    });
  return { ok: true };
}

// ---------- Moderation (teacher) ----------

export async function keepBlocked(id: number, teacherId: number) {
  const ok = await markReviewed(id, 'kept_blocked', teacherId);
  if (ok) await broadcast();
  return ok;
}

// Returns null when the request was already reviewed, otherwise what happens
// next: 'now' (picture starts), 'queued' (once the kiosk is free) or
// 'saved' (its session has ended, so only the decision is kept).
export async function overrideRequest(id: number, teacherId: number) {
  await ensureRuntime();
  if (!(await markReviewed(id, 'overridden', teacherId))) return null;
  const row = await prisma.request.findUniqueOrThrow({ where: { id }, select: { sessionId: true } });
  if (row.sessionId !== rt.session?.id) {
    await broadcast();
    return 'saved';
  }
  rt.overrides.push(id);
  const startedNow = runNextOverride();
  if (!startedNow) await broadcast();
  return startedNow ? 'now' : 'queued';
}

// Overridden requests wait until the kiosk is back on its start screen, so a
// child who is speaking or looking at a picture is never interrupted.
function runNextOverride() {
  const session = rt.session;
  if (rt.mode !== 'ready' || session?.status !== 'active' || rt.overrides.length === 0) return false;
  const id = rt.overrides.shift()!;
  void (async () => {
    const row = await prisma.request.findUnique({ where: { id }, select: { queueNumber: true, recognizedText: true, language: true } });
    if (!row) return;
    await runPipeline(id, row.queueNumber, row.recognizedText, row.language, session, true);
  })().catch((err) => console.error('[kiosk] pipeline error:', err));
  return true;
}

// ---------- Printing (Print Management) ----------

// What the hardware service needs to lay out a finished request's page, in
// today's display language. Pages saved before November 2026 (no words on
// the sheet, Free Play) print as the closest new page.
export async function pageJob(id: number, kind: 'child' | 'reprint'): Promise<printer.PrintJob | null> {
  const row = await prisma.request.findUnique({ where: { id }, include: { session: true } });
  if (!row || row.status !== 'success') return null;
  const saved = parseJson<Sheet | null>(row.sheet, null);
  const rules = { activityType: row.session.activityType, activitySubtype: row.session.activitySubtype, theme: row.session.theme };
  const sheet: Sheet = saved && 'en' in saved ? saved : { kind: pageKind(rules), ...wordPair(row.recognizedText) };
  if (!row.imageFile && sheet.kind !== 'trace_word') return null;
  const prefs = await screenPrefs();
  return {
    requestId: id,
    kind,
    imageFile: row.imageFile,
    activityType: row.session.activityType,
    theme: row.session.theme,
    sheet,
    language: prefs.language,
  };
}

async function printRequest(id: number, kind: 'reprint') {
  const job = await pageJob(id, kind);
  return job ? printer.print(job) : null;
}

const fixFirst = (p: string) => `${printer.PROBLEMS[p] ?? p}. Fix the printer first.`;

// Prints a finished picture again, or for the first time if its print failed.
// Returns an error message, or null when the page is on its way.
export async function reprint(id: number) {
  const row = await prisma.request.findUnique({ where: { id }, select: { status: true, printStatus: true } });
  if (!row || row.status !== 'success') return 'This picture was not made, so it cannot be printed.';
  const problem = printer.problem();
  if (problem) return fixFirst(problem);
  void (async () => {
    const failed = await printRequest(id, 'reprint');
    const firstPrint = (await prisma.request.findUniqueOrThrow({ where: { id }, select: { printStatus: true } })).printStatus !== 'printed';
    if (failed) await updateRequest(id, firstPrint ? { printStatus: 'failed', printError: failed } : { printError: failed });
    else if (firstPrint) await updateRequest(id, { printStatus: 'printed', printedAt: new Date(), printError: null });
    else await updateRequest(id, { reprintCount: { increment: 1 }, printError: null });
    await broadcast();
  })().catch((err) => console.error('[kiosk] reprint error:', err));
  return null;
}

// Sends every picture whose print failed to the printer again.
export async function retryFailedPrints() {
  const problem = printer.problem();
  if (problem) return { error: fixFirst(problem) };
  const rows = await prisma.request.findMany({ where: { status: 'success', printStatus: 'failed' }, select: { id: true }, orderBy: { id: 'asc' } });
  for (const { id } of rows) await reprint(id);
  return { count: rows.length };
}

export function testPrint() {
  const problem = printer.problem();
  if (problem) return fixFirst(problem);
  void printer.print({ requestId: null, kind: 'test' });
  return null;
}
