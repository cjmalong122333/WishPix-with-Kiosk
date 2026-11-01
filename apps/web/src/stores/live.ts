'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { KioskState } from '@/lib/types';
import { api } from '@/lib/api';

// The live kiosk state (Zustand), kept up to date over Socket.IO. The kiosk
// screen and the Teacher App each open one connection.

export type Role = 'kiosk' | 'teacher';
type KioskOnly = { speech?: { server: boolean } };

type LiveStore = {
  state: (KioskState & KioskOnly) | null;
  connected: boolean;
  error: string | null;
  socket: Socket | null;
  setState: (state: KioskState & KioskOnly) => void;
};

export const useLiveStore = create<LiveStore>((set) => ({
  state: null,
  connected: false,
  error: null,
  socket: null,
  setState: (state) => set((s) => ({ state: { ...s.state, ...state } })),
}));

const STATE_URL: Record<Role, string> = { kiosk: '/api/device/state', teacher: '/api/state' };

// Opens the connection while the calling component is mounted.
export function useLiveConnection(role: Role, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const socket = io({ auth: { role }, transports: ['websocket', 'polling'] });
    const load = () =>
      api<KioskState & KioskOnly>(STATE_URL[role])
        .then((state) => useLiveStore.getState().setState(state))
        .catch((err: Error) => useLiveStore.setState({ error: err.message }));
    useLiveStore.setState({ socket });
    socket.on('connect', () => useLiveStore.setState({ connected: true, error: null }));
    socket.on('hello', load);
    socket.on('disconnect', () => useLiveStore.setState({ connected: false }));
    socket.on('connect_error', (err) => useLiveStore.setState({ connected: false, error: err.message }));
    socket.on('state', (state: KioskState) => useLiveStore.getState().setState(state));
    return () => {
      socket.disconnect();
      useLiveStore.setState({ socket: null, connected: false, state: null });
    };
  }, [role, enabled]);
}
