import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Globe, Image, MessageSquare, Moon, Pause, Play, Printer, ShieldCheck, ShieldX, Smartphone, Square, Sun, Zap,
} from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { activityName, blockReason, PROBLEM_NAMES, SAFETY_NAMES, themeName } from './labels.js'
import { clock, duration, fromSqlite, kioskStatus, requestStatus, useNow, when } from './status.js'
import { Stepper } from '../ui/Stepper.jsx'
import Stat from './Stat.jsx'

const FLOW_MODES = ['listening', 'processing', 'generating', 'printing', 'preview']

// What is happening on the kiosk right now, plus every request in the
// running session. Updates live as children use the kiosk.
export default function LiveSession() {
  const { call, live } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [notice, setNotice] = useState(null)
  const state = live.state
  const session = state?.session

  const load = useCallback(() => call('/api/sessions/current').then(setData).catch((e) => setNotice(t.error(e.message))), [call, t])
  // Reload whenever the kiosk moves on, a request is reviewed or a page prints.
  useEffect(() => { load() }, [load, session?.id, state?.mode, state?.current?.id, state?.pendingModeration, state?.printer?.printing?.requestId])

  async function act(path, message) {
    try {
      await call(path, { method: 'POST' })
      setNotice(message)
    } catch (err) {
      setNotice(t.error(err.message))
    }
  }

  if (state && !session) {
    return (
      <div className="t-soon">
        <i className="t-tint t-tint--blue t-tint--lg"><Zap size={22} /></i>
        <h1 className="t-h1 t-h1--sm">{t('No session running')}</h1>
        <p className="t-lead">{t("Start a session to watch the children's requests here as they happen.")}</p>
        <Link className="t-btn" to="/teacher/setup">{t('Start Session')}</Link>
      </div>
    )
  }

  const counts = data?.counts
  const requests = data?.session?.id === session?.id ? data?.requests ?? [] : []
  const pending = state?.pendingModeration ?? 0

  return (
    <div className="t-live">
      <div className="t-live__head">
        <div>
          <h1 className="t-h1 t-h1--sm">{t('Live Session')}</h1>
          <p className="t-lead">{session ? `${themeName(session.theme, t)} · ${activityName(session, t)}` : t('Loading…')}</p>
        </div>
        {session && <span className={`t-state t-state--${session.status}`}><i />{session.status === 'paused' ? t('Paused') : t('Active')}</span>}
      </div>

      {session && <SessionFacts session={session} phones={state?.phones ?? 0} />}

      <NowCard state={state} onWake={() => act('/api/kiosk/wake', t('Waking the kiosk…'))} />

      <div className="t-actions t-actions--row">
        {session?.status === 'paused' ? (
          <button className="t-btn" onClick={() => act('/api/sessions/current/resume', t('Session resumed.'))}><Play size={16} fill="currentColor" /> {t('Resume')}</button>
        ) : (
          <button className="t-btn t-btn--ghost" onClick={() => act('/api/sessions/current/pause', t('Session paused.'))}><Pause size={16} /> {t('Pause')}</button>
        )}
        <button
          className="t-btn t-btn--danger"
          onClick={() => {
            if (!window.confirm(t('End the current session? Children will need a new QR code.'))) return
            act('/api/sessions/current/end', t('Session ended and saved.')).then(() => navigate('/teacher/dashboard'))
          }}
        >
          <Square size={14} fill="currentColor" /> {t('End Session')}
        </button>
      </div>

      <div className="t-stats t-stats--four">
        <Stat label={t('Requests')} value={counts?.requests} icon={<MessageSquare size={18} />} tone="blue" />
        <Stat label={t('Pictures made')} value={counts?.pictures} icon={<Image size={18} />} tone="green" />
        <Stat label={t('Blocked')} value={counts?.blocked} icon={<ShieldX size={18} />} tone="red" />
        <Stat label={t('Pages printed')} value={counts?.pages} icon={<Printer size={18} />} tone="purple" />
      </div>

      {pending > 0 && (
        <div className="t-next t-next--warn">
          <span><ShieldX size={16} /> {t(pending === 1 ? '1 blocked request waiting for review.' : '{n} blocked requests waiting for review.', { n: pending })}</span>
          <Link to="/teacher/moderation">{t('Review')} →</Link>
        </div>
      )}
      {state?.printer?.problem && (
        <div className="t-next t-next--warn">
          <span><Printer size={16} /> {t('Printer: {problem}.', { problem: t(PROBLEM_NAMES[state.printer.problem]) })}</span>
          <Link to="/teacher/print">{t('Fix it')} →</Link>
        </div>
      )}

      <div className="t-section-head">
        <h3>{t('This session')}</h3>
        <span className="t-muted">{t(requests.length === 1 ? '1 request' : '{n} requests', { n: requests.length })}</span>
      </div>
      {data && requests.length === 0 && (
        <div className="t-empty">
          <i className="t-tint t-tint--blue t-tint--lg"><Smartphone size={22} /></i>
          <b>{t('No requests yet')}</b>
          <p>{t('When a child scans the QR code and says an idea, it appears here.')}</p>
        </div>
      )}
      <ul className="t-feed">
        {requests.map((r) => <FeedRow key={r.id} r={r} />)}
      </ul>

      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}
    </div>
  )
}

function SessionFacts({ session, phones }) {
  const t = useT()
  const now = useNow()
  const started = fromSqlite(session.started_at)
  return (
    <ul className="t-facts">
      <li><Play size={14} /> {t('Started {time}', { time: clock(started, t) })} · {duration(now - started, t)}</li>
      <li><ShieldCheck size={14} /> {t(SAFETY_NAMES[session.safety_level])}</li>
      <li><Globe size={14} /> {session.languages.map((l) => t(l)).join(', ')}</li>
      <li><Smartphone size={14} /> {t(phones === 1 ? '1 phone connected' : '{n} phones connected', { n: phones })}</li>
    </ul>
  )
}

function NowCard({ state, onWake }) {
  const t = useT()
  const status = kioskStatus(state, t)
  const current = state?.current
  const showFlow = state?.kioskOnline && FLOW_MODES.includes(state.mode)
  return (
    <section className="t-hero t-now">
      <div className="t-hero__top">
        <span className="t-hero__eyebrow">{t('Right now')} · {state?.kioskName ?? t('Kiosk')}</span>
        <span className={`t-pill ${state?.kioskOnline ? 'is-on' : 'is-off'}`}><i />{state?.kioskOnline ? t('Online') : t('Offline')}</span>
      </div>
      <div className="t-now__body">
        <div>
          <h2>{status.title}</h2>
          {current?.recognizedText && FLOW_MODES.concat('blocked', 'error').includes(state.mode) ? (
            <p className="t-now__said">
              {t('Child #{n} said', { n: current.queueNumber })} <b>“{current.recognizedText}”</b>
              {current.override ? ` ${t('(overridden by teacher)')}` : ''}
            </p>
          ) : (
            <p>{status.text}</p>
          )}
          {state?.mode === 'preview' && current?.printProblem && <p className="t-now__warn">{t('Not printed: {problem}', { problem: t(current.printProblem) })}</p>}
          {state?.screen?.sleeping && (
            <button className="t-btn t-btn--light" onClick={onWake}><Sun size={16} /> {t('Wake the kiosk')}</button>
          )}
        </div>
        {current?.imageUrl && ['printing', 'preview'].includes(state.mode) && (
          <img className="t-now__img" src={current.imageUrl} alt={current.recognizedText} />
        )}
        {state?.screen?.sleeping && <Moon className="t-now__moon" size={56} />}
      </div>
      {showFlow && <div className="t-now__flow"><Stepper mode={state.mode} size="sm" /></div>}
    </section>
  )
}

function FeedRow({ r }) {
  const t = useT()
  const status = requestStatus(r, t)
  const reason = r.block_category ? ` · ${blockReason(r, t)}` : ''
  const body = (
    <>
      {r.image_url ? <img src={r.image_url} alt="" /> : <span className="t-feed__noimg">{r.block_category ? <ShieldX size={18} /> : <CheckCircle2 size={18} />}</span>}
      <span className="t-feed__text">
        <b>“{r.recognized_text}”</b>
        <small>{t('Child #{n}', { n: r.queue_number })} · {when(r.created_at, t)}{reason}</small>
      </span>
      <em className={`t-tag t-tag--${status.tone}`}>{status.text}</em>
    </>
  )
  return (
    <li>
      {r.moderation_status === 'pending' ? <Link className="t-feed__row" to="/teacher/moderation">{body}</Link> : <div className="t-feed__row">{body}</div>}
    </li>
  )
}
