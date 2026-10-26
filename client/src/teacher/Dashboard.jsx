import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, ChevronRight, Layers, MonitorSmartphone, Pause, Play, Printer, RotateCw, Sparkles, Square } from 'lucide-react'
import { useAuth } from './auth.jsx'
import { activityName } from './labels.js'

// Kiosk modes from the server, shown as the five status chips in Figma.
function kioskStatus(state) {
  if (!state?.kioskOnline) return { chip: 'offline', title: 'KIOSK OFFLINE', text: 'Open the kiosk screen on the laptop to connect it.' }
  switch (state.mode) {
    case 'waiting': return { chip: 'online', title: 'WAITING FOR TEACHER', text: 'No activity is running. Choose what the children will do next.' }
    case 'ready': return { chip: 'online', title: 'READY FOR CHILDREN', text: 'The QR code is on the kiosk. Children can scan and start.' }
    case 'paused': return { chip: 'sleeping', title: 'SESSION PAUSED', text: 'Picture making is stopped. Resume when the children are ready.' }
    case 'printing':
    case 'preview': return { chip: 'printing', title: 'PRINTING', text: 'A picture is being printed for a child.' }
    default: return { chip: 'busy', title: 'MAKING A PICTURE', text: 'A child is using the kiosk right now.' }
  }
}

const CHIPS = [
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'sleeping', label: 'Sleeping' },
  { id: 'busy', label: 'Busy' },
  { id: 'printing', label: 'Printing' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { teacher, call, live } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [notice, setNotice] = useState(null)
  const state = live.state
  const session = state?.session
  const status = kioskStatus(state)

  const refresh = useCallback(() => call('/api/dashboard').then(setSummary).catch(() => {}), [call])
  // Load on open, and again whenever a picture finishes or a session changes.
  useEffect(() => { refresh() }, [refresh, state?.mode, session?.id])

  async function act(path, message) {
    try {
      await call(path, { method: 'POST' })
      setNotice(message)
    } catch (err) {
      setNotice(err.message)
    }
  }

  return (
    <div className="t-dash">
      <h1 className="t-h1">{greeting()}, {teacher?.displayName}</h1>
      <p className="t-lead">Here's what's happening at your kiosk today.</p>

      <section className="t-hero">
        <div className="t-hero__top">
          <span className="t-hero__eyebrow"><MonitorSmartphone size={18} /> Kiosk status • {state?.kioskName ?? 'Kiosk'}</span>
          <span className={`t-pill ${state?.kioskOnline ? 'is-on' : 'is-off'}`}><i />{state?.kioskOnline ? 'Online' : 'Offline'}</span>
        </div>
        <h2>{status.title}</h2>
        <p>{session && state?.mode !== 'waiting' ? `${activityName(session)} · ${session.theme}. ` : ''}{status.text}</p>
        <div className="t-hero__chips">
          {CHIPS.map((c) => (
            <span key={c.id} className={`t-chip t-chip--${c.id} ${status.chip === c.id ? 'is-active' : ''}`}><i />{c.label}</span>
          ))}
        </div>
      </section>

      <div className="t-section-head">
        <h3>Today's summary</h3>
        <button className="t-link" onClick={refresh}>Refresh</button>
      </div>
      <div className="t-stats">
        <Stat label="Total Activities" value={summary?.sessionsToday ?? '–'} note="Sessions run today" icon={<Layers size={18} />} tone="blue" />
        <Stat label="Total Prints" value={summary?.printsToday ?? '–'} note={`${summary?.generatedToday ?? 0} pictures generated`} icon={<Printer size={18} />} tone="purple" />
        <Stat label="Active Session" value={session ? session.theme : 'None'} note={session ? activityName(session) : 'Start one below'} icon={<Play size={18} />} tone="indigo" small={!!session} />
        <Stat label="Most Used Theme" value={summary?.topTheme?.theme ?? 'None yet'} note={summary?.topTheme ? `${summary.topTheme.count} pictures today` : 'No pictures today'} icon={<BarChart3 size={18} />} tone="green" small />
      </div>

      <div className="t-section-head t-section-head--stack">
        <h3>Quick actions</h3>
        <p>Control the current session.</p>
      </div>
      <button className="t-action-main" onClick={() => navigate('/teacher/setup')}>
        <span className="t-action-main__icon"><Play size={22} fill="currentColor" /></span>
        <span><b>{session ? 'Start New Session' : 'Start Session'}</b><small>Set up activity, theme and safety</small></span>
        <ChevronRight size={20} />
      </button>
      <div className="t-actions">
        {session?.status === 'paused' ? (
          <Action icon={<Play size={18} />} tone="green" title="Resume Session" text="Let children make pictures again" onClick={() => act('/api/sessions/current/resume', 'Session resumed.')} />
        ) : (
          <Action icon={<Pause size={18} />} tone="gray" title="Pause Session" text="Temporarily stop generation" disabled={!session} onClick={() => act('/api/sessions/current/pause', 'Session paused.')} />
        )}
        <Action icon={<Square size={16} fill="currentColor" />} tone="red" title="End Session" text="Save logs and sync analytics" disabled={!session} onClick={() => { if (window.confirm('End the current session? Children will need a new QR code.')) act('/api/sessions/current/end', 'Session ended and saved.') }} />
        <Action icon={<RotateCw size={18} />} tone="amber" title="Restart Kiosk" text="Reboot the kiosk hardware" disabled={!state?.kioskOnline} onClick={() => act('/api/kiosk/restart', 'Kiosk is restarting…')} />
      </div>
      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}

      <div className="t-next">
        <span><Sparkles size={16} /> Next: {session ? 'watch the children in Live Session.' : 'decide which activity to run.'}</span>
        <Link to={session ? '/teacher/live' : '/teacher/setup'}>{session ? 'Live session' : 'Plan activity'} →</Link>
      </div>
    </div>
  )
}

function Stat({ label, value, note, icon, tone, small }) {
  return (
    <div className="t-stat">
      <div className="t-stat__head"><span>{label}</span><i className={`t-tint t-tint--${tone}`}>{icon}</i></div>
      <b className={small ? 't-stat__value--sm' : ''}>{value}</b>
      <small>{note}</small>
    </div>
  )
}

function Action({ icon, tone, title, text, onClick, disabled }) {
  return (
    <button className="t-action" onClick={onClick} disabled={disabled}>
      <i className={`t-tint t-tint--${tone}`}>{icon}</i>
      <span><b>{title}</b><small>{text}</small></span>
    </button>
  )
}
