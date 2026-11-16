import type { KioskMode } from '@/lib/types';

// Which kiosk screen to show. The server's kiosk mode decides most of it;
// a few screens exist only on the kiosk (the activity's start screen, the
// "Session ended" countdown, a lost connection, a child still holding the
// talk button). The screens follow the kiosk design in docs/design/kiosk
// (frame numbers in brackets); the ones marked "new" have no frame and use
// the same style.

export type ScreenId =
  | 'starting' // [01] connecting to the server
  | 'offline' // [11A] the connection to the server was lost
  | 'waiting' // [02] no activity, Teacher App closed
  | 'connected' // [02B] no activity, Teacher App open
  | 'ended' // [12] the teacher just ended the session
  | 'paused' // new: the teacher paused the activity
  | 'home' // [03A-C] the activity's start screen
  | 'ready' // [04] tell Pixi your idea
  | 'listening' // [05] talk button held down
  | 'thinking' // new: turning the recording into text
  | 'typing' // new: no speech recognition, a teacher types
  | 'heard' // [06] check your idea
  | 'creating' // [07] safety checks and drawing
  | 'printing' // [08] picture ready, worksheet printing
  | 'done' // [09] worksheet ready
  | 'printer' // [11B] the printer needs paper (or other help)
  | 'blocked' // new: the safety check stopped the idea
  | 'teacher_print' // new: a file a teacher sent is printing (Print to Kiosk)
  | 'error'; // [11C] the picture could not be made

// What the kiosk is doing locally with the talk button.
export type TalkStep = 'idle' | 'starting' | 'recording' | 'thinking' | 'typing';

export type ScreenInput = {
  link: 'starting' | 'online' | 'offline';
  mode: KioskMode | null; // null until the first state arrives
  teacherOpen: boolean;
  sessionEnded: boolean; // the "Session ended" countdown is running
  started: boolean; // the child pressed Yes on the start screen
  talk: TalkStep;
  printerStopped: boolean; // the printer can't print until a teacher helps
  printFailed: boolean; // this child's worksheet did not print
};

// Printer problems that stop the kiosk until a teacher fixes them. Others
// (printer switched off, service not running) still let children make
// pictures; the teacher reprints them later from Print Management.
export const STOPPING_PROBLEMS = ['no_paper', 'jam', 'no_ink'];

export function screenFor(s: ScreenInput): ScreenId {
  if (s.link === 'offline') return 'offline';
  if (s.link === 'starting' || !s.mode) return 'starting';
  if (s.sessionEnded) return 'ended';
  switch (s.mode) {
    case 'waiting':
      return s.teacherOpen ? 'connected' : 'waiting';
    case 'paused':
      return 'paused';
    case 'ready':
    case 'listening':
    case 'heard':
      if (s.talk === 'starting' || s.talk === 'recording') return 'listening';
      if (s.talk === 'thinking') return 'thinking';
      if (s.talk === 'typing') return 'typing';
      if (s.mode === 'heard') return 'heard';
      if (s.mode === 'listening') return 'listening';
      if (s.printerStopped) return 'printer';
      return s.started ? 'ready' : 'home';
    case 'processing':
    case 'generating':
      return 'creating';
    case 'printing':
      return 'printing';
    case 'preview':
      return s.printFailed ? 'printer' : 'done';
    case 'blocked':
      return 'blocked';
    case 'error':
      return 'error';
    case 'teacher_print':
      return 'teacher_print';
    default:
      return 'starting';
  }
}

// Screens where nobody is in the middle of a wish: a teacher's file may print
// now (Print to Kiosk). Not 'ready': a child pressed Yes there and may talk next.
export const QUIET_SCREENS: ScreenId[] = ['home', 'waiting', 'connected', 'paused'];

// Screens where the talk button starts a recording.
export const TALK_SCREENS: ScreenId[] = ['home', 'ready', 'heard'];

// Screens that stay a little longer, so the kiosk never flicks past them (ms).
// `shown`: the least time on screen. `after`: the least time between a
// change (a teacher connects, a session starts) and the next screen, however
// long this one has been up. The kiosk applies them in useHeldScreen()
// (kiosk.tsx).
export const HOLD: Partial<Record<ScreenId, { shown?: number; after?: number }>> = {
  starting: { shown: 2000 }, // "Hi! I'm Pixi!" while the kiosk connects
  waiting: { after: 1500 }, // "Waiting for Teacher…" until the Teacher App opens
  connected: { shown: 2000, after: 1500 }, // "Connected" until the session starts
  thinking: { shown: 1500 }, // "Let me think…" before "Here's what I heard"
  teacher_print: { shown: 1500 }, // "Printing teacher's file…", even for one quick page
  creating: { shown: 1500 }, // "Creating your picture…", even before "Let's try another idea!"
};

// How much longer (ms) `screen` stays, after showing for `shownFor` ms.
export function holdLeft(screen: ScreenId, shownFor: number): number {
  const hold = HOLD[screen];
  return Math.max((hold?.shown ?? 0) - shownFor, hold?.after ?? 0, 0);
}

// A screen the kiosk shows between `from` and `to`, even when the server is
// already past it: the word filter blocks an idea within a millisecond, but
// the child still sees "Creating your picture…" (for its HOLD) first.
export function onTheWay(from: ScreenId, to: ScreenId): ScreenId | null {
  if (from === 'heard' && (to === 'blocked' || to === 'error' || to === 'printing')) return 'creating';
  if (from === 'listening' && to === 'heard') return 'thinking';
  return null;
}
