import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, FlaskConical, Trash2 } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { activityName, themeName } from './labels.js'
import { clock, fromSqlite, shortDate, when } from './status.js'
import { localDay, REPORT_TYPES, reportTitle } from './reportInfo.js'

export default function Reports() {
  const { call } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [reports, setReports] = useState(null)
  const [sessions, setSessions] = useState([])
  const [type, setType] = useState('daily')
  const [form, setForm] = useState({ date: localDay(), sessionId: '', from: localDay(-6), to: localDay() })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadReports = useCallback(() => call('/api/reports').then((r) => setReports(r.reports)).catch((e) => setError(e.message)), [call])
  useEffect(() => { loadReports() }, [loadReports])
  useEffect(() => {
    call('/api/sessions').then((r) => {
      setSessions(r.sessions)
      setForm((f) => ({ ...f, sessionId: f.sessionId || String(r.sessions[0]?.id ?? '') }))
    }).catch(() => {})
  }, [call])

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = type === 'daily' ? { type, date: form.date } : type === 'session' ? { type, sessionId: Number(form.sessionId) } : { type, from: form.from, to: form.to }
      const { report } = await call('/api/reports', { method: 'POST', body })
      navigate(`/teacher/reports/${report.id}`)
    } catch (err) {
      setError(t.error(err.message))
      setBusy(false)
    }
  }

  async function remove(r) {
    if (!window.confirm(t('Delete this report? This cannot be undone.'))) return
    try {
      await call(`/api/reports/${r.id}`, { method: 'DELETE' })
      loadReports()
    } catch (err) {
      setError(t.error(err.message))
    }
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="t-reports">
      <h1 className="t-h1 t-h1--sm">{t('Reports')}</h1>
      <p className="t-lead">{t('Make a report to print, save as PDF or download for your records.')}</p>

      <form className="t-panel-card t-report-new" onSubmit={create}>
        <h2 className="t-panel__title">{t('New report')}</h2>
        <div className="t-options" role="radiogroup" aria-label={t('Report type')}>
          {REPORT_TYPES.map(({ id, icon: Icon, tone, name, text }) => (
            <button type="button" key={id} role="radio" aria-checked={type === id} className={`t-option t-option--flat ${type === id ? 'is-selected' : ''}`} onClick={() => setType(id)}>
              <i className={`t-tint t-tint--${tone}`}><Icon size={18} /></i>
              <span><b>{t(name)}</b><small>{t(text)}</small></span>
            </button>
          ))}
          <div className="t-option t-option--flat t-option--soon" aria-disabled="true">
            <i className="t-tint t-tint--gray"><FlaskConical size={18} /></i>
            <span><b>{t('Research Evaluation Report')}</b><small>{t('Coming soon.')}</small></span>
          </div>
        </div>

        <div className="t-report-new__fields">
          {type === 'daily' && (
            <label className="t-field">{t('Day')}<input type="date" value={form.date} max={localDay()} onChange={(e) => set({ date: e.target.value })} required /></label>
          )}
          {type === 'session' && (
            sessions.length ? (
              <label className="t-field">{t('Session')}
                <select className="t-select" value={form.sessionId} onChange={(e) => set({ sessionId: e.target.value })}>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.id} · {themeName(s.theme, t)} · {activityName(s, t)} · {shortDate(fromSqlite(s.started_at), t)} {clock(fromSqlite(s.started_at), t)} · {t(s.requests === 1 ? '1 request' : '{n} requests', { n: s.requests })}
                    </option>
                  ))}
                </select>
              </label>
            ) : <p className="t-muted">{t('No sessions yet. Run a session first.')}</p>
          )}
          {type === 'safety' && (
            <>
              <label className="t-field">{t('From')}<input type="date" value={form.from} max={form.to} onChange={(e) => set({ from: e.target.value })} required /></label>
              <label className="t-field">{t('To')}<input type="date" value={form.to} min={form.from} max={localDay()} onChange={(e) => set({ to: e.target.value })} required /></label>
            </>
          )}
        </div>
        {error && <p className="t-error" role="alert">{error}</p>}
        <button className="t-btn" disabled={busy || (type === 'session' && !sessions.length)}><FileText size={16} /> {busy ? t('Making the report…') : t('Create report')}</button>
      </form>

      <div className="t-section-head"><h3>{t('Saved reports')}</h3></div>
      {reports && reports.length === 0 && (
        <div className="t-empty">
          <i className="t-tint t-tint--blue t-tint--lg"><FileText size={22} /></i>
          <b>{t('No reports yet')}</b>
          <p>{t('Reports you create are saved here.')}</p>
        </div>
      )}
      <ul className="t-feed">
        {reports?.map((r) => {
          const kind = REPORT_TYPES.find((x) => x.id === r.type)
          const Icon = kind?.icon ?? FileText
          return (
            <li key={r.id} className="t-feed__row">
              <span className={`t-feed__noimg t-tint--${kind?.tone ?? 'gray'}`}><Icon size={18} /></span>
              <Link className="t-feed__text t-feed__link" to={`/teacher/reports/${r.id}`}>
                <b className="t-feed__wrap">{reportTitle(r.type, r.params, t)}</b>
                <small>{t('Made {when}', { when: when(r.created_at, t) })}</small>
              </Link>
              <button className="t-icon-btn" onClick={() => remove(r)} aria-label={t('Delete report')}><Trash2 size={18} /></button>
              <ChevronRight size={18} className="t-feed__chev" aria-hidden="true" />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
