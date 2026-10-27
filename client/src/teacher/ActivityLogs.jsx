import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, LogIn, Monitor, Printer, Search, ShieldCheck, ShieldX, Smartphone, Zap } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { activityName, blockReason, themeName } from './labels.js'
import { requestStatus, when } from './status.js'
import { EVENT_GROUP_OF, eventText } from './events.js'
import Chips from './Chips.jsx'

const PAGE = 30
const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']]
const STATUSES = [['all', 'All'], ['printed', 'Printed'], ['not_printed', 'Not printed'], ['blocked', 'Blocked'], ['failed', 'Failed']]
const GROUPS = [['all', 'All'], ['sessions', 'Sessions'], ['moderation', 'Moderation'], ['printing', 'Printer'], ['kiosk', 'Kiosk'], ['account', 'Account']]
const GROUP_ICONS = { sessions: Zap, moderation: ShieldCheck, printing: Printer, kiosk: Monitor, account: LogIn }

// Everything that has happened: the children's requests, and what teachers
// and the system did. No child names are ever stored, only "Child #n".
export default function ActivityLogs() {
  const t = useT()
  const [tab, setTab] = useState('requests')
  const [range, setRange] = useState('7d')
  return (
    <div className="t-logs">
      <h1 className="t-h1 t-h1--sm">{t('Activity Logs')}</h1>
      <p className="t-lead">{t('Every request from the children, and every action by teachers and the kiosk.')}</p>

      <ol className="t-tabs t-tabs--two">
        {[['requests', "Children's requests"], ['events', 'Teacher & system']].map(([id, label]) => (
          <li key={id}>
            <button className={tab === id ? 'is-current' : ''} onClick={() => setTab(id)} aria-pressed={tab === id}>{t(label)}</button>
          </li>
        ))}
      </ol>

      <Chips label={t('Date range')} options={RANGES.map(([id, l]) => [id, t(l)])} value={range} onChange={setRange} />
      {tab === 'requests' ? <RequestLog range={range} /> : <EventLog range={range} />}
    </div>
  )
}

// Loads pages of a list; changing `query` starts again from the top.
function usePagedList(call, path, query) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(
    (offset) =>
      call(`${path}?${query}&limit=${PAGE}&offset=${offset}`)
        .then((res) => {
          setItems((old) => (offset === 0 ? res.items : [...old, ...res.items]))
          setTotal(res.total)
          setError(null)
        })
        .catch((e) => setError(e.message)),
    [call, path, query]
  )
  useEffect(() => { load(0) }, [load])
  return { items, total, error, more: () => load(items.length) }
}

function RequestLog({ range }) {
  const { call, token } = useAuth()
  const t = useT()
  const [status, setStatus] = useState('all')
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Search a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQ(draft.trim()), 300)
    return () => clearTimeout(timer)
  }, [draft])

  const query = new URLSearchParams({ range, status, q }).toString()
  const { items, total, error, more } = usePagedList(call, '/api/logs/requests', query)

  async function downloadCsv() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/logs/requests.csv?${query}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const url = URL.createObjectURL(await res.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: `wishpix-requests-${range}.csv` })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.alert(t('The file could not be downloaded. Try again.'))
    }
    setDownloading(false)
  }

  return (
    <>
      <div className="t-filters">
        <label className="t-search">
          <Search size={16} aria-hidden="true" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Search what the children said')} aria-label={t('Search what the children said')} />
        </label>
        <select className="t-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}>
          {STATUSES.map(([id, l]) => <option key={id} value={id}>{t(l)}</option>)}
        </select>
        <button className="t-btn t-btn--ghost t-btn--sm" onClick={downloadCsv} disabled={downloading || !total}><Download size={14} /> {t('Download CSV')}</button>
      </div>

      {error && <p className="t-error" role="alert">{t.error(error)}</p>}
      {total != null && <p className="t-muted">{t(total === 1 ? '1 request' : '{n} requests', { n: total })}</p>}
      {total === 0 && (
        <div className="t-empty">
          <i className="t-tint t-tint--blue t-tint--lg"><Smartphone size={22} /></i>
          <b>{t('Nothing found')}</b>
          <p>{t('Try a longer date range or another filter.')}</p>
        </div>
      )}

      <ul className="t-feed">
        {items.map((r) => {
          const s = requestStatus(r, t)
          return (
            <li key={r.id} className="t-feed__row">
              {r.image_url ? <img src={r.image_url} alt="" /> : <span className="t-feed__noimg">{r.block_category ? <ShieldX size={18} /> : <FileText size={18} />}</span>}
              <span className="t-feed__text">
                <b>“{r.recognized_text}”</b>
                <small>
                  {when(r.created_at, t)} · {t('Child #{n}', { n: r.queue_number })} · {themeName(r.theme, t)} · {activityName(r, t)}
                  {r.block_category ? ` · ${blockReason(r, t)}` : ''}
                </small>
              </span>
              <em className={`t-tag t-tag--${s.tone}`}>{s.text}</em>
            </li>
          )
        })}
      </ul>
      {items.length < (total ?? 0) && <button className="t-btn t-btn--ghost t-more" onClick={more}>{t('Show more')}</button>}
    </>
  )
}

function EventLog({ range }) {
  const { call } = useAuth()
  const t = useT()
  const [group, setGroup] = useState('all')
  const query = new URLSearchParams({ range, group }).toString()
  const { items, total, error, more } = usePagedList(call, '/api/logs/events', query)

  return (
    <>
      <Chips label={t('Kind of action')} options={GROUPS.map(([id, l]) => [id, t(l)])} value={group} onChange={setGroup} />
      {error && <p className="t-error" role="alert">{t.error(error)}</p>}
      {total != null && <p className="t-muted">{t(total === 1 ? '1 action' : '{n} actions', { n: total })}</p>}
      {total === 0 && (
        <div className="t-empty">
          <i className="t-tint t-tint--blue t-tint--lg"><LogIn size={22} /></i>
          <b>{t('Nothing found')}</b>
          <p>{t('Try a longer date range or another filter.')}</p>
        </div>
      )}
      <ul className="t-feed">
        {items.map((e) => {
          const g = EVENT_GROUP_OF(e.type)
          const Icon = GROUP_ICONS[g]
          return (
            <li key={e.id} className="t-feed__row">
              <span className={`t-feed__noimg t-feed__noimg--${g}`}><Icon size={18} /></span>
              <span className="t-feed__text">
                <b className="t-feed__wrap">{eventText(e, t)}</b>
                <small>{e.teacher ? t('by {name}, {when}', { name: e.teacher, when: when(e.created_at, t) }) : `${t('Kiosk')} · ${when(e.created_at, t)}`}</small>
              </span>
            </li>
          )
        })}
      </ul>
      {items.length < (total ?? 0) && <button className="t-btn t-btn--ghost t-more" onClick={more}>{t('Show more')}</button>}
    </>
  )
}
