'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban, Bot, CircleCheck, EyeOff, FlaskConical, Frown, Ghost, Hand, HeartCrack, MessageSquareWarning, Phone, ShieldAlert, ShieldCheck,
  ShieldX, Skull, Swords, Wine, type LucideIcon,
} from 'lucide-react';
import { useT, type T } from '@/i18n';
import { api } from '@/lib/api';
import { activityName, blockReason, CATEGORY_NAMES, SAFETY_NAMES, themeName } from '@/lib/labels';
import { when } from '@/lib/status';
import type { RequestItem, SessionView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLive } from '@/components/teacher/auth';
import { useConfirm } from '@/components/teacher/confirm';
import { Empty, ErrorText, PageTitle, Panel, Stat, Stats, TINTS, type TintName } from '@/components/teacher/ui';

// Icon and color for each safety category (src/server/safety.ts).
const CATEGORY_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
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
};

const OUTCOME_MESSAGES: Record<string, string> = {
  now: 'Overridden. The kiosk is making the picture now.',
  queued: 'Overridden. The picture will be made when the kiosk is free.',
  saved: 'Overridden and saved. That session has ended, so no picture was made.',
};

type Summary = { pending: number; blockedToday: number; keptToday: number; overriddenToday: number };

function outcome(item: RequestItem, t: T): { tone: 'kept' | 'ok' | 'bad' | 'wait'; text: string } {
  if (item.moderation_status === 'kept_blocked') return { tone: 'kept', text: t('Kept blocked') };
  if (item.status === 'success') return { tone: 'ok', text: item.print_status === 'printed' ? t('Overridden · picture printed') : t('Overridden · picture made') };
  if (item.status === 'failed') return { tone: 'bad', text: t('Overridden · the picture failed') };
  if (['processing', 'generating'].includes(item.status)) return { tone: 'wait', text: t('Overridden · making the picture') };
  if (item.queued) return { tone: 'wait', text: t('Overridden · waiting for the kiosk') };
  return { tone: 'kept', text: t('Overridden · no picture (session had ended)') };
}

export default function Moderation() {
  const live = useLive();
  const t = useT();
  const [confirm, confirmDialog] = useConfirm();
  const [view, setView] = useState<'pending' | 'reviewed'>('pending');
  const [data, setData] = useState<{ items: RequestItem[]; summary: Summary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null); // id of the request being reviewed
  const pending = live?.pendingModeration;
  const mode = live?.mode;

  const load = useCallback(() => {
    api<{ items: RequestItem[]; summary: Summary }>(`/api/moderation?view=${view}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [view]);
  // Reload when a new request is blocked, and as overridden pictures move along.
  useEffect(() => load(), [load, pending, mode]);

  async function review(item: RequestItem, decision: 'keep' | 'override') {
    if (decision === 'override') {
      const ok = await confirm({ title: t('Make a picture of “{text}” anyway?', { text: item.recognized_text }), confirm: t('Override') });
      if (!ok) return;
    }
    setBusy(item.id);
    try {
      const res = await api<{ outcome: string }>(`/api/moderation/${item.id}/${decision}`, { method: 'POST' });
      toast.success(decision === 'keep' ? t('Kept blocked.') : t(OUTCOME_MESSAGES[res.outcome]));
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
    setBusy(null);
    load();
  }

  const summary = data?.summary;
  const items = data?.items ?? [];

  return (
    <div>
      <PageTitle title={t('Moderation Center')} lead={t('Requests the safety checks stopped. Keep them blocked, or override to make the picture.')} small />

      <Stats className="mt-4">
        <Stat label={t('Waiting for review')} value={summary?.pending} tone="red" icon={<ShieldAlert />} />
        <Stat label={t('Blocked today')} value={summary?.blockedToday} tone="orange" icon={<ShieldX />} />
        <Stat label={t('Kept blocked today')} value={summary?.keptToday} tone="gray" icon={<Ban />} />
        <Stat label={t('Overridden today')} value={summary?.overriddenToday} tone="green" icon={<CircleCheck />} />
      </Stats>

      <div className="mt-4 mb-4 flex rounded-xl bg-accent p-1">
        {(
          [
            ['pending', 'Needs review', summary?.pending],
            ['reviewed', 'Reviewed', 0],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border-0 bg-transparent py-2 text-[13px] font-semibold text-muted-foreground',
              view === id && 'bg-white text-primary shadow-sm'
            )}
            onClick={() => setView(id)}
            aria-pressed={view === id}
          >
            {t(label)}
            {!!count && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{count}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorText>{t.error(error)}</ErrorText>}

      {data && items.length === 0 && (
        <Empty
          icon={<ShieldCheck />}
          title={view === 'pending' ? t('All clear!') : t('Nothing reviewed yet')}
          text={view === 'pending' ? t('No blocked requests are waiting. New ones appear here right away.') : t('Requests you keep blocked or override are listed here.')}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <ModCard key={item.id} item={item} busy={busy === item.id} onReview={(d) => review(item, d)} />
        ))}
      </div>

      <FilterTest session={live?.session ?? null} />
      {confirmDialog}
    </div>
  );
}

function ModCard({ item, busy, onReview }: { item: RequestItem; busy: boolean; onReview: (d: 'keep' | 'override') => void }) {
  const t = useT();
  const { icon: Icon, tone } = CATEGORY_LOOK[item.block_category ?? ''] ?? CATEGORY_LOOK.custom;
  const isPending = item.moderation_status === 'pending';
  const result = !isPending ? outcome(item, t) : null;
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', TINTS[tone])}>
          <Icon size={14} /> {t(CATEGORY_NAMES[item.block_category ?? ''] ?? item.block_category ?? '')}
          {item.block_source === 'ai' && <Bot size={14} aria-label={t('AI safety check')} />}
        </span>
        <small className="text-xs text-muted-foreground">
          {t('Child #{n}', { n: item.queue_number })} · {when(item.created_at, t)}
        </small>
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-lg font-bold break-words text-foreground">“{item.recognized_text}”</p>
          <p className="m-0 mt-1 text-[13px] text-danger">{blockReason(item, t)}</p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            {themeName(item.theme, t)} · {activityName(item, t)} · {t(SAFETY_NAMES[item.safety_level ?? ''] ?? '')}
            {item.session_status === 'ended' && ` · ${t('session ended')}`}
          </p>
        </div>
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="size-20 shrink-0 rounded-lg border object-cover" src={item.image_url} alt={t('Picture of {text}', { text: item.recognized_text })} />
        )}
      </div>
      {isPending ? (
        <>
          <div className="flex flex-wrap gap-2.5 sm:flex-nowrap">
            <Button variant="outline" className="min-w-[120px] flex-1" onClick={() => onReview('keep')} disabled={busy}>
              <Ban /> {t('Keep Blocked')}
            </Button>
            <Button className="min-w-[120px] flex-1" onClick={() => onReview('override')} disabled={busy}>
              <CircleCheck /> {t('Override')}
            </Button>
          </div>
          {item.session_status === 'ended' && <p className="m-0 text-[11px] text-muted-foreground">{t('This session has ended, so Override only saves your decision.')}</p>}
        </>
      ) : (
        result && (
          <p
            className={cn(
              'm-0 flex flex-col rounded-lg px-3 py-2 text-[13px] font-bold',
              result.tone === 'ok' && 'bg-success-bg text-success',
              result.tone === 'bad' && 'bg-danger-bg text-danger',
              result.tone === 'wait' && 'bg-accent text-primary',
              result.tone === 'kept' && 'bg-muted text-muted-foreground'
            )}
          >
            {result.text}
            <small className="font-medium opacity-80">
              {item.moderated_by_name ? t('by {name}, {when}', { name: item.moderated_by_name, when: when(item.moderated_at, t) }) : when(item.moderated_at, t)}
            </small>
          </p>
        )
      )}
    </Panel>
  );
}

type Check = { text?: string; level?: string; allowed?: boolean; category?: string; matched?: string; reason?: string; error?: string };

// Lets the teacher check a phrase before the children try it.
function FilterTest({ session }: { session: SessionView | null }) {
  const t = useT();
  const [text, setText] = useState('');
  const [result, setResult] = useState<Check | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      setResult({ text: text.trim(), ...(await api<Check>('/api/safety/check', { method: 'POST', body: { text } })) });
    } catch (err) {
      setResult({ error: t.error((err as Error).message) });
    }
  }

  const level = result?.level ? t(SAFETY_NAMES[result.level]) : '';
  return (
    <Panel className="mt-6">
      <h2 className="m-0 flex items-center gap-2 text-base font-bold">
        <FlaskConical size={18} /> {t('Test the safety filter')}
      </h2>
      <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">
        {session ? t("Uses this session's {level} rules.", { level: t(SAFETY_NAMES[session.safety_level]) }) : t('Uses the STANDARD rules.')} {t('Nothing is sent to the kiosk.')}
      </p>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={check}>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder={t('e.g. a big red fire truck')}
          aria-label={t('Phrase to test')}
          maxLength={200}
        />
        <Button type="submit">{t('Check')}</Button>
      </form>
      {result?.error && <ErrorText>{result.error}</ErrorText>}
      {result && !result.error && (
        <p className={cn('mt-3 mb-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold', result.allowed ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger')} role="status">
          {result.allowed ? <CircleCheck size={16} /> : <ShieldX size={16} />}
          {result.allowed ? t('Allowed under {level}.', { level }) : t('Blocked under {level}: {reason}', { level, reason: blockReason(result, t) })}
        </p>
      )}
    </Panel>
  );
}
