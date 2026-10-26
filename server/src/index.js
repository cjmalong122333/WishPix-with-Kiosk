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
import { login, logout, requireTeacher, teacherFromToken } from './auth.js';
import { activities, themes, findActivity } from './catalog.js';
import { checkInternet } from './image-gen.js';
import * as kiosk from './kiosk.js';

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

app.post('/api/login', (req, res) => {
  const result = login(String(req.body?.username ?? ''), String(req.body?.password ?? ''));
  if (!result) return res.status(401).json({ error: 'Incorrect username or password. Try again.' });
  res.json(result);
});

// ---------- Teacher ----------

app.post('/api/logout', requireTeacher, (req, res) => {
  logout(req.token);
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
app.post('/api/kiosk/restart', requireTeacher, (_req, res) => {
  kiosk.restartKiosk();
  res.json({ ok: true });
});

app.post('/api/sessions', requireTeacher, (req, res) => {
  const b = req.body ?? {};
  if (!findActivity(b.activityType, b.activitySubtype)) return res.status(400).json({ error: 'Choose an activity.' });
  if (!b.theme) return res.status(400).json({ error: 'Choose a theme.' });
  if (!['strict', 'standard', 'custom'].includes(b.safetyLevel)) return res.status(400).json({ error: 'Choose a safety level.' });
  if (!Array.isArray(b.languages) || b.languages.length === 0) return res.status(400).json({ error: 'Choose at least one language.' });
  res.json({ session: kiosk.startSession(req.teacher.id, b) });
});

app.post('/api/sessions/current/pause', requireTeacher, (_req, res) => {
  kiosk.pauseSession();
  res.json(kiosk.publicState());
});

app.post('/api/sessions/current/resume', requireTeacher, (_req, res) => {
  kiosk.resumeSession();
  res.json(kiosk.publicState());
});

app.post('/api/sessions/current/end', requireTeacher, (_req, res) => {
  kiosk.endSession();
  res.json(kiosk.publicState());
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
    socket.on('kiosk:printed', (id) => kiosk.kioskPrinted(id));
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
    socket.on('disconnect', () => kiosk.childListening(false));
  }

  // Children only ever get the trimmed state that broadcast() sends them.
  if (role === 'child') kiosk.broadcast();
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
