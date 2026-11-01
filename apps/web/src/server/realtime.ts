import type { Server } from 'socket.io';

// The live connection is shared between the custom server (server.ts, which
// owns Socket.IO) and the Next.js route handlers (which own the kiosk logic).
// They run in one process but load separate copies of modules, so the
// shared pieces live on globalThis.

type Hooks = {
  kioskConnected?: () => void;
  kioskDisconnected?: () => void;
};

type Bus = {
  io: Server | null;
  kioskSockets: Set<string>;
  hooks: Hooks;
};

const g = globalThis as unknown as { __wishpixBus?: Bus };
export const bus: Bus = (g.__wishpixBus ??= { io: null, kioskSockets: new Set(), hooks: {} });

export const ROOM = { kiosk: 'kiosk', teachers: 'teachers' } as const;

// Header the custom server sets to the caller's real address (any value the
// browser sent is replaced), so route handlers can tell the kiosk apart.
export const REMOTE_HEADER = 'x-wishpix-remote';

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
export const isLoopback = (address?: string | null) => !!address && LOOPBACK.includes(address);
