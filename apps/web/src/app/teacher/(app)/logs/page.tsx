'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, LogIn, Mic, Monitor, Printer, Search, ShieldCheck, ShieldX, Zap, type LucideIcon } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { eventGroupOf, eventText, type LoggedEvent } from '@/lib/events';
import { activityName, blockReason, themeName } from '@/lib/labels';
import { requestStatus, when } from '@/lib/status';
import type { RequestItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Chips, Empty, ErrorText, PageTitle, Row, Tag, Thumb, Tint, type TintName } from '@/components/teacher/ui';

const PAGE = 30;
const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']] as const;
const STATUSES = [['all', 'All'], ['printed', 'Printed'], ['not_printed', 'Not printed'], ['blocked', 'Blocked'], ['failed', 'Failed']] as const;
const GROUPS = [['all', 'All'], ['sessions', 'Sessions'], ['moderation', 'Moderation'], ['printing', 'Printer'], ['kiosk', 'Kiosk'], ['account', 'Account']] as const;
const GROUP_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
  sessions: { icon: Zap, tone: 'indigo' },
  moderation: { icon: ShieldCheck, tone: 'red' },
  printing: { icon: Printer, tone: 'purple' },
  kiosk: { icon: Monitor, tone: 'blue' },
  account: { icon: LogIn, tone: 'gray' },
};

type Range = (typeof RANGES)[number][0];

// Everything that has happened: the children's requests, and what teachers
// and the system did. No child names are ever stored, only "Child #n".
export default function ActivityLogs() {
  const t = useT();
  const [tab, setTab] = useState<'requests' | 'events'>('requests');
  const [range, setRange] = useState<Range>('7d');
  return (
    <div>
      <PageTitle title={t('Activity Logs')} lead={t('Every request from the children, and every action by teachers and the kiosk.')} small />

      <div className="mt-4 mb-4 flex rounded-xl bg-accent p-1">
        {(
          [
            ['requests', "Children's requests"],
            ['events', 'Teacher & system'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={cn('flex-1 rounded-[9px] border-0 bg-transparent py-2 text-[13px] font-semibold text-muted-foreground', tab === id && 'bg-white text-primary shadow-sm')}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <Chips label={t('Date range')} options={RANGES.map(([id, l]) => [id, t(l)])} value={range} onChange={setRange} />
      {tab === 'requests' ? <RequestLog range={range} /> : <EventLog range={range} />}
    </div>
  );
}

// Loads pages of a list; changing `query` starts again from the top.
function usePagedList<T>(path: string, query: string) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    (offset: number) =>
      api<{ items: T[]; total: number }>(`${path}?${query}&limit=${PAGE}&offset=${offset}`)
        .then((res) => {
          setItems((old) => (offset === 0 ? res.items : [...old, ...res.items]));
          setTotal(res.total);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [path, query]
  );
  useEffect(() => void load(0), [load]);
  return { items, total, error, more: () => void load(items.length) };
}

function RequestLog({ range }: { range: Range }) {
  const t = useT();
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');

  // Search a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQ(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const query = new URLSearchParams({ range, status, q }).toString();
  const { items, total, error, more } = usePagedList<RequestItem>('/api/logs/requests', query);

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="relative min-w-[200px] flex-1 basis-full sm:basis-auto">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Search what the children said')} aria-label={t('Search what the children said')} className="bg-card pl-9" />
        </label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="flex-1 bg-card sm:w-40 sm:flex-initial" aria-label={t('Status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map(([id, l]) => (
              <SelectItem key={id} value={id}>
                {t(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" asChild disabled={!total} className="flex-1 sm:flex-initial">
          <a href={`/api/logs/requests/csv?${query}`} download className={cn(!total && 'pointer-events-none opacity-50')}>
            <Download /> {t('Download CSV')}
          </a>
        </Button>
      </div>

      {error && <ErrorText>{t.error(error)}</ErrorText>}
      {total != null && <p className="mt-3 mb-2.5 text-[13px] text-muted-foreground">{t(total === 1 ? '1 request' : '{n} requests', { n: total })}</p>}
      {total === 0 && <Empty icon={<Mic />} title={t('Nothing found')} text={t('Try a longer date range or another filter.')} />}

      <ul className="m-0 grid list-none gap-2 p-0">
        {items.map((r) => {
          const s = requestStatus(r, t);
          return (
            <li key={r.id}>
              <Row>
                {r.image_url ? (
                  <Thumb src={r.image_url} alt="" className="size-12" />
                ) : (
                  <Tint tone={r.block_category ? 'red' : 'gray'} size="lg" className="size-12 rounded-lg">
                    {r.block_category ? <ShieldX /> : <FileText />}
                  </Tint>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="truncate text-[15px]">“{r.recognized_text}”</b>
                  <small className="text-xs break-words text-muted-foreground">
                    {when(r.created_at, t)} · {t('Child #{n}', { n: r.queue_number })} · {themeName(r.theme, t)} · {activityName(r, t)}
                    {r.block_category ? ` · ${blockReason(r, t)}` : ''}
                  </small>
                </span>
                <Tag tone={s.tone}>{s.text}</Tag>
              </Row>
            </li>
          );
        })}
      </ul>
      {items.length < (total ?? 0) && (
        <Button variant="outline" className="mt-3 w-full" onClick={more}>
          {t('Show more')}
        </Button>
      )}
    </>
  );
}

function EventLog({ range }: { range: Range }) {
  const t = useT();
  const [group, setGroup] = useState<(typeof GROUPS)[number][0]>('all');
  const query = new URLSearchParams({ range, group }).toString();
  const { items, total, error, more } = usePagedList<LoggedEvent>('/api/logs/events', query);

  return (
    <>
      <div className="mt-3">
        <Chips label={t('Kind of action')} options={GROUPS.map(([id, l]) => [id, t(l)])} value={group} onChange={setGroup} />
      </div>
      {error && <ErrorText>{t.error(error)}</ErrorText>}
      {total != null && <p className="mt-3 mb-2.5 text-[13px] text-muted-foreground">{t(total === 1 ? '1 action' : '{n} actions', { n: total })}</p>}
      {total === 0 && <Empty icon={<LogIn />} title={t('Nothing found')} text={t('Try a longer date range or another filter.')} />}
      <ul className="m-0 grid list-none gap-2 p-0">
        {items.map((e) => {
          const { icon: Icon, tone } = GROUP_LOOK[eventGroupOf(e.type)];
          return (
            <li key={e.id}>
              <Row>
                <Tint tone={tone} size="lg" className="size-12 rounded-lg">
                  <Icon />
                </Tint>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="text-[15px] break-words">{eventText(e, t)}</b>
                  <small className="text-xs text-muted-foreground">
                    {e.teacher ? t('by {name}, {when}', { name: e.teacher, when: when(e.created_at, t) }) : `${t('Kiosk')} · ${when(e.created_at, t)}`}
                  </small>
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
      {items.length < (total ?? 0) && (
        <Button variant="outline" className="mt-3 w-full" onClick={more}>
          {t('Show more')}
        </Button>
      )}
    </>
  );
}
