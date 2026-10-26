import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLive } from '../lib/live.js'
import { demoState } from './demo.js'
import { Logo } from '../ui/Logo.jsx'
import { Stepper } from '../ui/Stepper.jsx'
import { Sheet } from './Sheet.jsx'
import { MicArt, MoonArt, PauseArt, PrinterArt, SparkArt, OopsArt, ThinkArt } from './art.jsx'
import './kiosk.css'

const PRINT_ANIMATION_MS = 4500
const PREVIEW_SECONDS = 30
const FLOW_MODES = ['listening', 'processing', 'generating', 'printing']

// Rotating lines while the free image service works (it can take a minute).
const GENERATING_LINES = [
  'Mixing the colors…',
  'Drawing the lines…',
  'Adding a little magic…',
  'Almost ready…',
  'Good pictures take a moment…',
]

// The kiosk screen. It only follows the live state from the server; the
// teacher and child pages are what change it.
export default function Kiosk() {
  const [params] = useSearchParams()
  const demo = demoState(params)
  const live = useLive(demo ? 'none' : 'kiosk')
  const { state, connected, error, socket } = demo ? { ...live, state: demo, connected: true, error: null } : live
  const [qr, setQr] = useState(null)
  const mode = state?.mode
  const current = state?.current
  const session = state?.session
  const sessionId = session?.id

  // Fetch the QR code for each new session, and again after reconnecting
  // in case the server restarted.
  useEffect(() => {
    if (!sessionId || !connected) { setQr(null); return }
    fetch('/api/kiosk/qr').then((r) => r.json()).then(setQr).catch(() => setQr(null))
  }, [sessionId, connected])

  // "Restart Kiosk" from the Teacher App reloads this screen.
  useEffect(() => {
    const s = socket.current
    if (!s) return
    const reload = () => window.location.reload()
    s.on('kiosk:reload', reload)
    return () => s.off('kiosk:reload', reload)
  }, [socket, connected])

  useEffect(() => {
    if (mode !== 'printing') return
    const t = setTimeout(() => socket.current?.emit('kiosk:printed', current.id), PRINT_ANIMATION_MS)
    return () => clearTimeout(t)
  }, [mode, current?.id, socket])

  const next = () => socket.current?.emit('kiosk:next', current?.id)

  let screen
  if (error) screen = <Message art={<OopsArt />} title="Kiosk can't connect" text={error} />
  else if (!connected || !state) screen = <Message art={<SparkArt />} title="Starting WishPix…" text="Connecting to the laptop server." />
  else screen = <ModeScreen mode={mode} session={session} current={current} qr={qr} onDone={next} />

  return (
    <div className={`k k--${mode ?? 'boot'} ${demo && params.has('still') ? 'k--still' : ''}`}>
      <header className="k__bar">
        <Logo size={36} />
        <div className="k__bar-right">
          {session && <span className="k__chip">Today: <b>{session.theme}</b></span>}
          <span className={`k__status ${connected ? 'is-on' : ''}`}>
            <i /> {state?.kioskName ?? 'Kiosk'} · {connected ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      <main className="k__stage" key={mode}>{screen}</main>

      <footer className={`k__foot ${FLOW_MODES.includes(mode) ? 'is-shown' : ''}`}>
        <Stepper mode={mode} />
      </footer>
    </div>
  )
}

function ModeScreen({ mode, session, current, qr, onDone }) {
  switch (mode) {
    case 'waiting':
      return <Message art={<MoonArt />} title="Waiting for teacher" text="Your teacher will start an activity soon." />
    case 'paused':
      return <Message art={<PauseArt />} title="Little break!" text="Your teacher paused the activity. We'll be back soon." />
    case 'ready':
      return <Ready session={session} qr={qr} />
    case 'listening':
      return <Message art={<MicArt listening />} title="I'm listening…" text="Say what you want to see!" />
    case 'processing':
      return <Heard text={current?.recognizedText} />
    case 'generating':
      return <Generating text={current?.recognizedText} />
    case 'printing':
      return <Printing current={current} session={session} />
    case 'preview':
      return <Preview current={current} session={session} onDone={onDone} />
    case 'blocked':
      return <Message art={<ThinkArt />} title="Let's try another idea!" text="Tell me about something happy, like a puppy or a rainbow." tone="soft" />
    case 'error':
      return <Message art={<OopsArt />} title="Oops! The picture got stuck." text="Let's try again in a moment." tone="soft" />
    default:
      return <Message art={<SparkArt />} title="WishPix" />
  }
}

function Message({ art, title, text, tone }) {
  return (
    <section className={`k-msg ${tone ? `k-msg--${tone}` : ''}`}>
      <div className="k-msg__art">{art}</div>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
    </section>
  )
}

function Ready({ session, qr }) {
  const steps = [
    { n: 1, title: 'Scan the code', text: 'Use the phone camera.' },
    { n: 2, title: 'Tap and talk', text: 'Say what you want to see.' },
    { n: 3, title: 'Get your picture', text: 'Watch it appear here!' },
  ]
  return (
    <section className="k-ready">
      <div className="k-ready__left">
        <p className="k-eyebrow">{activityLabel(session)}</p>
        <h1>Let's make a picture!</h1>
        <ol className="k-ready__steps">
          {steps.map((s) => (
            <li key={s.n}>
              <span>{s.n}</span>
              <div><b>{s.title}</b><small>{s.text}</small></div>
            </li>
          ))}
        </ol>
        <p className="k-ready__ideas">Ideas: {themeIdeas(session?.theme)}</p>
      </div>
      <div className="k-ready__qr">
        {qr?.qr ? <img src={qr.qr} alt="Scan to start" /> : <div className="k-ready__qr-wait" />}
        <b>Scan me!</b>
      </div>
    </section>
  )
}

function Heard({ text }) {
  return (
    <section className="k-msg">
      <p className="k-eyebrow">I heard</p>
      <div className="k-bubble">“{text}”</div>
      <p>Checking that it's a happy idea…</p>
    </section>
  )
}

function Generating({ text }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % GENERATING_LINES.length), 3500)
    return () => clearInterval(t)
  }, [])
  return (
    <section className="k-msg">
      <div className="k-msg__art"><SparkArt spinning /></div>
      <h1>Making your picture</h1>
      <div className="k-bubble k-bubble--sm">“{text}”</div>
      <p className="k-rotating" key={i}>{GENERATING_LINES[i]}</p>
    </section>
  )
}

function Printing({ current, session }) {
  return (
    <section className="k-print">
      <h1>Printing your picture…</h1>
      <div className="k-print__machine">
        <PrinterArt />
        <div className="k-print__slot">
          <div className="k-print__paper">
            <Sheet current={current} session={session} compact />
          </div>
        </div>
      </div>
    </section>
  )
}

function Preview({ current, session, onDone }) {
  const [left, setLeft] = useState(PREVIEW_SECONDS)
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (left <= 0) onDone() }, [left, onDone])

  return (
    <section className="k-preview">
      <div className="k-preview__sheet"><Sheet current={current} session={session} /></div>
      <div className="k-preview__side">
        <p className="k-eyebrow">Print preview</p>
        <h1>Here's your picture!</h1>
        <div className="k-bubble k-bubble--sm">“{current?.recognizedText}”</div>
        <button className="k-btn" onClick={onDone}>I'm done!</button>
        <p className="k-preview__timer">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" className="track" />
            <circle cx="18" cy="18" r="15" className="bar" style={{ strokeDashoffset: 94.2 * (1 - left / PREVIEW_SECONDS) }} />
          </svg>
          Next friend in {Math.max(left, 0)}s
        </p>
      </div>
    </section>
  )
}

const ACTIVITY_LABELS = { color_create: 'Color & Create', trace_learn: 'Trace & Learn', free_play: 'Free Play' }
const activityLabel = (s) => (s ? ACTIVITY_LABELS[s.activity_type] ?? '' : '')

const IDEAS = {
  Animals: 'a cat, a dog, a lion',
  Transportation: 'a car, a jeepney, an airplane',
  Fruits: 'an apple, a mango, a banana',
  'Community Helpers': 'a doctor, a teacher, a firefighter',
  Shapes: 'a circle, a square, a triangle',
  Colors: 'a red ball, a blue bird, a yellow sun',
  Nature: 'a tree, a flower, a butterfly',
}
const themeIdeas = (theme) => IDEAS[theme] ?? 'anything you like!'
