import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, ChevronRight, Layers, MonitorSmartphone, Pause, Play, Printer, RotateCw, Sparkles, Square } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { activityName, PROBLEM_NAMES, themeName } from './labels.js'
import { kioskStatus } from './status.js'
import Stat from './Stat.jsx'

const CHIPS = [
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'sleeping', label: 'Sleeping' },
  { id: 'busy', label: 'Busy' },
  { id: 'printing', label: 'Printing' },
]

function greeting(t) {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening')
}

export default function Dashboard() {
  const { teacher, call, live } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [notice, setNotice] = useState(null)
  const state = live.state
  const session = state?.session
  const status = kioskStatus(state, t)

  const refresh = useCallback(() => call('/api/dashboard').then(setSummary).catch(() => {}), [call])
  // Load on open, and again whenever a picture finishes or a session changes.
  useEffect(() => { refresh() }, [refresh, state?.mode, session?.id])

  async function act(path, message) {
    try {
      await call(path, { method: 'POST' })
      setNotice(message)
    } catch (err) {
      setNotice(t.error(err.message))
    }
  }

  const picturesToday = summary?.generatedToday ?? 0
  return (
    <div className="t-dash">
      <h1 className="t-h1">{greeting(t)}, {teacher?.displayName}</h1>
      <p className="t-lead">{t("Here's what's happening at your kiosk today.")}</p>

      <section className="t-hero">
        <div className="t-hero__top">
          <span className="t-hero__eyebrow"><MonitorSmartphone size={18} /> {t('Kiosk status')} • {state?.kioskName ?? t('Kiosk')}</span>
          <span className={`t-pill ${state?.kioskOnline ? 'is-on' : 'is-off'}`}><i />{state?.kioskOnline ? t('Online') : t('Offline')}</span>
        </div>
        <h2>{status.title}</h2>
        <p>{session && state?.mode !== 'waiting' ? `${activityName(session, t)} · ${themeName(session.theme, t)}. ` : ''}{status.text}</p>
        <div className="t-hero__chips">
          {CHIPS.map((c) => (
            <span key={c.id} className={`t-chip t-chip--${c.id} ${status.chip === c.id ? 'is-active' : ''}`}><i />{t(c.label)}</span>
          ))}
        </div>
      </section>

      {state?.printer?.problem && (
        <div className="t-next t-next--warn">
          <span><Printer size={16} /> {t('Printer: {problem}.', { problem: t(PROBLEM_NAMES[state.printer.problem]) })}</span>
          <Link to="/teacher/print">{t('Fix it')} →</Link>
        </div>
      )}

      <div className="t-section-head">
        <h3>{t("Today's summary")}</h3>
        <button className="t-link" onClick={refresh}>{t('Refresh')}</button>
      </div>
      <div className="t-stats">
        <Stat label={t('Total Activities')} value={summary?.sessionsToday} note={t('Sessions run today')} icon={<Layers size={18} />} tone="blue" />
        <Stat
          label={t('Total Prints')}
          value={summary?.printsToday}
          note={t(picturesToday === 1 ? '1 picture generated' : '{n} pictures generated', { n: picturesToday })}
          icon={<Printer size={18} />}
          tone="purple"
        />
        <Stat
          label={t('Active Session')}
          value={session ? themeName(session.theme, t) : t('None')}
          note={session ? activityName(session, t) : t('Start one below')}
          icon={<Play size={18} />}
          tone="indigo"
          small={!!session}
        />
        <Stat
          label={t('Most Used Theme')}
          value={summary?.topTheme ? themeName(summary.topTheme.theme, t) : t('None yet')}
          note={summary?.topTheme ? t(summary.topTheme.count === 1 ? '1 picture today' : '{n} pictures today', { n: summary.topTheme.count }) : t('No pictures today')}
          icon={<BarChart3 size={18} />}
          tone="green"
          small
        />
      </div>

      <div className="t-section-head t-section-head--stack">
        <h3>{t('Quick actions')}</h3>
        <p>{t('Control the current session.')}</p>
      </div>
      <button className="t-action-main" onClick={() => navigate('/teacher/setup')}>
        <span className="t-action-main__icon"><Play size={22} fill="currentColor" /></span>
        <span><b>{session ? t('Start New Session') : t('Start Session')}</b><small>{t('Set up activity, theme and safety')}</small></span>
        <ChevronRight size={20} />
      </button>
      <div className="t-actions">
        {session?.status === 'paused' ? (
          <Action icon={<Play size={18} />} tone="green" title={t('Resume Session')} text={t('Let children make pictures again')} onClick={() => act('/api/sessions/current/resume', t('Session resumed.'))} />
        ) : (
          <Action icon={<Pause size={18} />} tone="gray" title={t('Pause Session')} text={t('Temporarily stop generation')} disabled={!session} onClick={() => act('/api/sessions/current/pause', t('Session paused.'))} />
        )}
        <Action
          icon={<Square size={16} fill="currentColor" />}
          tone="red"
          title={t('End Session')}
          text={t('Save logs and sync analytics')}
          disabled={!session}
          onClick={() => { if (window.confirm(t('End the current session? Children will need a new QR code.'))) act('/api/sessions/current/end', t('Session ended and saved.')) }}
        />
        <Action icon={<RotateCw size={18} />} tone="amber" title={t('Restart Kiosk')} text={t('Reboot the kiosk hardware')} disabled={!state?.kioskOnline} onClick={() => act('/api/kiosk/restart', t('Kiosk is restarting…'))} />
      </div>
      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}

      <div className="t-next">
        <span><Sparkles size={16} /> {session ? t('Next: watch the children in Live Session.') : t('Next: decide which activity to run.')}</span>
        <Link to={session ? '/teacher/live' : '/teacher/setup'}>{session ? t('Live session') : t('Plan activity')} →</Link>
      </div>
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
