import { useCallback, useEffect, useState } from 'react'
import {
  Ban, CircleCheck, EyeOff, FlaskConical, Frown, Ghost, Hand, HeartCrack, MessageSquareWarning, Phone, ShieldAlert,
  ShieldCheck, ShieldX, Skull, Swords, Wine,
} from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { activityName, blockReason, CATEGORY_NAMES, SAFETY_NAMES, themeName } from './labels.js'
import { when } from './status.js'
import Stat from './Stat.jsx'

// Icon and color for each safety filter category (server/src/safety.js).
const CATEGORY_LOOK = {
  violence: { icon: Skull, tone: 'red' },
  weapons: { icon: Swords, tone: 'red' },
  adult: { icon: EyeOff, tone: 'pink' },
  drugs: { icon: Wine, tone: 'purple' },
  bad_language: { icon: MessageSquareWarning, tone: 'orange' },
  hate: { icon: Frown, tone: 'orange' },
  self_harm: { icon: HeartCrack, tone: 'red' },
  personal_info: { icon: Phone, tone: 'blue' },
  scary: { icon: Ghost, tone: 'indigo' },
  rough_play: { icon: Hand, tone: 'amber' },
  custom: { icon: Ban, tone: 'gray' },
}

const OUTCOME_MESSAGES = {
  now: 'Overridden. The kiosk is making the picture now.',
  queued: 'Overridden. The picture will be made when the kiosk is free.',
  saved: 'Overridden and saved. That session has ended, so no picture was made.',
}

function outcome(item, t) {
  if (item.moderation_status === 'kept_blocked') return { tone: 'kept', text: t('Kept blocked') }
  if (item.status === 'success') return { tone: 'ok', text: item.print_status === 'printed' ? t('Overridden · picture printed') : t('Overridden · picture made') }
  if (item.status === 'failed') return { tone: 'bad', text: t('Overridden · the picture failed') }
  if (['processing', 'generating'].includes(item.status)) return { tone: 'wait', text: t('Overridden · making the picture') }
  if (item.queued) return { tone: 'wait', text: t('Overridden · waiting for the kiosk') }
  return { tone: 'kept', text: t('Overridden · no picture (session had ended)') }
}

export default function Moderation() {
  const { call, live } = useAuth()
  const t = useT()
  const [view, setView] = useState('pending')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // id of the request being reviewed
  const [notice, setNotice] = useState(null)
  const pending = live.state?.pendingModeration
  const mode = live.state?.mode

  const load = useCallback(
    () => call(`/api/moderation?view=${view}`).then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message)),
    [call, view]
  )
  // Reload when a new request is blocked, and as overridden pictures move along.
  useEffect(() => { load() }, [load, pending, mode])

  async function review(item, decision) {
    if (decision === 'override' && !window.confirm(t('Make a picture of “{text}” anyway?', { text: item.recognized_text }))) return
    setBusy(item.id)
    try {
      const res = await call(`/api/moderation/${item.id}/${decision}`, { method: 'POST' })
      setNotice(decision === 'keep' ? t('Kept blocked.') : t(OUTCOME_MESSAGES[res.outcome]))
    } catch (err) {
      setNotice(t.error(err.message))
    }
    setBusy(null)
    load()
  }

  const summary = data?.summary
  const items = data?.items ?? []

  return (
    <div className="t-modc">
      <h1 className="t-h1 t-h1--sm">{t('Moderation Center')}</h1>
      <p className="t-lead">{t('Requests the safety filter stopped. Keep them blocked, or override to make the picture.')}</p>

      <div className="t-stats t-stats--mod">
        <Stat label={t('Waiting for review')} value={summary?.pending} tone="red" icon={<ShieldAlert size={18} />} />
        <Stat label={t('Blocked today')} value={summary?.blockedToday} tone="orange" icon={<ShieldX size={18} />} />
        <Stat label={t('Kept blocked today')} value={summary?.keptToday} tone="gray" icon={<Ban size={18} />} />
        <Stat label={t('Overridden today')} value={summary?.overriddenToday} tone="green" icon={<CircleCheck size={18} />} />
      </div>

      <ol className="t-tabs t-tabs--two">
        {[['pending', 'Needs review', summary?.pending], ['reviewed', 'Reviewed']].map(([id, label, count]) => (
          <li key={id}>
            <button className={view === id ? 'is-current' : ''} onClick={() => setView(id)} aria-pressed={view === id}>
              {t(label)}{count > 0 && <span>{count}</span>}
            </button>
          </li>
        ))}
      </ol>

      {error && <p className="t-error" role="alert">{t.error(error)}</p>}

      {data && items.length === 0 && (
        <div className="t-empty">
          <i className="t-tint t-tint--green t-tint--lg"><ShieldCheck size={22} /></i>
          <b>{view === 'pending' ? t('All clear!') : t('Nothing reviewed yet')}</b>
          <p>{view === 'pending' ? t('No blocked requests are waiting. New ones appear here right away.') : t('Requests you keep blocked or override are listed here.')}</p>
        </div>
      )}

      <div className="t-mods">
        {items.map((item) => (
          <ModCard key={item.id} item={item} busy={busy === item.id} onReview={(d) => review(item, d)} />
        ))}
      </div>

      <FilterTest call={call} session={live.state?.session} />

      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}
    </div>
  )
}

function ModCard({ item, busy, onReview }) {
  const t = useT()
  const { icon: Icon, tone } = CATEGORY_LOOK[item.block_category] ?? CATEGORY_LOOK.custom
  const isPending = item.moderation_status === 'pending'
  const result = !isPending && outcome(item, t)
  return (
    <article className="t-mod">
      <div className="t-mod__head">
        <span className={`t-mod__cat t-tint--${tone}`}><Icon size={14} /> {t(CATEGORY_NAMES[item.block_category] ?? item.block_category)}</span>
        <small>{t('Child #{n}', { n: item.queue_number })} · {when(item.created_at, t)}</small>
      </div>
      <div className="t-mod__body">
        <div>
          <p className="t-mod__said">“{item.recognized_text}”</p>
          <p className="t-mod__reason">{blockReason(item, t)}</p>
          <p className="t-mod__meta">
            {themeName(item.theme, t)} · {activityName(item, t)} · {t(SAFETY_NAMES[item.safety_level])}
            {item.session_status === 'ended' && ` · ${t('session ended')}`}
          </p>
        </div>
        {item.image_url && <img className="t-mod__img" src={item.image_url} alt={t('Picture of {text}', { text: item.recognized_text })} />}
      </div>
      {isPending ? (
        <>
          <div className="t-mod__actions">
            <button className="t-btn t-btn--ghost" onClick={() => onReview('keep')} disabled={busy}><Ban size={16} /> {t('Keep Blocked')}</button>
            <button className="t-btn" onClick={() => onReview('override')} disabled={busy}><CircleCheck size={16} /> {t('Override')}</button>
          </div>
          {item.session_status === 'ended' && <p className="t-field-hint">{t('This session has ended, so Override only saves your decision.')}</p>}
        </>
      ) : (
        <p className={`t-mod__outcome is-${result.tone}`}>
          {result.text}
          <small>{item.moderated_by_name ? t('by {name}, {when}', { name: item.moderated_by_name, when: when(item.moderated_at, t) }) : when(item.moderated_at, t)}</small>
        </p>
      )}
    </article>
  )
}

// Lets the teacher check a phrase before the children try it.
function FilterTest({ call, session }) {
  const t = useT()
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)

  async function check(e) {
    e.preventDefault()
    if (!text.trim()) return
    try {
      setResult({ text: text.trim(), ...(await call('/api/safety/check', { method: 'POST', body: { text } })) })
    } catch (err) {
      setResult({ error: t.error(err.message) })
    }
  }

  const level = result && t(SAFETY_NAMES[result.level])
  return (
    <section className="t-ftest">
      <h2 className="t-panel__title"><FlaskConical size={18} /> {t('Test the safety filter')}</h2>
      <p className="t-panel__lead">
        {session ? t("Uses this session's {level} rules.", { level: t(SAFETY_NAMES[session.safety_level]) }) : t('Uses the STANDARD rules.')} {t('Nothing is sent to the kiosk.')}
      </p>
      <form className="t-words__input" onSubmit={check}>
        <input value={text} onChange={(e) => { setText(e.target.value); setResult(null) }} placeholder={t('e.g. a big red fire truck')} aria-label={t('Phrase to test')} maxLength={200} />
        <button className="t-ftest__go">{t('Check')}</button>
      </form>
      {result?.error && <p className="t-error">{result.error}</p>}
      {result && !result.error && (
        <p className={`t-ftest__result ${result.allowed ? 'is-ok' : 'is-bad'}`} role="status">
          {result.allowed ? <CircleCheck size={16} /> : <ShieldX size={16} />}
          {result.allowed ? t('Allowed under {level}.', { level }) : t('Blocked under {level}: {reason}', { level, reason: blockReason(result, t) })}
        </p>
      )}
    </section>
  )
}
