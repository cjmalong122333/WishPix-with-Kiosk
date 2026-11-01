// Small chimes for the kiosk, made with the Web Audio API (no sound files).
// Browsers keep a page silent until it has been touched once, so the kiosk
// calls unlockSound() on the first tap.

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());

// Notes as [frequency Hz, start s, length s, wave].
const SOUNDS: Record<string, [number, number, number, OscillatorType?][]> = {
  listening: [[660, 0, 0.12], [880, 0.1, 0.16]],
  heard: [[784, 0, 0.1], [988, 0.1, 0.14]],
  generating: [[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.2]],
  printing: [0, 0.14, 0.28, 0.42, 0.56].map((s): [number, number, number, OscillatorType] => [196, s, 0.07, 'square']),
  preview: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.4]],
  blocked: [[440, 0, 0.18], [349, 0.17, 0.3]],
  test: [[784, 0, 0.12], [1047, 0.12, 0.3]],
}

export const soundReady = () => ctx?.state === 'running'

export function unlockSound() {
  return audio().resume().then(soundReady).catch(() => false)
}

// volume: 0–100 from Settings.
export function playSound(name: string, volume: number) {
  const notes = SOUNDS[name]
  if (!notes || !volume) return
  const c = audio()
  if (c.state !== 'running') return
  const peak = 0.25 * (volume / 100)
  for (const [freq, start, length, wave = 'sine'] of notes) {
    const at = c.currentTime + start
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = wave
    osc.frequency.value = freq
    // Quick fade in and out, so notes don't click.
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(wave === 'square' ? peak * 0.3 : peak, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(gain).connect(c.destination)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}
