import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Check, Lock, User } from 'lucide-react'
import { api } from '../lib/live.js'
import { LogoMark } from '../ui/Logo.jsx'
import { useAuth } from './auth.jsx'
import { TeacherArt } from './TeacherArt.jsx'

// Splash spinner, shown briefly when the app opens.
export function Loader() {
  const { token } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    const t = setTimeout(() => navigate(token ? '/teacher/check' : '/teacher/login', { replace: true }), 900)
    return () => clearTimeout(t)
  }, [token, navigate])
  return (
    <div className="t-splash t-splash--center">
      <div className="t-ring" role="status" aria-label="Loading" />
    </div>
  )
}

function WelcomeShell({ children }) {
  return (
    <div className="t-splash">
      <p className="t-splash__tag">Local. Secure. Made for educators.</p>
      <div className="t-splash__art"><TeacherArt /></div>
      <h1 className="t-splash__title">Welcome to the WishPix Teacher App</h1>
      <p className="t-splash__sub">Small voices. Big imagination.</p>
      {children}
      <p className="t-splash__brand"><LogoMark size={20} /> WishPix</p>
    </div>
  )
}

export function Login() {
  const { token, signIn } = useAuth()
  const location = useLocation()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (token) return <Navigate to="/teacher/check" replace state={location.state} />

  async function submit(e) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await signIn(String(f.get('username')).trim(), String(f.get('password')))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <WelcomeShell>
      <form className="t-auth" onSubmit={submit} noValidate>
        <h2>Welcome back</h2>
        <p className="t-auth__lead">Sign in to run activities on your daycare kiosk.</p>
        <label className="t-auth__label" htmlFor="username">Username</label>
        <div className="t-auth__field">
          <User size={16} aria-hidden="true" />
          <input id="username" name="username" placeholder="Enter your username" autoComplete="username" required onChange={() => setError(null)} />
        </div>
        <label className="t-auth__label" htmlFor="password">Password</label>
        <div className="t-auth__field">
          <Lock size={16} aria-hidden="true" />
          <input id="password" name="password" type="password" placeholder="Enter your password" autoComplete="current-password" required onChange={() => setError(null)} />
        </div>
        {error && <p className="t-auth__error" role="alert">{error}</p>}
        <button className="t-auth__btn" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
        <p className="t-auth__help">Contact your System Administrator for credential recovery.</p>
      </form>
    </WelcomeShell>
  )
}

// Checks Internet, Database and Kiosk one after another, like the Figma
// system check screen, then opens the dashboard.
export function SystemCheck() {
  const { token, live } = useAuth()
  const navigate = useNavigate()
  const [health, setHealth] = useState(null)
  const [step, setStep] = useState(0) // how many rows have finished checking

  useEffect(() => {
    let stop = false
    const load = () => api('/api/health').then((h) => !stop && setHealth(h)).catch(() => !stop && setHealth({ internet: false, database: false, kiosk: false }))
    load()
    const t = setInterval(load, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  // The kiosk row uses the live connection so it turns green the moment the kiosk opens.
  const kioskOn = live.state?.kioskOnline ?? health?.kiosk
  const results = [health?.internet, health?.database, kioskOn]

  useEffect(() => {
    if (!health) return
    if (step < 3 && results[step]) {
      const t = setTimeout(() => setStep((s) => s + 1), 700)
      return () => clearTimeout(t)
    }
  }, [health, step, kioskOn]) // results come from health and kioskOn

  const ready = step === 3
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => navigate('/teacher/dashboard', { replace: true }), 1400)
    return () => clearTimeout(t)
  }, [ready, navigate])

  if (!token) return <Navigate to="/teacher/login" replace />

  const rows = [
    { name: 'Internet Connection', ok: 'Online', bad: 'No internet. Pictures need the internet.' },
    { name: 'Database Connection', ok: 'Database Connected', bad: 'Database error' },
    { name: 'Kiosk Connection', ok: 'Kiosk Connected', bad: 'Open the kiosk screen on the laptop (/kiosk)' },
  ]

  return (
    <WelcomeShell>
      <section className="t-check" aria-live="polite">
        <p className="t-check__brand">WishPix</p>
        <p className="t-check__eyebrow">System check</p>
        <h2>Getting ready...</h2>
        <p className="t-check__lead">Making sure everything is connected before starting</p>
        <ul>
          {rows.map((r, i) => {
            const done = i < step
            const checking = i === step
            const failed = checking && health && !results[i]
            return (
              <li key={r.name}>
                <span className={`t-check__dot ${done ? 'is-done' : ''}`}>{done && <Check size={16} strokeWidth={3} />}</span>
                <div>
                  <b>{r.name}</b>
                  <small className={done ? 'is-ok' : failed ? 'is-bad' : ''}>
                    {done ? r.ok : failed ? r.bad : checking ? 'Checking' : 'Waiting'}
                  </small>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="t-check__foot">{ready ? 'All systems are ready. Redirecting to dashboard...' : 'This only takes a moment.'}</p>
        {!ready && step === 2 && health && !kioskOn && (
          <button type="button" className="t-link" onClick={() => navigate('/teacher/dashboard', { replace: true })}>Skip for now</button>
        )}
      </section>
    </WelcomeShell>
  )
}
