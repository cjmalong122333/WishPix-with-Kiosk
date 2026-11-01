'use client';

import { Clock, Image as ImageIcon, MessageSquare, Printer, ShieldX, Zap } from 'lucide-react';
import { useT } from '@/i18n';
import { ACTIVITY_NAMES, CATEGORY_NAMES, SPEECH_LANGUAGES, subtypeName, themeName } from '@/lib/labels';
import { SERIES_COLORS } from '@/lib/report-info';
import { fromDay, percent, seconds, shortDate } from '@/lib/status';
import { cn } from '@/lib/utils';
import { BarList, ChartCard, ColumnChart, DataTable } from './charts';
import { Stat } from './ui';

export type Stats = {
  range: { from: string | null; to: string | null };
  totals: Record<string, number>;
  perDay: { day: string; requests: number; pictures: number; blocked: number; failed: number }[];
  hours: number[];
  themes: { theme: string; n: number }[];
  activities: { activity_type: string; activity_subtype: string; n: number }[];
  categories: { category: string; n: number }[];
  languages: { language: string; n: number }[];
};

// The numbers and charts on the Analytics page; also inside the Daily summary report.
export function StatsView({ data, printable }: { data: Stats; printable?: boolean }) {
  const t = useT();
  const s = data.totals;
  const asked = s.requests - s.blocked;
  const series = [
    { key: 'pictures', label: t('Pictures made'), color: SERIES_COLORS[0] },
    { key: 'blocked', label: t('Blocked'), color: SERIES_COLORS[1] },
    { key: 'failed', label: t('Failed'), color: SERIES_COLORS[2] },
  ];
  const days = data.perDay.map((d) => ({ label: shortDate(fromDay(d.day), t), tip: shortDate(fromDay(d.day), t), values: d as unknown as Record<string, number> }));
  const busyHours = data.hours
    .map((n, h) => ({ h, n }))
    .filter((_x, i, all) => all.slice(0, i + 1).some((y) => y.n) && all.slice(i).some((y) => y.n));
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(t.locale, { hour: 'numeric' });

  const themes = data.themes.map((r) => ({ label: themeName(r.theme, t), value: r.n }));
  const activities = data.activities.map((r) => ({ label: `${t(ACTIVITY_NAMES[r.activity_type] ?? r.activity_type)} · ${subtypeName(r.activity_subtype, t)}`, value: r.n }));
  const categories = data.categories.map((r) => ({ label: t(CATEGORY_NAMES[r.category] ?? r.category), value: r.n }));
  const languages = data.languages.map((r) => ({ label: t(SPEECH_LANGUAGES[r.language] ?? r.language), value: r.n }));
  const listTable = (rows: { label: string; value: number }[], head: string) => <DataTable head={[head, t('Count')]} rows={rows.map((r) => [r.label, r.value])} />;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('Requests')} value={s.requests} note={t(s.sessions === 1 ? 'In 1 session' : 'In {n} sessions', { n: s.sessions })} icon={<MessageSquare />} tone="blue" />
        <Stat label={t('Pictures made')} value={s.pictures} note={t('{p} of allowed requests', { p: percent(s.pictures, asked) })} icon={<ImageIcon />} tone="green" />
        <Stat label={t('Pages printed')} value={s.pages} note={t(s.reprints === 1 ? 'Including 1 reprint' : 'Including {n} reprints', { n: s.reprints })} icon={<Printer />} tone="purple" />
        <Stat label={t('Blocked')} value={s.blocked} note={t('{p} of all requests', { p: percent(s.blocked, s.requests) })} icon={<ShieldX />} tone="red" />
        <Stat label={t('Average wait')} value={seconds(s.avgSeconds, t)} note={t('From speaking to picture')} icon={<Clock />} tone="amber" small />
        <Stat
          label={t('Teacher overrides')}
          value={percent(s.overridden, s.kept + s.overridden)}
          note={t('{o} overridden, {k} kept blocked', { o: s.overridden, k: s.kept })}
          icon={<Zap />}
          tone="indigo"
          small
        />
      </div>

      <div className={cn('mt-4 grid gap-3', printable ? 'grid-cols-2' : 'lg:grid-cols-2')}>
        {days.length > 1 && (
          <div className="lg:col-span-2">
            <ChartCard
              title={t('Requests per day')}
              subtitle={t('What happened to each request')}
              legend={series}
              empty={s.requests === 0}
              table={<DataTable head={[t('Day'), ...series.map((x) => x.label)]} rows={days.map((d) => [d.label, ...series.map((x) => d.values[x.key] ?? 0)])} />}
            >
              <ColumnChart rows={days} series={series} labelEvery={days.length > 14 ? 7 : days.length > 7 ? 2 : 1} />
            </ChartCard>
          </div>
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
        <ChartCard title={t('Why requests were blocked')} subtitle={t('Safety categories')} empty={!categories.length} table={listTable(categories, t('Reason'))}>
          <BarList rows={categories} />
        </ChartCard>
        <ChartCard title={t('Languages spoken')} subtitle={t('Chosen at the kiosk')} empty={!languages.length} table={listTable(languages, t('Language'))}>
          <BarList rows={languages} />
        </ChartCard>
      </div>
    </>
  );
}
