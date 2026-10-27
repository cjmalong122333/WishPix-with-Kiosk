import { useEffect, useState } from 'react'
import { Clock, Image, MessageSquare, Printer, ShieldX, Zap } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { ACTIVITY_NAMES, CATEGORY_NAMES, SPEECH_LANGUAGES, subtypeName, themeName } from './labels.js'
import { fromDay, percent, seconds, shortDate } from './status.js'
import { BarList, ChartCard, ColumnChart, DataTable } from './charts.jsx'
import { SERIES_COLORS } from './chartColors.js'
import Chips from './Chips.jsx'
import Stat from './Stat.jsx'

const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']]

// Headline numbers and charts about how the kiosk is used.
export default function Analytics() {
  const { call } = useAuth()
  const t = useT()
  const [range, setRange] = useState('7d')
  const [data, setData] = useState(null) // { range, stats }
  const [error, setError] = useState(null)
  const loading = data?.range !== range

  useEffect(() => {
    let stop = false
    call(`/api/analytics?range=${range}`)
      .then((stats) => { if (!stop) { setData({ range, stats }); setError(null) } })
      .catch((e) => !stop && setError(e.message))
    return () => { stop = true }
  }, [call, range])

  return (
    <div className="t-analytics">
      <h1 className="t-h1 t-h1--sm">{t('Analytics')}</h1>
      <p className="t-lead">{t('How the children use the kiosk, and how well it works.')}</p>
      <Chips label={t('Date range')} options={RANGES.map(([id, l]) => [id, t(l)])} value={range} onChange={setRange} />
      {error && <p className="t-error" role="alert">{t.error(error)}</p>}
      {/* While a new range loads, the old numbers stay, faded. */}
      {data && <div className={loading ? 't-loading' : ''}><StatsView data={data.stats} /></div>}
    </div>
  )
}

// The numbers and charts; also used inside the Daily summary report.
export function StatsView({ data, printable }) {
  const t = useT()
  const s = data.totals
  const asked = s.requests - s.blocked
  const series = [
    { key: 'pictures', label: t('Pictures made'), color: SERIES_COLORS[0] },
    { key: 'blocked', label: t('Blocked'), color: SERIES_COLORS[1] },
    { key: 'failed', label: t('Failed'), color: SERIES_COLORS[2] },
  ]
  const days = data.perDay.map((d) => ({ label: shortDate(fromDay(d.day), t), tip: shortDate(fromDay(d.day), t), values: d, day: d.day }))
  const busyHours = data.hours.map((n, h) => ({ h, n })).filter((x, i, all) => all.slice(0, i + 1).some((y) => y.n) && all.slice(i).some((y) => y.n))
  const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(t.locale, { hour: 'numeric' })

  const themes = data.themes.map((r) => ({ label: themeName(r.theme, t), value: r.n }))
  const activities = data.activities.map((r) => ({ label: `${t(ACTIVITY_NAMES[r.activity_type])} · ${subtypeName(r.activity_subtype, t)}`, value: r.n }))
  const categories = data.categories.map((r) => ({ label: t(CATEGORY_NAMES[r.category] ?? r.category), value: r.n }))
  const languages = data.languages.map((r) => ({ label: t(SPEECH_LANGUAGES[r.language] ?? r.language), value: r.n }))
  const listTable = (rows, head) => <DataTable head={[head, t('Count')]} rows={rows.map((r) => [r.label, r.value])} />

  return (
    <>
      <div className="t-stats t-stats--four">
        <Stat label={t('Requests')} value={s.requests} note={t(s.sessions === 1 ? 'In 1 session' : 'In {n} sessions', { n: s.sessions })} icon={<MessageSquare size={18} />} tone="blue" />
        <Stat label={t('Pictures made')} value={s.pictures} note={t('{p} of allowed requests', { p: percent(s.pictures, asked) })} icon={<Image size={18} />} tone="green" />
        <Stat label={t('Pages printed')} value={s.pages} note={t(s.reprints === 1 ? 'Including 1 reprint' : 'Including {n} reprints', { n: s.reprints })} icon={<Printer size={18} />} tone="purple" />
        <Stat label={t('Blocked')} value={s.blocked} note={t('{p} of all requests', { p: percent(s.blocked, s.requests) })} icon={<ShieldX size={18} />} tone="red" />
        <Stat label={t('Average wait')} value={seconds(s.avgSeconds, t)} note={t('From speaking to picture')} icon={<Clock size={18} />} tone="amber" small />
        <Stat
          label={t('Teacher overrides')}
          value={percent(s.overridden, s.kept + s.overridden)}
          note={t('{o} overridden, {k} kept blocked', { o: s.overridden, k: s.kept })}
          icon={<Zap size={18} />}
          tone="indigo"
          small
        />
      </div>

      <div className={`t-charts ${printable ? 't-charts--print' : ''}`}>
        {days.length > 1 && (
          <ChartCard
            title={t('Requests per day')}
            subtitle={t('What happened to each request')}
            legend={series}
            empty={s.requests === 0}
            table={<DataTable head={[t('Day'), ...series.map((x) => x.label)]} rows={days.map((d) => [d.label, ...series.map((x) => d.values[x.key] ?? 0)])} />}
          >
            <ColumnChart rows={days} series={series} labelEvery={days.length > 14 ? 7 : days.length > 7 ? 2 : 1} />
          </ChartCard>
        )}
        <ChartCard
          title={t('Busiest times')}
          subtitle={t('Requests by hour of the day')}
          empty={s.requests === 0}
          table={<DataTable head={[t('Hour'), t('Requests')]} rows={busyHours.map((x) => [hourLabel(x.h), x.n])} />}
        >
          <ColumnChart
            rows={busyHours.map((x) => ({ label: hourLabel(x.h), values: { n: x.n } }))}
            series={[{ key: 'n', label: t('Requests'), color: SERIES_COLORS[0] }]}
            labelEvery={busyHours.length > 8 ? 2 : 1}
            height={140}
          />
        </ChartCard>
        <ChartCard title={t('Top themes')} subtitle={t('Pictures made per theme')} empty={!themes.length} table={listTable(themes, t('Theme'))}>
          <BarList rows={themes} />
        </ChartCard>
        <ChartCard title={t('Activities')} subtitle={t('Requests per activity')} empty={!activities.length} table={listTable(activities, t('Activity'))}>
          <BarList rows={activities} />
        </ChartCard>
        <ChartCard title={t('Why requests were blocked')} subtitle={t('Safety filter categories')} empty={!categories.length} table={listTable(categories, t('Reason'))}>
          <BarList rows={categories} />
        </ChartCard>
        <ChartCard title={t('Languages spoken')} subtitle={t('Chosen on the child’s phone')} empty={!languages.length} table={listTable(languages, t('Language'))}>
          <BarList rows={languages} />
        </ChartCard>
      </div>
    </>
  )
}
