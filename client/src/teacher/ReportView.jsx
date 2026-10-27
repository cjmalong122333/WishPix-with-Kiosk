import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { activityName, blockReason, CATEGORY_NAMES, SAFETY_NAMES, subtypeName, themeName } from './labels.js'
import { clock, duration, fromSqlite, percent, requestStatus, shortDate } from './status.js'
import { downloadCsv, reportTitle } from './reportInfo.js'
import { BarList, ChartCard, DataTable } from './charts.jsx'
import { StatsView } from './Analytics.jsx'
import Stat from './Stat.jsx'

// One saved report, laid out to read on screen or print / save as PDF.
export default function ReportView() {
  const { id } = useParams()
  const { call } = useAuth()
  const t = useT()
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    call(`/api/reports/${id}`).then((r) => setReport(r.report)).catch((e) => setError(e.message))
  }, [call, id])

  if (error) return <p className="t-error" role="alert">{t.error(error)}</p>
  if (!report) return <p className="t-muted">{t('Loading…')}</p>

  const { type, data } = report
  const title = reportTitle(type, data.params, t)
  const at = (time) => `${shortDate(fromSqlite(time), t)} ${clock(fromSqlite(time), t)}`
  const requestRows = (list) => list.map((r) => [at(r.created_at), r.queue_number, r.recognized_text, requestStatus(r, t).text])

  function csv() {
    const name = `wishpix-report-${report.id}.csv`
    if (type === 'session') downloadCsv(name, [t('Time'), t('Child #'), t('Said'), t('Status')], requestRows(data.requests))
    else if (type === 'safety') downloadCsv(name, [t('Time'), t('Child #'), t('Said'), t('Reason'), t('Teacher review')], data.blocked.map((r) => [at(r.created_at), r.queue_number, r.recognized_text, blockReason(r, t), reviewText(r, t)]))
    else downloadCsv(name, [t('Session'), t('Theme'), t('Activity'), t('Started'), t('Requests'), t('Pictures made')], data.sessions.map((s) => [s.id, themeName(s.theme, t), activityName(s, t), at(s.started_at), s.requests, s.pictures]))
  }

  return (
    <article className="t-report">
      <div className="t-report__bar">
        <Link className="t-btn t-btn--ghost t-btn--sm" to="/teacher/reports"><ArrowLeft size={14} /> {t('Reports')}</Link>
        <span />
        <button className="t-btn t-btn--ghost t-btn--sm" onClick={csv}><Download size={14} /> {t('Download CSV')}</button>
        <button className="t-btn t-btn--sm" onClick={() => window.print()}><Printer size={14} /> {t('Print / Save as PDF')}</button>
      </div>

      <header className="t-report__head">
        <p>WishPix · {t('Teacher App')}</p>
        <h1>{title}</h1>
        <small>{t('Made {when}', { when: at(report.created_at) })}</small>
      </header>

      {type === 'daily' && <DailyReport data={data} at={at} />}
      {type === 'session' && <SessionReport data={data} at={at} requestRows={requestRows} madeAt={report.created_at} />}
      {type === 'safety' && <SafetyReport data={data} at={at} />}

      <p className="t-report__foot">{t('No child names are stored by WishPix. Children are shown only as “Child #” in the order they used the kiosk.')}</p>
    </article>
  )
}

function reviewText(r, t) {
  if (r.moderation_status === 'kept_blocked') return t('Kept blocked')
  if (r.moderation_status === 'overridden') return t('Overridden')
  return t('Not reviewed')
}

function DailyReport({ data, at }) {
  const t = useT()
  return (
    <>
      <StatsView data={data} printable />
      <ChartCard title={t('Sessions that day')} empty={!data.sessions.length}>
        <DataTable
          head={[t('Session'), t('Theme'), t('Activity'), t('Started'), t('Requests'), t('Pictures made')]}
          rows={data.sessions.map((s) => [`#${s.id}`, themeName(s.theme, t), `${activityName(s, t)} · ${subtypeName(s.activity_subtype, t)}`, at(s.started_at), s.requests, s.pictures])}
        />
      </ChartCard>
    </>
  )
}

function SessionReport({ data, at, requestRows, madeAt }) {
  const t = useT()
  const s = data.session
  // A session still running when the report was made is measured up to that moment.
  const end = fromSqlite(s.ended_at ?? madeAt)
  const totals = data.totals
  return (
    <>
      <section className="t-chart">
        <div className="t-chart__head"><div><h3>{t('Session settings')}</h3></div></div>
        <dl className="t-facts-grid">
          <div><dt>{t('Activity')}</dt><dd>{activityName(s, t)} · {subtypeName(s.activity_subtype, t)}</dd></div>
          <div><dt>{t('Theme')}</dt><dd>{themeName(s.theme, t)}</dd></div>
          <div><dt>{t('Safety Rules')}</dt><dd>{t(SAFETY_NAMES[s.safety_level])}</dd></div>
          <div><dt>{t('Languages')}</dt><dd>{s.languages.map((l) => t(l)).join(', ')}</dd></div>
          <div><dt>{t('Teacher')}</dt><dd>{s.teacher}</dd></div>
          <div><dt>{t('Time')}</dt><dd>{at(s.started_at)} – {s.ended_at ? clock(end, t) : t('still running')} ({duration(end - fromSqlite(s.started_at), t)})</dd></div>
          {s.safety_level === 'custom' && (
            <>
              <div><dt>{t('Custom Blocked Words')}</dt><dd>{s.blocked_words.join(', ') || t('None')}</dd></div>
              <div><dt>{t('Custom Allowed Words')}</dt><dd>{s.allowed_words.join(', ') || t('None')}</dd></div>
            </>
          )}
        </dl>
      </section>
      <div className="t-stats t-stats--four">
        <Stat label={t('Requests')} value={totals.requests} tone="blue" />
        <Stat label={t('Pictures made')} value={totals.pictures} tone="green" />
        <Stat label={t('Blocked')} value={totals.blocked} tone="red" />
        <Stat label={t('Pages printed')} value={totals.pages} tone="purple" />
      </div>
      <ChartCard title={t('Every request')} empty={!data.requests.length}>
        <DataTable head={[t('Time'), t('Child #'), t('Said'), t('Status')]} rows={requestRows(data.requests)} />
      </ChartCard>
    </>
  )
}

function SafetyReport({ data, at }) {
  const t = useT()
  const s = data.totals
  const reviewed = s.kept + s.overridden
  const categories = data.categories.map((r) => ({ label: t(CATEGORY_NAMES[r.category] ?? r.category), value: r.n }))
  return (
    <>
      <div className="t-stats t-stats--four">
        <Stat label={t('Requests')} value={s.requests} tone="blue" />
        <Stat label={t('Blocked')} value={s.blocked} note={t('{p} of all requests', { p: percent(s.blocked, s.requests) })} tone="red" />
        <Stat label={t('Kept blocked')} value={s.kept} note={t('{p} of reviewed', { p: percent(s.kept, reviewed) })} tone="gray" />
        <Stat label={t('Overridden')} value={s.overridden} note={t('Possible false alarms: {p}', { p: percent(s.overridden, reviewed) })} tone="green" />
      </div>
      {s.pending > 0 && <p className="t-warn">{t(s.pending === 1 ? '1 blocked request has not been reviewed yet.' : '{n} blocked requests have not been reviewed yet.', { n: s.pending })}</p>}
      <div className="t-charts t-charts--print">
        <ChartCard title={t('Why requests were blocked')} empty={!categories.length}><BarList rows={categories} /></ChartCard>
        <ChartCard title={t('By safety level')} empty={!data.byLevel.length}>
          <DataTable
            head={[t('Safety level'), t('Requests'), t('Blocked'), t('Blocked %')]}
            rows={data.byLevel.map((l) => [t(SAFETY_NAMES[l.level]), l.requests, l.blocked, percent(l.blocked, l.requests)])}
          />
        </ChartCard>
        <ChartCard title={t('Words blocked most often')} empty={!data.topWords.length}>
          <DataTable head={[t('Word'), t('Reason'), t('Times')]} rows={data.topWords.map((w) => [w.category === 'personal_info' ? t(w.word) : w.word, t(CATEGORY_NAMES[w.category] ?? w.category), w.n])} />
        </ChartCard>
      </div>
      <ChartCard title={t('Every blocked request')} empty={!data.blocked.length}>
        <DataTable
          head={[t('Time'), t('Child #'), t('Said'), t('Reason'), t('Teacher review')]}
          rows={data.blocked.map((r) => [at(r.created_at), r.queue_number, `“${r.recognized_text}”`, blockReason(r, t), reviewText(r, t)])}
        />
      </ChartCard>
    </>
  )
}
