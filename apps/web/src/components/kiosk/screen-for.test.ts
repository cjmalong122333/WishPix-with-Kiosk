import { describe, expect, it } from 'vitest';
import { holdLeft, onTheWay, screenFor, type ScreenInput } from './screen-for';
import { buttonForKey } from './use-kiosk-buttons';

const base: ScreenInput = {
  link: 'online',
  mode: 'ready',
  teacherOpen: false,
  sessionEnded: false,
  started: false,
  talk: 'idle',
  printerStopped: false,
  printFailed: false,
};
const screen = (over: Partial<ScreenInput>) => screenFor({ ...base, ...over });

describe('screenFor', () => {
  it('shows the connection first', () => {
    expect(screen({ link: 'starting' })).toBe('starting');
    expect(screen({ mode: null })).toBe('starting');
    expect(screen({ link: 'offline', mode: 'generating' })).toBe('offline');
  });

  it('shows "Connected" while the Teacher App is open and no activity runs', () => {
    expect(screen({ mode: 'waiting' })).toBe('waiting');
    expect(screen({ mode: 'waiting', teacherOpen: true })).toBe('connected');
  });

  it('counts down after the teacher ends the session', () => {
    expect(screen({ mode: 'waiting', teacherOpen: true, sessionEnded: true })).toBe('ended');
  });

  it('starts each child on the activity screen, then the idea screen', () => {
    expect(screen({})).toBe('home');
    expect(screen({ started: true })).toBe('ready');
  });

  it('follows the talk button', () => {
    expect(screen({ talk: 'starting' })).toBe('listening');
    expect(screen({ mode: 'listening', talk: 'recording' })).toBe('listening');
    expect(screen({ mode: 'listening', talk: 'thinking' })).toBe('thinking');
    expect(screen({ mode: 'listening', talk: 'typing' })).toBe('typing');
    expect(screen({ mode: 'heard', started: true })).toBe('heard');
    // Holding the talk button on "Check your idea" records again.
    expect(screen({ mode: 'heard', talk: 'recording' })).toBe('listening');
  });

  it('follows the picture', () => {
    expect(screen({ mode: 'processing' })).toBe('creating');
    expect(screen({ mode: 'generating' })).toBe('creating');
    expect(screen({ mode: 'printing' })).toBe('printing');
    expect(screen({ mode: 'preview' })).toBe('done');
    expect(screen({ mode: 'blocked' })).toBe('blocked');
    expect(screen({ mode: 'error' })).toBe('error');
    expect(screen({ mode: 'paused' })).toBe('paused');
  });

  it('asks for a teacher when the printer needs help', () => {
    expect(screen({ mode: 'preview', printFailed: true })).toBe('printer');
    expect(screen({ printerStopped: true })).toBe('printer');
    expect(screen({ printerStopped: true, started: true })).toBe('printer');
    // A child already talking finishes first.
    expect(screen({ mode: 'heard', printerStopped: true })).toBe('heard');
  });
});

describe('buttonForKey', () => {
  it('maps the three kiosk buttons', () => {
    expect(buttonForKey('Enter')).toBe('yes');
    expect(buttonForKey('NumpadEnter')).toBe('yes');
    expect(buttonForKey('Escape')).toBe('no');
    expect(buttonForKey('Space')).toBe('talk');
    expect(buttonForKey('KeyA')).toBeNull();
  });
});

describe('holdLeft / onTheWay', () => {
  it('keeps "Let me think…" and "Creating…" up for 1.5 s', () => {
    expect(holdLeft('thinking', 200)).toBe(1300);
    expect(holdLeft('thinking', 5000)).toBe(0);
    expect(holdLeft('creating', 0)).toBe(1500);
  });

  it('waits after a teacher connects or a session starts', () => {
    // However long "Waiting for Teacher…" has been up.
    expect(holdLeft('waiting', 60_000)).toBe(1500);
    expect(holdLeft('connected', 60_000)).toBe(1500);
    expect(holdLeft('connected', 0)).toBe(2000);
    expect(holdLeft('starting', 500)).toBe(1500);
  });

  it('lets the other screens change at once', () => {
    expect(holdLeft('heard', 0)).toBe(0);
    expect(holdLeft('ready', 0)).toBe(0);
    expect(holdLeft('blocked', 0)).toBe(0);
  });

  it('shows "Creating…" before an idea that is blocked at once', () => {
    expect(onTheWay('heard', 'blocked')).toBe('creating');
    expect(onTheWay('heard', 'error')).toBe('creating');
    expect(onTheWay('listening', 'heard')).toBe('thinking');
    expect(onTheWay('heard', 'ready')).toBeNull(); // Try again
    expect(onTheWay('creating', 'blocked')).toBeNull();
  });
});
