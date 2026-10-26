// Dev-only fake kiosk states, for checking each screen without generating
// a picture: /kiosk?demo=preview&activity=trace_learn&sheet=letter
const SHEETS = {
  letter: { kind: 'letter', letter: 'C', word: 'cat' },
  number: { kind: 'number', count: 3, word: 'cat' },
  shape: { kind: 'shape', shape: 'circle', word: 'cat' },
  prewriting: { kind: 'prewriting', path: 'zigzag', word: 'cat' },
  word: { kind: 'word', word: 'pusa' },
}

export function demoState(params) {
  const mode = params.get('demo')
  if (!import.meta.env.DEV || !mode) return null
  const activity = params.get('activity') ?? 'color_create'
  const sheet = activity === 'trace_learn' ? SHEETS[params.get('sheet') ?? 'letter'] : null
  return {
    kioskName: 'Rainbow Room',
    kioskOnline: true,
    mode,
    session: mode === 'waiting' ? null : { id: 0, theme: 'Animals', activity_type: activity, languages: ['English', 'Filipino'] },
    current: ['ready', 'waiting', 'paused'].includes(mode)
      ? null
      : { id: 0, recognizedText: 'a happy cat', status: 'success', imageUrl: params.get('img') ?? '/images/request-2.jpg', sheet },
  }
}
