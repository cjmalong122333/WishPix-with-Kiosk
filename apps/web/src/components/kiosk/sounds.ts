import { useSyncExternalStore } from 'react';

// Small chimes for the kiosk, made with the Web Audio API (no sound files).
// A browser keeps a page silent until someone has pressed a key (not Escape,
// the No button) or clicked on it once, so the kiosk calls unlockSound() on
// every button press. The Pi's Chromium is started with
// --autoplay-policy=no-user-gesture-required (deploy/kiosk/chromium-kiosk.sh),
// so there sound works from the start.

let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    ctx.addEventListener('statechange', changed);
    changed();
  }
  return ctx;
}

// Notes as [frequency Hz, start s, length s, wave].
const SOUNDS: Record<string, [number, number, number, OscillatorType?][]> = {
  listening: [[660, 0, 0.12], [880, 0.1, 0.16]],
  heard: [[784, 0, 0.1], [988, 0.1, 0.14]],
  generating: [[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.2]],
  printing: [0, 0.14, 0.28, 0.42, 0.56].map((s): [number, number, number, OscillatorType] => [196, s, 0.07, 'square']),
  preview: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.4]],
  blocked: [[440, 0, 0.18], [349, 0.17, 0.3]],
  test: [[784, 0, 0.12], [1047, 0.12, 0.3]],
};

// True when the browser lets this page play sound.
export const soundReady = () => ctx?.state === 'running';

export function unlockSound() {
  return audio()
    .resume()
    .then(soundReady)
    .catch(() => false)
    .finally(changed);
}

// soundReady() as React state, for the "Sound on" label in the kiosk header.
export function useSoundReady() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    soundReady,
    () => false
  );
}

// What happened to a sound: played, or why not (also the answer to "Test
// sound" in the Teacher App's Settings).
export type SoundResult = { played: true } | { played: false; reason: 'muted' | 'blocked' | 'unknown' };

// volume: 0–100 from Settings.
export function playSound(name: string, volume: number): SoundResult {
  const notes = SOUNDS[name];
  if (!notes) return { played: false, reason: 'unknown' };
  if (!volume) return { played: false, reason: 'muted' };
  const c = audio();
  if (c.state !== 'running') return { played: false, reason: 'blocked' };
  const peak = 0.25 * (volume / 100);
  for (const [freq, start, length, wave = 'sine'] of notes) {
    const at = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    // Quick fade in and out, so notes don't click.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(wave === 'square' ? peak * 0.3 : peak, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
  return { played: true };
}
