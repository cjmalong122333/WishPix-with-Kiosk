import type { Server } from 'socket.io';

// The live connection is shared between the custom server (server.ts, which
// owns Socket.IO) and the Next.js route handlers (which own the kiosk logic).
// They run in one process but load separate copies of modules, so the
// shared pieces live on globalThis.

type Hooks = {
  kioskConnected?: () => void;
  kioskDisconnected?: () => void;
  teachersChanged?: () => void;
};

// A Teacher App that is open right now (one per browser tab).
export type TeacherSocket = { teacherId: number; device: string; since: number };

type Bus = {
  io: Server | null;
  kioskSockets: Set<string>;
  teacherSockets: Map<string, TeacherSocket>;
  hooks: Hooks;
};

const g = globalThis as unknown as { __wishpixBus?: Bus };
export const bus: Bus = (g.__wishpixBus ??= { io: null, kioskSockets: new Set(), teacherSockets: new Map(), hooks: {} });
// A server started before teacherSockets existed (development hot reload).
bus.teacherSockets ??= new Map();

// A short, friendly name for the device a Teacher App runs on, from its
// browser's user agent. The kiosk shows it on the "Connected" screen.
export function deviceName(userAgent: string | undefined | null) {
  const ua = userAgent ?? '';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Windows/.test(ua)) return 'Windows computer';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux computer';
  return 'Web browser';
}

export const ROOM = { kiosk: 'kiosk', teachers: 'teachers' } as const;

// Header the custom server sets to the caller's real address (any value the
// browser sent is replaced), so route handlers can tell the kiosk apart.
export const REMOTE_HEADER = 'x-wishpix-remote';

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
export const isLoopback = (address?: string | null) => !!address && LOOPBACK.includes(address);
