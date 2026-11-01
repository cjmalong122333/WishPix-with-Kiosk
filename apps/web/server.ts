import 'dotenv/config';
import http from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server } from 'socket.io';
import { bus, isLoopback, REMOTE_HEADER, ROOM } from './src/server/realtime.js';
import { readCookie, verifyToken } from './src/server/auth-token.js';

// WishPix server: Next.js (kiosk screen, Teacher App, API routes) plus the
// Socket.IO live connection, on one port. The kiosk logic itself runs inside
// the Next.js route handlers; this file only moves messages.

// `npm run dev` passes --dev; anything else is production.
const dev = process.argv.includes('--dev');
Object.assign(process.env, { NODE_ENV: dev ? 'development' : 'production' });
const portArg = process.argv.indexOf('--port');
const port = Number(portArg > 0 ? process.argv[portArg + 1] : process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const allowRemoteKiosk = /^(1|true|yes)$/i.test(process.env.KIOSK_ALLOW_REMOTE ?? '');

const app = next({ dev, hostname: 'localhost', port });
const handle = app.getRequestHandler();

await app.prepare();

const server = http.createServer((req, res) => {
  // Route handlers learn the caller's real address from this header; any
  // value the browser sent is thrown away.
  req.headers[REMOTE_HEADER] = req.socket.remoteAddress ?? '';
  handle(req, res, parse(req.url ?? '/', true));
});

const io = new Server(server, { serveClient: false });
bus.io = io;

// The kiosk screen runs on the same Raspberry Pi, so only local,
// non-tunnelled connections may act as the kiosk.
function isLocalKiosk(headers: http.IncomingHttpHeaders, address: string) {
  if (allowRemoteKiosk) return true;
  return isLoopback(address) && !headers['x-forwarded-for'] && !headers['cf-connecting-ip'] && !headers['ngrok-trace-id'];
}

io.use(async (socket, nextFn) => {
  const role = socket.handshake.auth?.role;
  const { headers, address } = socket.handshake;
  if (role === 'kiosk' && isLocalKiosk(headers, address)) return nextFn();
  if (role === 'teacher' && (await verifyToken(readCookie(headers.cookie)))) return nextFn();
  nextFn(new Error('Not allowed'));
});

io.on('connection', (socket) => {
  const role = socket.handshake.auth.role as 'kiosk' | 'teacher';
  if (role === 'kiosk') {
    socket.join(ROOM.kiosk);
    bus.kioskSockets.add(socket.id);
    bus.hooks.kioskConnected?.();
    socket.on('disconnect', () => {
      bus.kioskSockets.delete(socket.id);
      bus.hooks.kioskDisconnected?.();
    });
  } else {
    socket.join(ROOM.teachers);
  }
  // Each screen loads the full state over HTTP right after connecting.
  socket.emit('hello');
});

server.listen(port, host, () => {
  console.log(`WishPix ${dev ? 'development' : 'production'} server on http://localhost:${port}`);
  console.log(`  Kiosk screen: http://localhost:${port}/kiosk`);
  console.log(`  Teacher App:  http://<this-device-ip>:${port}/teacher`);
});

// Wake the kiosk runtime (restores a running session, starts the printer
// polling) without waiting for the first page load.
fetch(`http://127.0.0.1:${port}/api/health`).catch(() => {});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
