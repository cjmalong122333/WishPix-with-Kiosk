'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Kiosk, type KioskDemo } from '@/components/kiosk/kiosk';
import type { ScreenId } from '@/components/kiosk/screen-for';
import type { KioskMode, KioskState } from '@/lib/types';

export function KioskScreen() {
  return (
    <Suspense>
      <WithDemo />
    </Suspense>
  );
}

function WithDemo() {
  const params = useSearchParams();
  return <Kiosk demo={demoFor(params)} />;
}

// Development only: any kiosk screen without a session or a picture, e.g.
//   /kiosk?screen=home&activity=trace_learn&lang=fil
//   /kiosk?screen=printing&activity=trace_learn&mode=trace_word   (mode: trace_word | trace_image)
//   /kiosk?screen=printing&img=/favicon.svg
//   /kiosk?screen=printer&problem=jam
//   /kiosk?screen=ready&message=1   (the "I didn't hear anything" note)
//   /kiosk?screen=listening&getready=1   ("Get ready…" before the microphone opens)
//   /kiosk?screen=teacher_print   ("Printing teacher's file…")
//   /kiosk?screen=home&color=blue   (Kiosk Color: auto, purple, green, blue, orange, pink)
// The screen stays put: buttons do nothing here and nothing is sent to the
// server. The printed-page preview is drawn roughly (there is no real page).
const SCREENS: Record<ScreenId, KioskMode> = {
  starting: 'waiting',
  offline: 'ready',
  waiting: 'waiting',
  connected: 'waiting',
  ended: 'waiting',
  paused: 'paused',
  home: 'ready',
  ready: 'ready',
  listening: 'listening',
  thinking: 'listening',
  typing: 'listening',
  heard: 'heard',
  creating: 'generating',
  printing: 'printing',
  done: 'preview',
  printer: 'preview',
  blocked: 'blocked',
  error: 'error',
  teacher_print: 'teacher_print',
};

function demoFor(params: URLSearchParams): KioskDemo | null {
  const screen = params.get('screen') as ScreenId | null;
  if (process.env.NODE_ENV === 'production' || !screen || !(screen in SCREENS)) return null;
  const mode = SCREENS[screen];
  const activity = params.get('activity') ?? 'color_create';
  const subtype = activity === 'trace_learn' ? (params.get('mode') ?? 'trace_image') : 'coloring_page';
  const kind = subtype === 'trace_word' ? 'trace_word' : subtype === 'trace_image' ? 'trace_image' : 'coloring';
  const problem = screen === 'printer' ? (params.get('problem') ?? 'no_paper') : null;
  const state: KioskState = {
    kioskName: 'Rainbow Room',
    kioskOnline: true,
    mode,
    session:
      mode === 'waiting' || mode === 'teacher_print'
        ? null
        : {
            id: 0,
            theme: params.get('theme') ?? 'Free Expression',
            activity_type: activity,
            activity_subtype: subtype,
            safety_level: 'standard',
            languages: ['English', 'Filipino'],
            blocked_words: [],
            allowed_words: [],
            status: mode === 'paused' ? 'paused' : 'active',
            started_at: new Date().toISOString(),
          },
    current: ['ready', 'waiting', 'paused', 'listening', 'teacher_print'].includes(mode)
      ? null
      : {
          id: 0,
          queueNumber: 1,
          recognizedText: params.get('wish') ?? 'big red dinosaur',
          language: 'en',
          status: 'success',
          imageUrl: kind === 'trace_word' ? null : (params.get('img') ?? '/favicon.svg'),
          sheet: { kind, en: 'dinosaur', fil: 'dinosauro' },
          label: { en: 'Big red dinosaur', fil: 'Malaking pulang dinosauro' },
          printProblem: problem ? 'Out of paper' : null,
        },
    teacherPrint: { pending: 0, printing: mode === 'teacher_print' ? { id: 1, done: 1, total: 3 } : null },
    pendingModeration: 0,
    screen: { sleeping: params.get('sleep') === '1', brightness: 100 },
    printer: {
      reachable: true,
      mode: 'mock',
      printerName: 'Simulated printer',
      format: '4x6',
      paper: problem === 'no_paper' ? 0 : 20,
      capacity: 20,
      ink: 100,
      problem,
      problemText: null,
      lowPaper: false,
      lowInk: false,
      printing: null,
      queue: [],
    },
    teacher: screen === 'connected' ? { name: 'Teacher Ana', device: 'iPad' } : null,
    prefs: {
      language: (params.get('lang') as 'en' | 'fil') ?? 'en',
      volume: 60,
      themeColor: 'deep_blue',
      kioskColor: params.get('color') ?? 'auto',
      autoLogout: false,
      autoLogoutMinutes: 30,
    },
  };
  return {
    state,
    screen,
    message: params.get('message') ? "I didn't hear anything. Try again!" : undefined,
    getReady: params.get('getready') === '1',
  };
}
