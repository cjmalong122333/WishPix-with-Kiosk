import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { db, IMAGE_DIR } from './db.js';
import { login, logout, requireTeacher, teacherFromToken, changePassword, updateDisplayName } from './auth.js';
import { activities, themes, findActivity } from './catalog.js';
import { checkInternet } from './image-gen.js';
import { checkSafety } from './safety.js';
import { listModeration, getModerationItem, moderationSummary } from './moderation.js';
import * as kiosk from './kiosk.js';
import * as printer from './printer.js';
import { sessionRequests, sessionCounts, printHistory, printSummary, storageUsage } from './history.js';
import { readSettings, updateSettings } from './settings.js';
import { logEvent } from './events.js';
import * as insights from './insights.js';

const PORT = Number(process.env.PORT) || 3001;
// Where phones reach the app: the tunnel URL if set, otherwise this laptop's
// Wi-Fi address on the client port (5173 in dev, PORT when serving the build).
const DEV = process.argv.includes('--dev');
const CLIENT_PORT = Number(process.env.CLIENT_PORT) || (DEV ? 5173 : PORT);
const publicBase = () => process.env.PUBLIC_URL?.replace(/\/$/, '') || `http://${lanAddress()}:${CLIENT_PORT}`;

const app = express();
app.use(express.json());
app.use('/images', express.static(IMAGE_DIR));

// ---------- Public ----------

app.get('/api/health', async (_req, res) => {
  let database = true;
  try {
    db.prepare('SELECT 1').get();
  } catch {
    database = false;
  }
  res.json({ internet: await checkInternet(), database, kiosk: kiosk.kioskOnline() });
});

app.get('/api/prefs', (_req, res) => res.json({ language: readSettings().language }));

app.post('/api/login', (req, res) => {
  const result = login(String(req.body?.username ?? ''), String(req.body?.password ?? ''));
  if (!result) return res.status(401).json({ error: 'Incorrect username or password. Try again.' });
  logEvent('login', {}, result.teacher.id);
  res.json(result);
});

// ---------- Teacher ----------

app.post('/api/logout', requireTeacher, (req, res) => {
  logout(req.token);
  logEvent('logout', {}, req.teacher.id);
  res.json({ ok: true });
});

app.get('/api/me', requireTeacher, (req, res) => res.json({ teacher: req.teacher }));

app.get('/api/catalog', requireTeacher, (_req, res) => res.json({ activities, themes }));

app.get('/api/state', requireTeacher, (_req, res) => res.json(kiosk.publicState()));

// Today's numbers for the Dashboard summary cards (local time).
app.get('/api/dashboard', requireTeacher, (_req, res) => {
  const today = "date(created_at, 'localtime') = date('now', 'localtime')";
  const count = (sql) => db.prepare(sql).get().n;
  const topTheme = db
    .prepare(
      `SELECT s.theme, COUNT(*) AS n FROM requests r JOIN sessions s ON s.id = r.session_id
       WHERE r.status = 'success' AND date(r.created_at, 'localtime') = date('now', 'localtime')
       GROUP BY s.theme ORDER BY n DESC LIMIT 1`
    )
    .get();
  res.json({
    sessionsToday: count("SELECT COUNT(*) AS n FROM sessions WHERE date(started_at, 'localtime') = date('now', 'localtime')"),
    printsToday: count(`SELECT COUNT(*) AS n FROM requests WHERE print_status = 'printed' AND ${today}`),
    generatedToday: count(`SELECT COUNT(*) AS n FROM requests WHERE status = 'success' AND ${today}`),
    topTheme: topTheme ? { theme: topTheme.theme, count: topTheme.n } : null,
  });
});

// Simulated hardware restart: the kiosk screen reloads itself.
app.post('/api/kiosk/restart', requireTeacher, (req, res) => {
  logEvent('kiosk_restart', {}, req.teacher.id);
  kiosk.restartKiosk();
  res.json({ ok: true });
});

app.post('/api/sessions', requireTeacher, (req, res) => {
  const b = req.body ?? {};
  if (!findActivity(b.activityType, b.activitySubtype)) return res.status(400).json({ error: 'Choose an activity.' });
  if (!b.theme) return res.status(400).json({ error: 'Choose a theme.' });
  if (!['strict', 'standard', 'custom'].includes(b.safetyLevel)) return res.status(400).json({ error: 'Choose a safety level.' });
  if (!Array.isArray(b.languages) || b.languages.length === 0) return res.status(400).json({ error: 'Choose at least one language.' });
  const previous = kiosk.currentSession();
  if (previous) logEvent('session_end', { sessionId: previous.id, theme: previous.theme, replaced: true }, req.teacher.id);
  const session = kiosk.startSession(req.teacher.id, b);
  logEvent('session_start', { sessionId: session.id, theme: session.theme, activity: session.activity_type, subtype: session.activity_subtype, safety: session.safety_level }, req.teacher.id);
  res.json({ session });
});

// Logs a teacher action on the running session, if there is one.
const logSession = (type, req) => {
  const s = kiosk.currentSession();
  if (s) logEvent(type, { sessionId: s.id, theme: s.theme }, req.teacher.id);
};

app.post('/api/sessions/current/pause', requireTeacher, (req, res) => {
  logSession('session_pause', req);
  kiosk.pauseSession();
  res.json(kiosk.publicState());
});

app.post('/api/sessions/current/resume', requireTeacher, (req, res) => {
  logSession('session_resume', req);
  kiosk.resumeSession();
  res.json(kiosk.publicState());
});

app.post('/api/sessions/current/end', requireTeacher, (req, res) => {
  logSession('session_end', req);
  kiosk.endSession();
  res.json(kiosk.publicState());
});

// Everything that happened in the running session, for the Live Session page.
app.get('/api/sessions/current', requireTeacher, (_req, res) => {
  const session = kiosk.currentSession();
  if (!session) return res.json({ session: null });
  res.json({ session, requests: sessionRequests(session.id), counts: sessionCounts(session.id) });
});

// ---------- Kiosk Management ----------

app.get('/api/kiosk/info', requireTeacher, (_req, res) => {
  res.json({ ...kiosk.kioskInfo(), storage: storageUsage() });
});

app.patch('/api/kiosk', requireTeacher, (req, res) => {
  const b = req.body ?? {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Give the kiosk a name.' });
    kiosk.renameKiosk(name);
    logEvent('kiosk_rename', { name }, req.teacher.id);
  }
  if (b.brightness !== undefined) kiosk.setBrightness(Number(b.brightness) || 100);
  res.json(kiosk.kioskInfo());
});

app.post('/api/kiosk/sleep', requireTeacher, (req, res) => {
  if (!kiosk.sleepKiosk()) return res.status(409).json({ error: 'A child is using the kiosk. Try again when it is free.' });
  logEvent('kiosk_sleep', {}, req.teacher.id);
  res.json({ ok: true });
});

app.post('/api/kiosk/wake', requireTeacher, (req, res) => {
  logEvent('kiosk_wake', {}, req.teacher.id);
  kiosk.wakeKiosk();
  res.json({ ok: true });
});

// ---------- Print Management ----------

app.get('/api/print/history', requireTeacher, (req, res) => {
  res.json({ items: printHistory(req.query.view), summary: printSummary() });
});

app.post('/api/print/:id/reprint', requireTeacher, (req, res) => {
  const error = kiosk.reprint(Number(req.params.id));
  if (error) return res.status(409).json({ error });
  logEvent('print_reprint', { requestId: Number(req.params.id) }, req.teacher.id);
  res.json({ ok: true });
});

app.post('/api/print/retry-failed', requireTeacher, (req, res) => {
  const result = kiosk.retryFailedPrints();
  if (result.error) return res.status(409).json(result);
  logEvent('print_retry', { count: result.count }, req.teacher.id);
  res.json(result);
});

const PRINTER_ACTIONS = {
  'refill-paper': [printer.refillPaper, 'printer_refill'],
  'replace-ink': [printer.replaceInk, 'printer_ink'],
  clear: [printer.clearFault, 'printer_clear'],
};

app.post('/api/printer/test', requireTeacher, (req, res) => {
  const error = kiosk.testPrint();
  if (error) return res.status(409).json({ error });
  logEvent('printer_test', {}, req.teacher.id);
  res.json({ ok: true });
});

// Hardware simulator: give the pretend printer a problem to fix.
app.post('/api/printer/simulate', requireTeacher, (req, res) => {
  if (!(req.body?.problem in printer.SIMULATIONS)) return res.status(400).json({ error: 'Unknown problem.' });
  printer.simulate(req.body.problem);
  logEvent('printer_simulate', { problem: req.body.problem }, req.teacher.id);
  res.json({ ok: true });
});

app.post('/api/printer/:action', requireTeacher, (req, res) => {
  const entry = PRINTER_ACTIONS[req.params.action];
  if (!entry) return res.status(404).json({ error: 'Unknown printer action.' });
  const [action, type] = entry;
  const problem = printer.problem();
  action();
  logEvent(type, type === 'printer_clear' ? { problem } : {}, req.teacher.id);
  res.json({ ok: true });
});

// ---------- Moderation ----------

const withQueue = (item) => ({ ...item, queued: kiosk.isQueuedOverride(item.id) });

// ?view=pending (default) or ?view=reviewed
app.get('/api/moderation', requireTeacher, (req, res) => {
  res.json({ items: listModeration(req.query.view).map(withQueue), summary: moderationSummary() });
});

app.post('/api/moderation/:id/keep', requireTeacher, (req, res) => {
  const id = Number(req.params.id);
  if (!kiosk.keepBlocked(id, req.teacher.id)) return res.status(409).json({ error: 'This request was already reviewed.' });
  logEvent('moderation_keep', { requestId: id, text: getModerationItem(id).recognized_text }, req.teacher.id);
  res.json({ item: withQueue(getModerationItem(id)) });
});

app.post('/api/moderation/:id/override', requireTeacher, (req, res) => {
  const id = Number(req.params.id);
  const outcome = kiosk.overrideRequest(id, req.teacher.id);
  if (!outcome) return res.status(409).json({ error: 'This request was already reviewed.' });
  logEvent('moderation_override', { requestId: id, text: getModerationItem(id).recognized_text, outcome }, req.teacher.id);
  res.json({ outcome, item: withQueue(getModerationItem(id)) });
});

// Try a phrase against the filter without sending anything to the kiosk.
// Uses the current session's rules unless a safety level is given.
app.post('/api/safety/check', requireTeacher, (req, res) => {
  const b = req.body ?? {};
  const session = kiosk.currentSession();
  const level = ['strict', 'standard', 'custom'].includes(b.safetyLevel) ? b.safetyLevel : (session?.safety_level ?? 'standard');
  const rules =
    level === session?.safety_level
      ? session
      : { safety_level: level, blocked_words: b.blockedWords ?? [], allowed_words: b.allowedWords ?? [] };
  res.json({ level, ...checkSafety(String(b.text ?? '').slice(0, 200), rules) });
});

// ---------- Activity Logs, Analytics, Reports ----------

const RANGES = ['today', '7d', '30d', 'all'];
const rangeOf = (q) => (RANGES.includes(q.range) ? q.range : '7d');
const pageOf = (q) => ({ limit: Math.min(100, Number(q.limit) || 30), offset: Math.max(0, Number(q.offset) || 0) });
const requestFilters = (q) => ({ range: rangeOf(q), status: q.status, q: q.q });

app.get('/api/logs/requests', requireTeacher, (req, res) => {
  res.json(insights.logRequests({ ...requestFilters(req.query), ...pageOf(req.query) }));
});

app.get('/api/logs/requests.csv', requireTeacher, (req, res) => {
  res.type('text/csv; charset=utf-8');
  res.attachment(`wishpix-requests-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(insights.requestsCsv(requestFilters(req.query)));
});

app.get('/api/logs/events', requireTeacher, (req, res) => {
  res.json(insights.logEvents({ range: rangeOf(req.query), group: req.query.group, ...pageOf(req.query) }));
});

app.get('/api/analytics', requireTeacher, (req, res) => {
  res.json(insights.stats({ range: rangeOf(req.query) }));
});

app.get('/api/sessions', requireTeacher, (_req, res) => res.json({ sessions: insights.sessionList() }));

app.get('/api/reports', requireTeacher, (_req, res) => res.json({ reports: insights.listReports() }));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
app.post('/api/reports', requireTeacher, (req, res) => {
  const { type, date, sessionId, from, to } = req.body ?? {};
  if (!insights.REPORT_TYPES.includes(type)) return res.status(400).json({ error: 'Choose a report type.' });
  if ([date, from, to].some((d) => d != null && d !== '' && !DATE.test(d))) return res.status(400).json({ error: 'Choose a valid date.' });
  if (type === 'session' && !sessionId) return res.status(400).json({ error: 'Choose a session.' });
  if (from && to && from > to) return res.status(400).json({ error: 'The start date must be before the end date.' });
  const report = insights.createReport(type, { date: date || undefined, sessionId: Number(sessionId) || undefined, from: from || null, to: to || null });
  if (!report) return res.status(404).json({ error: 'That session was not found.' });
  logEvent('report_create', { reportId: report.id, reportType: type }, req.teacher.id);
  res.json({ report });
});

app.get('/api/reports/:id', requireTeacher, (req, res) => {
  const report = insights.getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'That report was not found.' });
  res.json({ report });
});

app.delete('/api/reports/:id', requireTeacher, (req, res) => {
  if (!insights.deleteReport(Number(req.params.id))) return res.status(404).json({ error: 'That report was not found.' });
  res.json({ ok: true });
});

// ---------- Settings and account ----------

app.get('/api/settings', requireTeacher, (_req, res) => res.json({ settings: readSettings() }));

app.patch('/api/settings', requireTeacher, (req, res) => {
  const result = updateSettings(req.body);
  if (result.error) return res.status(400).json(result);
  if (result.changed.length) {
    logEvent('settings_change', { keys: result.changed }, req.teacher.id);
    kiosk.broadcast();
  }
  res.json({ settings: readSettings() });
});

app.post('/api/settings/test-sound', requireTeacher, (_req, res) => {
  kiosk.playSound('test');
  res.json({ ok: true });
});

app.patch('/api/me', requireTeacher, (req, res) => {
  const name = String(req.body?.displayName ?? '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Type your name.' });
  const teacher = updateDisplayName(req.teacher.id, name);
  logEvent('profile_change', {}, req.teacher.id);
  res.json({ teacher });
});

app.post('/api/me/password', requireTeacher, (req, res) => {
  const error = changePassword(req.teacher.id, String(req.body?.current ?? ''), String(req.body?.next ?? ''));
  if (error) return res.status(400).json({ error });
  logEvent('password_change', {}, req.teacher.id);
  res.json({ ok: true });
});

// ---------- Kiosk ----------

// The kiosk page asks for the QR code the children scan.
app.get('/api/kiosk/qr', async (_req, res) => {
  const url = kiosk.joinUrl(publicBase());
  if (!url) return res.json({ url: null, qr: null });
  res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 480 }) });
});

// Serve the built client when it exists (npm run build), so one port is enough.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// ---------- Live connection ----------

const server = http.createServer(app);
const io = new Server(server);
kiosk.attach(io);

// The kiosk screen runs on this laptop, so only local, non-tunnelled
// connections may act as the kiosk.
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const isLocalKiosk = (socket) => {
  const h = socket.handshake.headers;
  const forwarded = String(h['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const hops = [socket.handshake.address, ...forwarded];
  return hops.every((ip) => LOOPBACK.includes(ip)) && !h['cf-connecting-ip'] && !h['ngrok-trace-id'];
};

io.use((socket, next) => {
  const { role, token } = socket.handshake.auth ?? {};
  if (role === 'kiosk' && isLocalKiosk(socket)) return next();
  if (role === 'teacher' && teacherFromToken(token)) return next();
  if (role === 'child' && kiosk.isValidJoinToken(token)) return next();
  next(new Error(role === 'child' ? 'This QR code has expired. Scan the kiosk again.' : 'Not allowed'));
});

io.on('connection', (socket) => {
  const { role } = socket.handshake.auth;

  if (role === 'kiosk') {
    socket.join('kiosk');
    kiosk.kioskConnected(socket);
    socket.on('kiosk:wake', () => kiosk.wakeKiosk());
    socket.on('kiosk:next', (id) => kiosk.kioskNext(id));
    socket.on('disconnect', () => kiosk.kioskDisconnected(socket));
  }

  if (role === 'teacher') socket.join('teachers');

  if (role === 'child') {
    socket.join('children');
    socket.on('child:listening', (on) => kiosk.childListening(!!on));
    socket.on('child:prompt', (payload, ack) => {
      const error = kiosk.submitPrompt(payload ?? {});
      if (typeof ack === 'function') ack({ ok: !error, error });
    });
    socket.on('disconnect', () => kiosk.childLeft());
  }

  // Children only ever get the trimmed state that broadcast() sends them.
  if (role === 'child') kiosk.childJoined();
  else socket.emit('state', kiosk.publicState());
});

server.listen(PORT, () => {
  console.log(`WishPix server on http://localhost:${PORT}`);
  console.log(`Phones join through ${publicBase()}`);
});

// Picks the address phones on the same Wi-Fi can reach. Windows names
// VirtualBox adapters "Ethernet 2" etc., so its default 192.168.56.x range is
// skipped and Wi-Fi is preferred. Set LAN_IP in .env to override.
function lanAddress() {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, addrs]) => (addrs ?? []).map((a) => ({ name, ...a })))
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .filter((a) => !a.address.startsWith('169.254.') && !a.address.startsWith('192.168.56.'))
    .filter((a) => !/virtual|vbox|vethernet|hyper-v|vmware|wsl/i.test(a.name));
  const wifi = candidates.find((a) => /wi-?fi|wlan|wireless/i.test(a.name));
  return (wifi ?? candidates[0])?.address ?? 'localhost';
}
