'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Globe, Image as ImageIcon, MessageSquare, Mic, Moon, Pause, Play, Printer, ShieldCheck, ShieldX, Square, Sun, Zap } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { activityName, blockReason, PROBLEM_NAMES, SAFETY_NAMES, themeName } from '@/lib/labels';
import { clock, duration, kioskStatus, requestStatus, toDate, useNow, when } from '@/lib/status';
import type { KioskState, RequestItem, SessionView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/stepper';
import { useLive } from '@/components/teacher/auth';
import { useConfirm } from '@/components/teacher/confirm';
import { Empty, Hero, NoticeBar, OnlinePill, PageTitle, Row, SectionHead, Stat, Stats, Tag, Tint } from '@/components/teacher/ui';

const FLOW_MODES = ['listening', 'heard', 'processing', 'generating', 'printing', 'preview'];

type Data = { session: SessionView | null; requests?: RequestItem[]; counts?: Record<string, number> };

// What is happening on the kiosk right now, plus every request in the
// running session. Updates live as children use the kiosk.
export default function LiveSession() {
  const state = useLive();
  const t = useT();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const session = state?.session;

  const load = useCallback(() => {
    api<Data>('/api/sessions/current')
      .then(setData)
      .catch((e: Error) => toast.error(t.error(e.message)));
  }, [t]);
  // Reload whenever the kiosk moves on, a request is reviewed or a page prints.
  const deps = [session?.id, state?.mode, state?.current?.id, state?.pendingModeration, state?.printer?.printing?.requestId];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [load, ...deps]);

  async function act(path: string, message: string) {
    try {
      await api(path, { method: 'POST' });
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(t.error((err as Error).message));
      return false;
    }
  }

  async function end() {
    const ok = await confirm({ title: t('End the current session?'), text: t('Children will not be able to make pictures until you start a new one.'), confirm: t('End Session'), danger: true });
    if (ok && (await act('/api/sessions/current/end', t('Session ended and saved.')))) router.push('/teacher/dashboard');
  }

  if (state && !session) {
    return (
      <Empty icon={<Zap />} title={t('No session running')} text={t("Start a session to watch the children's requests here as they happen.")}>
        <Button asChild className="mt-2">
          <Link href="/teacher/setup">{t('Start Session')}</Link>
        </Button>
      </Empty>
    );
  }

  const counts = data?.counts;
  const requests = data?.session?.id === session?.id ? (data?.requests ?? []) : [];
  const pending = state?.pendingModeration ?? 0;

  return (
    <div>
      <PageTitle title={t('Live Session')} lead={session ? `${themeName(session.theme, t)} · ${activityName(session, t)}` : t('Loading…')} small>
        {session && (
          <Tag tone={session.status === 'paused' ? 'amber' : 'green'}>
            <i className="size-[7px] rounded-full bg-current" />
            {session.status === 'paused' ? t('Paused') : t('Active')}
          </Tag>
        )}
      </PageTitle>

      {session && <SessionFacts session={session} />}

      <NowCard state={state} onWake={() => act('/api/kiosk/wake', t('Waking the kiosk…'))} />

      <div className="mt-3 flex flex-wrap gap-2.5">
        {session?.status === 'paused' ? (
          <Button onClick={() => act('/api/sessions/current/resume', t('Session resumed.'))}>
            <Play fill="currentColor" /> {t('Resume')}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => act('/api/sessions/current/pause', t('Session paused.'))}>
            <Pause /> {t('Pause')}
          </Button>
        )}
        <Button variant="destructive" onClick={end}>
          <Square fill="currentColor" /> {t('End Session')}
        </Button>
      </div>

      <Stats className="mt-4">
        <Stat label={t('Requests')} value={counts?.requests} icon={<MessageSquare />} tone="blue" />
        <Stat label={t('Pictures made')} value={counts?.pictures} icon={<ImageIcon />} tone="green" />
        <Stat label={t('Blocked')} value={counts?.blocked} icon={<ShieldX />} tone="red" />
        <Stat label={t('Pages printed')} value={counts?.pages} icon={<Printer />} tone="purple" />
      </Stats>

      {pending > 0 && (
        <NoticeBar
          warn
          icon={<ShieldX size={16} />}
          text={t(pending === 1 ? '1 blocked request waiting for review.' : '{n} blocked requests waiting for review.', { n: pending })}
          href="/teacher/moderation"
          link={t('Review')}
        />
      )}
      {state?.printer?.problem && (
        <NoticeBar
          warn
          icon={<Printer size={16} />}
          text={t('Printer: {problem}.', { problem: t(PROBLEM_NAMES[state.printer.problem] ?? state.printer.problem) })}
          href="/teacher/print"
          link={t('Fix it')}
        />
      )}

      <SectionHead title={t('This session')}>
        <span className="text-[13px] text-muted-foreground">{t(requests.length === 1 ? '1 request' : '{n} requests', { n: requests.length })}</span>
      </SectionHead>
      {data && requests.length === 0 && <Empty icon={<Mic />} title={t('No requests yet')} text={t('When a child holds the talk button and says an idea, it appears here.')} />}
      <ul className="m-0 grid list-none gap-2 p-0">
        {requests.map((r) => (
          <li key={r.id}>
            <FeedRow r={r} />
          </li>
        ))}
      </ul>
      {confirmDialog}
    </div>
  );
}

function SessionFacts({ session }: { session: SessionView }) {
  const t = useT();
  const now = useNow();
  const started = toDate(session.started_at)!;
  const facts = [
    [Play, `${t('Started {time}', { time: clock(started, t) })} · ${duration(now - started.getTime(), t)}`],
    [ShieldCheck, t(SAFETY_NAMES[session.safety_level])],
    [Globe, session.languages.map((l) => t(l)).join(', ')],
  ] as const;
  return (
    <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
      {facts.map(([Icon, text], i) => (
        <li key={i} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[13px] text-muted-foreground">
          <Icon size={14} /> {text}
        </li>
      ))}
    </ul>
  );
}

function NowCard({ state, onWake }: { state: KioskState | null; onWake: () => void }) {
  const t = useT();
  const status = kioskStatus(state, t);
  const current = state?.current;
  const mode = state?.mode ?? '';
  const showFlow = state?.kioskOnline && FLOW_MODES.includes(mode);
  return (
    <Hero>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">
          {t('Right now')} · {state?.kioskName ?? t('Kiosk')}
        </span>
        <OnlinePill online={state?.kioskOnline} onText={t('Online')} offText={t('Offline')} />
      </div>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="mt-3.5 mb-1.5 text-[21px] font-extrabold">{status.title}</h2>
          {current?.recognizedText && [...FLOW_MODES, 'blocked', 'error'].includes(mode) ? (
            <p className="m-0 text-sm text-white/85">
              {current.queueNumber ? t('Child #{n} said', { n: current.queueNumber }) : t('The child said')} <b className="text-white">“{current.recognizedText}”</b>
              {current.override ? ` ${t('(overridden by teacher)')}` : ''}
            </p>
          ) : (
            <p className="m-0 text-sm text-white/85">{status.text}</p>
          )}
          {mode === 'preview' && current?.printProblem && (
            <p className="mt-2 rounded-lg bg-warning-bg/90 px-3 py-1.5 text-[13px] font-semibold text-amber-800">{t('Not printed: {problem}', { problem: t(current.printProblem) })}</p>
          )}
          {state?.screen?.sleeping && (
            <Button variant="secondary" className="mt-3" onClick={onWake}>
              <Sun /> {t('Wake the kiosk')}
            </Button>
          )}
        </div>
        {current?.imageUrl && ['printing', 'preview'].includes(mode) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="size-24 shrink-0 rounded-xl bg-white object-cover" src={current.imageUrl} alt={current.recognizedText} />
        )}
        {state?.screen?.sleeping && <Moon className="hidden shrink-0 text-[#e5daf5] sm:block" size={56} />}
      </div>
      {showFlow && (
        <div className="mt-4 rounded-xl bg-white/8 px-2 py-3">
          <Stepper mode={mode} size="sm" />
        </div>
      )}
    </Hero>
  );
}

function FeedRow({ r }: { r: RequestItem }) {
  const t = useT();
  const status = requestStatus(r, t);
  const reason = r.block_category ? ` · ${blockReason(r, t)}` : '';
  return (
    <Row href={r.moderation_status === 'pending' ? '/teacher/moderation' : undefined}>
      {r.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image_url} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
      ) : (
        <Tint tone={r.block_category ? 'red' : 'gray'} size="lg" className="size-12 rounded-lg">
          {r.block_category ? <ShieldX /> : <CheckCircle2 />}
        </Tint>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[15px] text-foreground">“{r.recognized_text}”</b>
        <small className={cn('text-xs break-words text-muted-foreground')}>
          {t('Child #{n}', { n: r.queue_number })} · {when(r.created_at, t)}
          {reason}
        </small>
      </span>
      <Tag tone={status.tone}>{status.text}</Tag>
    </Row>
  );
}
