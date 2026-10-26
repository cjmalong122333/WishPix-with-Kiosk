import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLive } from '../lib/live.js'
import { Logo } from '../ui/Logo.jsx'
import { Stepper } from '../ui/Stepper.jsx'
import './play.css'

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
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
  const { state, connected, error, socket } = useLive('child', token)
  const [chosenLang, setLang] = useState('en')
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState(null)
  const [sent, setSent] = useState(false)
  const recRef = useRef(null)

  const canSpeak = !!Recognition && window.isSecureContext
  const mode = state?.mode
  const languages = LANGS.filter((l) => state?.session?.languages?.includes(l.label) ?? true)
  // Fall back to the session's first language if the chosen one isn't allowed.
  const lang = languages.some((l) => l.id === chosenLang) ? chosenLang : (languages[0]?.id ?? 'en')

  useEffect(() => () => recRef.current?.abort(), [])

  function startListening() {
    setMessage(null)
    setText('')
    const rec = new Recognition()
    rec.lang = LANGS.find((l) => l.id === lang).code
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(' '))
    rec.onerror = (e) => setMessage(e.error === 'not-allowed' ? 'Please allow the microphone, then try again.' : "I didn't catch that. Try again!")
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
        setMessage(res.error)
      }
    })
  }

  function again() {
    setSent(false)
    setText('')
    setMessage(null)
  }

  if (!token) return <Shell><Notice title="Scan the kiosk" text="Scan the QR code on the kiosk screen to start." /></Shell>
  if (error) return <Shell><Notice title={/ended/.test(error) ? 'All done!' : 'Oops!'} text={error} /></Shell>
  if (!connected || !state) return <Shell><Notice title="Connecting…" text="Finding the kiosk." spinner /></Shell>
  if (mode === 'waiting') return <Shell><Notice title="All done!" text="The activity has ended. Thank you for playing!" /></Shell>
  if (mode === 'paused') return <Shell><Notice title="Little break" text="Your teacher paused the activity. Please wait." /></Shell>

  if (mode === 'blocked' && sent) {
    return (
      <Shell theme={state.session?.theme}>
        <Notice title="Let's try another idea!" text="Tell me about something happy, like a puppy or a rainbow." />
        <button className="p-btn" onClick={again}>Try again</button>
      </Shell>
    )
  }

  if (mode === 'error' && sent) {
    return (
      <Shell theme={state.session?.theme}>
        <Notice title="Oops!" text="The picture got stuck. Let's try again." />
        <button className="p-btn" onClick={again}>Try again</button>
      </Shell>
    )
  }

  if (BUSY_MODES.includes(mode)) {
    return (
      <Shell theme={state.session?.theme}>
        <div className="p-progress">
          <p className="p-eyebrow">{sent ? 'Your picture' : 'Please wait'}</p>
          <h1>{mode === 'preview' ? (sent ? 'Your picture is ready!' : 'Almost your turn!') : sent ? 'Look at the kiosk!' : 'Someone is making a picture'}</h1>
          {sent && state.current?.recognizedText && <p className="p-said">“{state.current.recognizedText}”</p>}
          <Stepper mode={mode} size="sm" />
        </div>
      </Shell>
    )
  }

  if (sent && mode === 'ready') {
    return (
      <Shell theme={state.session?.theme}>
        <Notice title="That was fun!" text="Want to make another picture?" />
        <button className="p-btn" onClick={again}>Make another</button>
      </Shell>
    )
  }

  // ready / listening: the main talk screen
  const kioskBusy = mode === 'listening' && !listening
  return (
    <Shell theme={state.session?.theme}>
      {languages.length > 1 && (
        <div className="p-langs" role="radiogroup" aria-label="Language">
          {languages.map((l) => (
            <button key={l.id} role="radio" aria-checked={l.id === lang} className={l.id === lang ? 'is-active' : ''} onClick={() => setLang(l.id)} disabled={listening}>
              {l.label}
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
            aria-label={listening ? 'Stop' : 'Tap to talk'}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <p className="p-hint">
            {listening ? (lang === 'fil' ? 'Nakikinig ako…' : "I'm listening…") : kioskBusy ? 'Someone else is talking…' : lang === 'fil' ? 'Pindutin at magsalita' : 'Tap and say what you want to see'}
          </p>
        </>
      ) : (
        <p className="p-hint p-hint--note">Voice needs the secure (https) link. You can type instead.</p>
      )}

      <label className="p-said-box">
        <span>{text ? 'I heard' : 'Or type it here'}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === 'fil' ? 'hal. masayang pusa' : 'e.g. a happy cat'} rows={2} maxLength={200} />
      </label>

      <button className="p-btn" onClick={send} disabled={!text.trim() || listening || kioskBusy}>
        Send to kiosk
      </button>
      {message && <p className="p-message" role="alert">{message}</p>}
    </Shell>
  )
}

function Shell({ theme, children }) {
  return (
    <div className="p">
      <p className="p-tagline">Small voices. Big imagination.</p>
      <Logo size={34} />
      <main className="p-card">
        {theme && <span className="p-chip">Today: {theme}</span>}
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
