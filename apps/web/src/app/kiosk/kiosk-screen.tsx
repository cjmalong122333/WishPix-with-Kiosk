'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Kiosk } from '@/components/kiosk/kiosk';
import type { KioskState } from '@/lib/types';

export function KioskScreen() {
  return (
    <Suspense>
      <WithDemo />
    </Suspense>
  );
}

function WithDemo() {
  const params = useSearchParams();
  return <Kiosk demo={demoState(params)} />;
}

// Development only: fake kiosk states, to check each screen without making
// a picture, e.g. /kiosk?demo=preview&activity=trace_learn&sheet=letter
const SHEETS = {
  letter: { kind: 'letter', letter: 'C', word: 'cat' },
  number: { kind: 'number', count: 3, word: 'cat' },
  shape: { kind: 'shape', shape: 'circle', word: 'cat' },
  prewriting: { kind: 'prewriting', path: 'zigzag', word: 'cat' },
  word: { kind: 'word', word: 'pusa' },
} as const;

function demoState(params: URLSearchParams): KioskState | null {
  const mode = params.get('demo');
  if (process.env.NODE_ENV === 'production' || !mode) return null;
  const activity = params.get('activity') ?? 'color_create';
  const sheet = activity === 'trace_learn' ? SHEETS[(params.get('sheet') ?? 'letter') as keyof typeof SHEETS] : null;
  return {
    kioskName: 'Rainbow Room',
    kioskOnline: true,
    mode: mode as KioskState['mode'],
    session:
      mode === 'waiting'
        ? null
        : {
            id: 0,
            theme: 'Animals',
            activity_type: activity,
            activity_subtype: 'letter',
            safety_level: 'standard',
            languages: ['English', 'Filipino'],
            blocked_words: [],
            allowed_words: [],
            status: 'active',
            started_at: new Date().toISOString(),
          },
    current: ['ready', 'waiting', 'paused'].includes(mode)
      ? null
      : {
          id: 0,
          queueNumber: 1,
          recognizedText: 'a happy cat',
          language: 'en',
          status: 'success',
          imageUrl: params.get('img') ?? '/favicon.svg',
          sheet,
          label: { en: 'Happy cat', fil: 'Masayang pusa' },
        },
    pendingModeration: 0,
    screen: { sleeping: false, brightness: 100 },
    printer: {
      reachable: true,
      mode: 'mock',
      printerName: 'Simulated printer',
      paper: 20,
      capacity: 20,
      ink: 100,
      problem: null,
      problemText: null,
      lowPaper: false,
      lowInk: false,
      printing: null,
      queue: [],
    },
    prefs: { language: (params.get('lang') as 'en' | 'fil') ?? 'en', volume: 0, themeColor: 'deep_blue', autoLogout: false, autoLogoutMinutes: 30 },
  };
}
