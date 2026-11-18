'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useT, type T } from '@/i18n';
import { api } from '@/lib/api';
import { activityName, blockReason, CATEGORY_NAMES, SAFETY_NAMES, subtypeName, themeName } from '@/lib/labels';
import { downloadCsv, reportTitle, type ReportParams } from '@/lib/report-info';
import { clock, duration, percent, requestStatus, shortDate, toDate } from '@/lib/status';
import type { RequestItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { BarList, ChartCard, DataTable } from '@/components/teacher/charts';
import { StatsView, type Stats } from '@/components/teacher/stats-view';
import { ErrorText, Stat, Warn } from '@/components/teacher/ui';

type SessionRow = { id: number; theme: string; activity_type: string; activity_subtype: string; started_at: string; requests: number; pictures: number };
type ReportData = Stats & {
  params: ReportParams;
  sessions: SessionRow[];
  session: Record<string, unknown> & { languages: string[]; blocked_words: string[]; allowed_words: string[] };
  requests: RequestItem[];
  blocked: RequestItem[];
  byLevel: { level: string; requests: number; blocked: number }[];
  topWords: { word: string; category: string; n: number }[];
};
type Report = { id: number; type: string; created_at: string; data: ReportData };

// One saved report, laid out to read on screen or print / save as PDF.
export default function ReportView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ report: Report }>(`/api/reports/${id}`)
      .then((r) => setReport(r.report))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <ErrorText>{t.error(error)}</ErrorText>;
  if (!report) return <p className="text-[13px] text-muted-foreground">{t('Loading…')}</p>;

  const { type, data } = report;
  const title = reportTitle(type, data.params, t);
  const at = (time: unknown) => {
    const d = toDate(time)!;
    return `${shortDate(d, t)} ${clock(d, t)}`;
  };
  const requestRows = (list: RequestItem[]) => list.map((r) => [at(r.created_at), r.queue_number, r.recognized_text, requestStatus(r, t).text]);

  function csv() {
    const name = `wishpix-report-${report!.id}.csv`;
    if (type === 'session') downloadCsv(name, [t('Time'), t('Child #'), t('Said'), t('Status')], requestRows(data.requests));
    else if (type === 'safety')
      downloadCsv(
        name,
        [t('Time'), t('Child #'), t('Said'), t('Reason'), t('Teacher review')],
        data.blocked.map((r) => [at(r.created_at), r.queue_number, r.recognized_text, blockReason(r, t), reviewText(r, t)])
      );
    else
      downloadCsv(
        name,
        [t('Session'), t('Theme'), t('Mode'), t('Started'), t('Requests'), t('Pictures made')],
        data.sessions.map((s) => [s.id, themeName(s.theme, t), activityName(s, t), at(s.started_at), s.requests, s.pictures])
      );
  }

  return (
    <article className="grid gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/teacher/reports">
            <ArrowLeft /> {t('Reports')}
          </Link>
        </Button>
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={csv}>
          <Download /> {t('Download CSV')}
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> {t('Print / Save as PDF')}
        </Button>
      </div>

      <header className="border-b pb-3">
        <p className="m-0 text-xs font-bold tracking-[0.1em] text-primary uppercase">WishPix · {t('Teacher App')}</p>
        <h1 className="m-0 mt-1 text-2xl font-extrabold">{title}</h1>
        <small className="text-[13px] text-muted-foreground">{t('Made {when}', { when: at(report.created_at) })}</small>
      </header>

      {type === 'daily' && <DailyReport data={data} at={at} />}
      {type === 'session' && <SessionReport data={data} at={at} requestRows={requestRows} madeAt={report.created_at} />}
      {type === 'safety' && <SafetyReport data={data} at={at} />}

      <p className="m-0 text-xs text-muted-foreground">{t('No child names are stored by WishPix. Children are shown only as “Child #” in the order they used the kiosk.')}</p>
    </article>
  );
}

function reviewText(r: RequestItem, t: T) {
  if (r.moderation_status === 'kept_blocked') return t('Kept blocked');
  if (r.moderation_status === 'overridden') return t('Overridden');
  return t('Not reviewed');
}

type At = (time: unknown) => string;

function DailyReport({ data, at }: { data: ReportData; at: At }) {
  const t = useT();
  return (
    <>
      <StatsView data={data} printable />
      <ChartCard title={t('Sessions that day')} empty={!data.sessions.length}>
        <DataTable
          head={[t('Session'), t('Theme'), t('Mode'), t('Started'), t('Requests'), t('Pictures made')]}
          rows={data.sessions.map((s) => [`#${s.id}`, themeName(s.theme, t), `${activityName(s, t)} · ${subtypeName(s.activity_subtype, t)}`, at(s.started_at), s.requests, s.pictures])}
        />
      </ChartCard>
    </>
  );
}

function SessionReport({ data, at, requestRows, madeAt }: { data: ReportData; at: At; requestRows: (l: RequestItem[]) => unknown[][]; madeAt: string }) {
  const t = useT();
  const s = data.session;
  // A session still running when the report was made is measured up to that moment.
  const end = toDate(s.ended_at ?? madeAt)!;
  const start = toDate(s.started_at)!;
  const totals = data.totals;
  const facts: [string, React.ReactNode][] = [
    [t('Mode'), `${activityName({ activity_type: String(s.activity_type) }, t)} · ${subtypeName(String(s.activity_subtype), t)}`],
    [t('Theme'), themeName(String(s.theme), t)],
    [t('Safety Rules'), t(SAFETY_NAMES[String(s.safety_level)])],
    [t('Languages'), s.languages.map((l) => t(l)).join(', ')],
    [t('Teacher'), String(s.teacher)],
    [t('Time'), `${at(s.started_at)} – ${s.ended_at ? clock(end, t) : t('still running')} (${duration(end.getTime() - start.getTime(), t)})`],
  ];
  if (s.safety_level === 'custom') {
    facts.push([t('Custom Blocked Words'), s.blocked_words.join(', ') || t('None')], [t('Custom Allowed Words'), s.allowed_words.join(', ') || t('None')]);
  }
  return (
    <>
      <ChartCard title={t('Session settings')}>
        <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
              <dd className="m-0 mt-0.5 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </ChartCard>
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('Requests')} value={totals.requests} tone="blue" />
        <Stat label={t('Pictures made')} value={totals.pictures} tone="green" />
        <Stat label={t('Blocked')} value={totals.blocked} tone="red" />
        <Stat label={t('Pages printed')} value={totals.pages} tone="purple" />
      </div>
      <ChartCard title={t('Every request')} empty={!data.requests.length}>
        <DataTable head={[t('Time'), t('Child #'), t('Said'), t('Status')]} rows={requestRows(data.requests) as (string | number)[][]} />
      </ChartCard>
    </>
  );
}

function SafetyReport({ data, at }: { data: ReportData; at: At }) {
  const t = useT();
  const s = data.totals;
  const reviewed = s.kept + s.overridden;
  const categories = data.categories.map((r) => ({ label: t(CATEGORY_NAMES[r.category] ?? r.category), value: r.n }));
  return (
    <>
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('Requests')} value={s.requests} tone="blue" />
        <Stat label={t('Blocked')} value={s.blocked} note={t('{p} of all requests', { p: percent(s.blocked, s.requests) })} tone="red" />
        <Stat label={t('Kept blocked')} value={s.kept} note={t('{p} of reviewed', { p: percent(s.kept, reviewed) })} tone="gray" />
        <Stat label={t('Overridden')} value={s.overridden} note={t('Possible false alarms: {p}', { p: percent(s.overridden, reviewed) })} tone="green" />
      </div>
      {s.pending > 0 && <Warn>{t(s.pending === 1 ? '1 blocked request has not been reviewed yet.' : '{n} blocked requests have not been reviewed yet.', { n: s.pending })}</Warn>}
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
        <ChartCard title={t('Why requests were blocked')} empty={!categories.length}>
          <BarList rows={categories} />
        </ChartCard>
        <ChartCard title={t('By safety level')} empty={!data.byLevel.length}>
          <DataTable
            head={[t('Safety level'), t('Requests'), t('Blocked'), t('Blocked %')]}
            rows={data.byLevel.map((l) => [t(SAFETY_NAMES[l.level]), l.requests, l.blocked, percent(l.blocked, l.requests)])}
          />
        </ChartCard>
        <ChartCard title={t('Words blocked most often')} empty={!data.topWords.length}>
          <DataTable
            head={[t('Word'), t('Reason'), t('Times')]}
            rows={data.topWords.map((w) => [w.category === 'personal_info' ? t(w.word) : w.word, t(CATEGORY_NAMES[w.category] ?? w.category), w.n])}
          />
        </ChartCard>
      </div>
      <ChartCard title={t('Every blocked request')} empty={!data.blocked.length}>
        <DataTable
          head={[t('Time'), t('Child #'), t('Said'), t('Reason'), t('Teacher review')]}
          rows={data.blocked.map((r) => [at(r.created_at), r.queue_number, `“${r.recognized_text}”`, blockReason(r, t), reviewText(r, t)])}
        />
      </ChartCard>
    </>
  );
}
