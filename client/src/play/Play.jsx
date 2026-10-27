import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLive } from '../lib/live.js'
import { LangProvider, useT } from '../i18n/index.jsx'
import { Logo } from '../ui/Logo.jsx'
import { Stepper } from '../ui/Stepper.jsx'
import './play.css'

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
// What the child speaks in (picked on this page). Separate from the screen
// language, which the teacher sets in Settings.
const LANGS = [
  { id: 'en', label: 'English', code: 'en-US' },
  { id: 'fil', label: 'Filipino', code: 'fil-PH' },
  { id: 'tl', label: 'Taglish', code: 'fil-PH' }, // Filipino recognition also picks up English words
]
const BUSY_MODES = ['processing', 'generating', 'printing', 'preview']

// The page a child opens by scanning the kiosk QR code.
export default function Play() {
  const [params] = useSearchParams()
  const token = params.get('t')
  const live = useLive('child', token)
  return (
    <LangProvider lang={live.state?.language}>
      <PlayView token={token} {...live} />
    </LangProvider>
  )
}

function PlayView({ token, state, connected, error, socket }) {
  const t = useT()
  const [chosenLang, setLang] = useState(null)
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState(null)
  const [sent, setSent] = useState(false)
  const recRef = useRef(null)

  const canSpeak = !!Recognition && window.isSecureContext
  const mode = state?.mode
  const theme = state?.session?.theme && t(state.session.theme)
  const languages = LANGS.filter((l) => state?.session?.languages?.includes(l.label) ?? true)
  // Start in the screen language when the session allows it, else its first language.
  const preferred = chosenLang ?? (t.lang === 'fil' ? 'fil' : 'en')
  const lang = languages.some((l) => l.id === preferred) ? preferred : (languages[0]?.id ?? 'en')

  useEffect(() => () => recRef.current?.abort(), [])

  function startListening() {
    setMessage(null)
    setText('')
    const rec = new Recognition()
    rec.lang = LANGS.find((l) => l.id === lang).code
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(' '))
    rec.onerror = (e) => setMessage(e.error === 'not-allowed' ? t('Please allow the microphone, then try again.') : t("I didn't catch that. Try again!"))
    rec.onend = () => {
      setListening(false)
      socket.current?.emit('child:listening', false)
    }
    recRef.current = rec
    rec.start()
    setListening(true)
    socket.current?.emit('child:listening', true)
  }

  function send() {
    socket.current?.emit('child:prompt', { text, language: lang }, (res) => {
      if (res.ok) {
        setSent(true)
        setMessage(null)
      } else {
        setMessage(t.error(res.error))
      }
    })
  }

  function again() {
    setSent(false)
    setText('')
    setMessage(null)
  }

  if (!token) return <Shell><Notice title={t('Scan the kiosk')} text={t('Scan the QR code on the kiosk screen to start.')} /></Shell>
  if (error) return <Shell><Notice title={/ended/.test(error) ? t('All done!') : t('Oops!')} text={t.error(error)} /></Shell>
  if (!connected || !state) return <Shell><Notice title={t('Connecting…')} text={t('Finding the kiosk.')} spinner /></Shell>
  if (mode === 'waiting') return <Shell><Notice title={t('All done!')} text={t('The activity has ended. Thank you for playing!')} /></Shell>
  if (mode === 'paused') return <Shell><Notice title={t('Little break')} text={t('Your teacher paused the activity. Please wait.')} /></Shell>

  if (mode === 'blocked' && sent) {
    return (
      <Shell theme={theme}>
        <Notice title={t("Let's try another idea!")} text={t('Tell me about something happy, like a puppy or a rainbow.')} />
        <button className="p-btn" onClick={again}>{t('Try again')}</button>
      </Shell>
    )
  }

  if (mode === 'error' && sent) {
    return (
      <Shell theme={theme}>
        <Notice title={t('Oops!')} text={t("The picture got stuck. Let's try again.")} />
        <button className="p-btn" onClick={again}>{t('Try again')}</button>
      </Shell>
    )
  }

  if (BUSY_MODES.includes(mode)) {
    const title = mode === 'preview' ? (sent ? t('Your picture is ready!') : t('Almost your turn!')) : sent ? t('Look at the kiosk!') : t('Someone is making a picture')
    return (
      <Shell theme={theme}>
        <div className="p-progress">
          <p className="p-eyebrow">{sent ? t('Your picture') : t('Please wait')}</p>
          <h1>{title}</h1>
          {sent && state.current?.recognizedText && <p className="p-said">“{state.current.recognizedText}”</p>}
          <Stepper mode={mode} size="sm" />
        </div>
      </Shell>
    )
  }

  if (sent && mode === 'ready') {
    return (
      <Shell theme={theme}>
        <Notice title={t('That was fun!')} text={t('Want to make another picture?')} />
        <button className="p-btn" onClick={again}>{t('Make another')}</button>
      </Shell>
    )
  }

  // ready / listening: the main talk screen
  const kioskBusy = mode === 'listening' && !listening
  return (
    <Shell theme={theme}>
      {languages.length > 1 && (
        <div className="p-langs" role="radiogroup" aria-label={t('Language I will speak')}>
          {languages.map((l) => (
            <button key={l.id} role="radio" aria-checked={l.id === lang} className={l.id === lang ? 'is-active' : ''} onClick={() => setLang(l.id)} disabled={listening}>
              {t(l.label)}
            </button>
          ))}
        </div>
      )}

      {canSpeak ? (
        <>
          <button
            className={`p-mic ${listening ? 'is-listening' : ''}`}
            onClick={listening ? () => recRef.current?.stop() : startListening}
            disabled={kioskBusy}
            aria-label={listening ? t('Stop') : t('Tap to talk')}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <p className="p-hint">
            {listening ? t("I'm listening…") : kioskBusy ? t('Someone else is talking…') : t('Tap and say what you want to see')}
          </p>
        </>
      ) : (
        <p className="p-hint p-hint--note">{t('Voice needs the secure (https) link. You can type instead.')}</p>
      )}

      <label className="p-said-box">
        <span>{text ? t('I heard') : t('Or type it here')}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === 'en' ? 'e.g. a happy cat' : 'hal. masayang pusa'} rows={2} maxLength={200} />
      </label>

      <button className="p-btn" onClick={send} disabled={!text.trim() || listening || kioskBusy}>
        {t('Send to kiosk')}
      </button>
      {message && <p className="p-message" role="alert">{message}</p>}
    </Shell>
  )
}

function Shell({ theme, children }) {
  const t = useT()
  return (
    <div className="p">
      <p className="p-tagline">{t('Small voices. Big imagination.')}</p>
      <Logo size={34} />
      <main className="p-card">
        {theme && <span className="p-chip">{t('Today:')} {theme}</span>}
        {children}
      </main>
    </div>
  )
}

function Notice({ title, text, spinner }) {
  return (
    <div className="p-notice">
      {spinner && <div className="p-spinner" />}
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  )
}
