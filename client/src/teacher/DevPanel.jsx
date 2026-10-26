import { useEffect, useState } from 'react'
import { api, useLive } from '../lib/live.js'

// Temporary teacher controls for testing the live connection (step 1).
// Step 3 replaces this with the full Teacher App from Figma.
export default function DevPanel() {
  const [token, setToken] = useState(() => sessionStorage.getItem('wp_token'))
  const { state, connected, error } = useLive('teacher', token)
  const [catalog, setCatalog] = useState(null)
  const [health, setHealth] = useState(null)
  const [form, setForm] = useState({ activityType: 'color_create', activitySubtype: 'single_object', theme: 'Animals' })
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!token) return
    api('/api/catalog', { token }).then(setCatalog).catch(() => signOut())
    api('/api/health').then(setHealth)
  }, [token])

  // An expired login comes back as a socket error.
  useEffect(() => { if (error === 'Not allowed') signOut() }, [error])

  function signOut() {
    sessionStorage.removeItem('wp_token')
    setToken(null)
  }

  async function signIn(e) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      const res = await api('/api/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } })
      sessionStorage.setItem('wp_token', res.token)
      setToken(res.token)
      setMsg(null)
    } catch (err) {
      setMsg(err.message)
    }
  }

  const run = (path, body) =>
    api(path, { token, method: 'POST', body }).then(() => setMsg(null)).catch((err) => setMsg(err.message))

  if (!token) {
    return (
      <Page>
        <h1>Teacher sign in</h1>
        <form onSubmit={signIn} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
          <input name="username" placeholder="Username" autoComplete="username" />
          <input name="password" type="password" placeholder="Password" autoComplete="current-password" />
          <button>Login</button>
        </form>
        {msg && <p style={{ color: 'var(--danger)' }}>{msg}</p>}
      </Page>
    )
  }

  const activity = catalog?.activities.find((a) => a.id === form.activityType)

  return (
    <Page>
      <h1>WishPix dev panel</h1>
      <p>
        Live connection: <b>{connected ? 'connected' : 'offline'}</b> · Kiosk: <b>{state?.kioskOnline ? 'online' : 'offline'}</b> ·
        Mode: <b>{state?.mode ?? '…'}</b>
        {health && <> · Internet: <b>{health.internet ? 'online' : 'offline'}</b> · Database: <b>{health.database ? 'ok' : 'error'}</b></>}
      </p>

      {catalog && (
        <fieldset style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
          <legend>Start a session</legend>
          <select value={form.activityType} onChange={(e) => {
            const a = catalog.activities.find((x) => x.id === e.target.value)
            setForm({ ...form, activityType: a.id, activitySubtype: a.subtypes[0].id })
          }}>
            {catalog.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.activitySubtype} onChange={(e) => setForm({ ...form, activitySubtype: e.target.value })}>
            {activity?.subtypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
            {catalog.themes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <button onClick={() => run('/api/sessions', { ...form, safetyLevel: 'standard', languages: ['English', 'Filipino'] })}>
            Start session
          </button>
        </fieldset>
      )}

      <p style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => run('/api/sessions/current/pause')}>Pause</button>
        <button onClick={() => run('/api/sessions/current/resume')}>Resume</button>
        <button onClick={() => run('/api/sessions/current/end')}>End</button>
        <button onClick={signOut}>Sign out</button>
      </p>
      {msg && <p style={{ color: 'var(--danger)' }}>{msg}</p>}

      <h2>Live state</h2>
      <pre style={{ background: '#fff', padding: 12, borderRadius: 8, overflow: 'auto' }}>{JSON.stringify(state, null, 2)}</pre>
    </Page>
  )
}

const Page = ({ children }) => <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>{children}</div>
