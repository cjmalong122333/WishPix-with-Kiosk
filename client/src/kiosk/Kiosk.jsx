import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLive } from '../lib/live.js'
import { LangProvider, useT } from '../i18n/index.jsx'
import { demoState } from './demo.js'
import { Logo } from '../ui/Logo.jsx'
import { Stepper } from '../ui/Stepper.jsx'
import { Sheet } from './Sheet.jsx'
import { MicArt, MoonArt, PauseArt, PrinterArt, SparkArt, OopsArt, ThinkArt } from './art.jsx'
import { playSound, soundReady, unlockSound } from './sounds.js'
import './kiosk.css'

const PREVIEW_SECONDS = 30
const FLOW_MODES = ['listening', 'processing', 'generating', 'printing']
// Kiosk modes that play a chime when the kiosk enters them.
const MODE_SOUNDS = ['listening', 'generating', 'printing', 'preview', 'blocked']

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
  const view = demo ? { ...live, state: demo, connected: true, error: null } : live
  return (
    <LangProvider lang={view.state?.prefs?.language}>
      <KioskView {...view} demo={demo} still={demo && params.has('still')} />
    </LangProvider>
  )
}

function KioskView({ state, connected, error, socket, demo, still }) {
  const t = useT()
  const [qr, setQr] = useState(null)
  const [soundOn, setSoundOn] = useState(soundReady)
  const mode = state?.mode
  const current = state?.current
  const session = state?.session
  const sessionId = session?.id
  const volume = state?.prefs?.volume ?? 0
  const volumeRef = useRef(volume)
  const lastMode = useRef(mode)
  useEffect(() => { volumeRef.current = volume }, [volume])

  // Fetch the QR code for each new session, and again after reconnecting
  // in case the server restarted.
  useEffect(() => {
    if (!sessionId || !connected) { setQr(null); return }
    fetch('/api/kiosk/qr').then((r) => r.json()).then(setQr).catch(() => setQr(null))
  }, [sessionId, connected])

  // "Restart Kiosk" reloads this screen; "Test sound" in Settings plays a chime.
  useEffect(() => {
    const s = socket.current
    if (!s) return
    const reload = () => window.location.reload()
    const sound = (name) => playSound(name, volumeRef.current)
    s.on('kiosk:reload', reload)
    s.on('kiosk:sound', sound)
    return () => { s.off('kiosk:reload', reload); s.off('kiosk:sound', sound) }
  }, [socket, connected])

  // The browser only allows sound after the screen has been touched once.
  useEffect(() => {
    if (soundOn) return
    const unlock = () => unlockSound().then((ok) => ok && setSoundOn(true))
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [soundOn])

  // A chime each time the kiosk moves on to a new step.
  const sleepingNow = state?.screen?.sleeping
  useEffect(() => {
    if (mode !== lastMode.current && MODE_SOUNDS.includes(mode) && !sleepingNow) playSound(mode, volumeRef.current)
    lastMode.current = mode
  }, [mode, sleepingNow])

  const next = () => socket.current?.emit('kiosk:next', current?.id)
  const wake = () => socket.current?.emit('kiosk:wake')
  const sleeping = !demo && connected && state?.screen?.sleeping

  let screen
  if (error) screen = <Message art={<OopsArt />} title={t("Kiosk can't connect")} text={t.error(error)} />
  else if (!connected || !state) screen = <Message art={<SparkArt />} title={t('Starting WishPix…')} text={t('Connecting to the laptop server.')} />
  else screen = <ModeScreen mode={mode} session={session} current={current} qr={qr} onDone={next} />

  return (
    <div
      className={`k k--${mode ?? 'boot'} ${still ? 'k--still' : ''}`}
      style={{ filter: state?.screen?.brightness < 100 ? `brightness(${state.screen.brightness}%)` : undefined }}
    >
      <header className="k__bar">
        <Logo size={36} />
        <div className="k__bar-right">
          {!demo && !soundOn && volume > 0 && <span className="k__chip k__chip--sound">🔈 {t('Touch the screen to turn on sounds')}</span>}
          {session && <span className="k__chip">{t('Today:')} <b>{t(session.theme)}</b></span>}
          <span className={`k__status ${connected ? 'is-on' : ''}`}>
            <i /> {state?.kioskName ?? t('Kiosk')} · {connected ? t('Online') : t('Offline')}
          </span>
        </div>
      </header>

      <main className="k__stage" key={mode}>{screen}</main>

      <footer className={`k__foot ${FLOW_MODES.includes(mode) ? 'is-shown' : ''}`}>
        <Stepper mode={mode} />
      </footer>

      {sleeping && (
        <button className="k-sleep" onClick={wake} aria-label={t('Wake the kiosk')}>
          <span className="k-sleep__art"><MoonArt /></span>
          <b>{t('Touch the screen to wake me up')}</b>
        </button>
      )}
    </div>
  )
}

function ModeScreen({ mode, session, current, qr, onDone }) {
  const t = useT()
  switch (mode) {
    case 'waiting':
      return <Message art={<MoonArt />} title={t('Waiting for teacher')} text={t('Your teacher will start an activity soon.')} />
    case 'paused':
      return <Message art={<PauseArt />} title={t('Little break!')} text={t("Your teacher paused the activity. We'll be back soon.")} />
    case 'ready':
      return <Ready session={session} qr={qr} />
    case 'listening':
      return <Message art={<MicArt listening />} title={t("I'm listening…")} text={t('Say what you want to see!')} />
    case 'processing':
      return <Heard text={current?.recognizedText} />
    case 'generating':
      return <Generating text={current?.recognizedText} override={current?.override} />
    case 'printing':
      return <Printing current={current} session={session} />
    case 'preview':
      return <Preview current={current} session={session} onDone={onDone} />
    case 'blocked':
      return <Message art={<ThinkArt />} title={t("Let's try another idea!")} text={t('Tell me about something happy, like a puppy or a rainbow.')} tone="soft" />
    case 'error':
      return <Message art={<OopsArt />} title={t('Oops! The picture got stuck.')} text={t("Let's try again in a moment.")} tone="soft" />
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
  const t = useT()
  const steps = [
    { n: 1, title: t('Scan the code'), text: t('Use the phone camera.') },
    { n: 2, title: t('Tap and talk'), text: t('Say what you want to see.') },
    { n: 3, title: t('Get your picture'), text: t('Watch it appear here!') },
  ]
  return (
    <section className="k-ready">
      <div className="k-ready__left">
        <p className="k-eyebrow">{t(ACTIVITY_LABELS[session?.activity_type] ?? '')}</p>
        <h1>{t("Let's make a picture!")}</h1>
        <ol className="k-ready__steps">
          {steps.map((s) => (
            <li key={s.n}>
              <span>{s.n}</span>
              <div><b>{s.title}</b><small>{s.text}</small></div>
            </li>
          ))}
        </ol>
        <p className="k-ready__ideas">{t('Ideas: {list}', { list: t(IDEAS[session?.theme] ?? 'anything you like!') })}</p>
      </div>
      <div className="k-ready__qr">
        {qr?.qr ? <img src={qr.qr} alt={t('Scan to start')} /> : <div className="k-ready__qr-wait" />}
        <b>{t('Scan me!')}</b>
      </div>
    </section>
  )
}

function Heard({ text }) {
  const t = useT()
  return (
    <section className="k-msg">
      <p className="k-eyebrow">{t('I heard')}</p>
      <div className="k-bubble">“{text}”</div>
      <p>{t("Checking that it's a happy idea…")}</p>
    </section>
  )
}

function Generating({ text, override }) {
  const t = useT()
  const [i, setI] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % GENERATING_LINES.length), 3500)
    return () => clearInterval(timer)
  }, [])
  return (
    <section className="k-msg">
      <div className="k-msg__art"><SparkArt spinning /></div>
      {override && <p className="k-eyebrow">{t('Your teacher said yes!')}</p>}
      <h1>{t('Making your picture')}</h1>
      <div className="k-bubble k-bubble--sm">“{text}”</div>
      <p className="k-rotating" key={i}>{t(GENERATING_LINES[i])}</p>
    </section>
  )
}

function Printing({ current, session }) {
  const t = useT()
  return (
    <section className="k-print">
      <h1>{t('Printing your picture…')}</h1>
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
  const t = useT()
  const [left, setLeft] = useState(PREVIEW_SECONDS)
  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => { if (left <= 0) onDone() }, [left, onDone])

  return (
    <section className="k-preview">
      <div className="k-preview__sheet"><Sheet current={current} session={session} /></div>
      <div className="k-preview__side">
        <p className="k-eyebrow">{t('Print preview')}</p>
        <h1>{t("Here's your picture!")}</h1>
        <div className="k-bubble k-bubble--sm">“{current?.recognizedText}”</div>
        {current?.printProblem && (
          <p className="k-preview__problem">{t('The printer needs a little help. Your teacher will print your picture soon!')}</p>
        )}
        <button className="k-btn" onClick={onDone}>{t("I'm done!")}</button>
        <p className="k-preview__timer">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" className="track" />
            <circle cx="18" cy="18" r="15" className="bar" style={{ strokeDashoffset: 94.2 * (1 - left / PREVIEW_SECONDS) }} />
          </svg>
          {t('Next friend in {n}s', { n: Math.max(left, 0) })}
        </p>
      </div>
    </section>
  )
}

const ACTIVITY_LABELS = { color_create: 'Color & Create', trace_learn: 'Trace & Learn', free_play: 'Free Play' }

const IDEAS = {
  Animals: 'a cat, a dog, a lion',
  Transportation: 'a car, a jeepney, an airplane',
  Fruits: 'an apple, a mango, a banana',
  'Community Helpers': 'a doctor, a teacher, a firefighter',
  Shapes: 'a circle, a square, a triangle',
  Colors: 'a red ball, a blue bird, a yellow sun',
  Nature: 'a tree, a flower, a butterfly',
}
