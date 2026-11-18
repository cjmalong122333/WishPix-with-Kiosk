'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BarChart3, ChevronRight, Layers, MonitorSmartphone, Pause, Play, Printer, RotateCw, Sparkles, Square } from 'lucide-react';
import { useT, type T } from '@/i18n';
import { api } from '@/lib/api';
import { activityName, PROBLEM_NAMES, themeName } from '@/lib/labels';
import { kioskStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useAuth, useLive } from '@/components/teacher/auth';
import { useConfirm } from '@/components/teacher/confirm';
import { Hero, NoticeBar, OnlinePill, SectionHead, Stat, Stats, Tint, type TintName } from '@/components/teacher/ui';

const CHIPS = [
  { id: 'online', label: 'Online', dot: 'bg-[#4ade80]' },
  { id: 'offline', label: 'Offline', dot: 'bg-[#94a3b8]' },
  { id: 'sleeping', label: 'Sleeping', dot: 'bg-[#facc15]' },
  { id: 'busy', label: 'Busy', dot: 'bg-[#fb7185]' },
  { id: 'printing', label: 'Printing', dot: 'bg-[#c084fc]' },
];

type Summary = { sessionsToday: number; printsToday: number; generatedToday: number; topTheme: { theme: string; count: number } | null };

function greeting(t: T) {
  const h = new Date().getHours();
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

export default function Dashboard() {
  const { teacher } = useAuth();
  const state = useLive();
  const t = useT();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [summary, setSummary] = useState<Summary | null>(null);
  const session = state?.session;
  const status = kioskStatus(state, t);

  const refresh = useCallback(() => {
    api<Summary>('/api/dashboard')
      .then(setSummary)
      .catch(() => {});
  }, []);
  // Load on open, and again whenever a picture finishes or a session changes.
  const mode = state?.mode;
  const sessionId = session?.id;
  useEffect(() => refresh(), [refresh, mode, sessionId]);

  async function act(path: string, message: string) {
    try {
      await api(path, { method: 'POST' });
      toast.success(message);
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
  }

  async function endSession() {
    const ok = await confirm({ title: t('End the current session?'), text: t('Children will not be able to make pictures until you start a new one.'), confirm: t('End Session'), danger: true });
    if (ok) await act('/api/sessions/current/end', t('Session ended and saved.'));
  }

  const picturesToday = summary?.generatedToday ?? 0;
  return (
    <div>
      <h1 className="m-0 text-2xl font-extrabold tracking-tight">
        {greeting(t)}, {teacher?.displayName}
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">{t("Here's what's happening at your kiosk today.")}</p>

      <Hero>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">
            <MonitorSmartphone size={18} className="text-[#e5daf5]" /> {t('Kiosk status')} • {state?.kioskName ?? t('Kiosk')}
          </span>
          <OnlinePill online={state?.kioskOnline} onText={t('Online')} offText={t('Offline')} />
        </div>
        <h2 className="mt-3.5 mb-1.5 text-[21px] font-extrabold">{status.title}</h2>
        <p className="m-0 max-w-[420px] text-sm leading-relaxed text-white/85">
          {session && state?.mode !== 'waiting' ? `${activityName(session, t)} · ${themeName(session.theme, t)}. ` : ''}
          {status.text}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <span
              key={c.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-white/80 opacity-75',
                status.chip === c.id ? 'border border-white/40 bg-white/20 text-white opacity-100' : 'bg-white/8'
              )}
            >
              <i className={cn('size-[7px] rounded-full', c.dot)} />
              {t(c.label)}
            </span>
          ))}
        </div>
      </Hero>

      {state?.printer?.problem && (
        <NoticeBar
          icon={<Printer size={16} className="text-danger" />}
          text={t('Printer: {problem}.', { problem: t(PROBLEM_NAMES[state.printer.problem] ?? state.printer.problem) })}
          href="/teacher/print"
          link={t('Fix it')}
          warn
        />
      )}

      <SectionHead title={t("Today's summary")}>
        <button className="border-0 bg-transparent p-0 text-[13px] font-semibold text-primary" onClick={refresh}>
          {t('Refresh')}
        </button>
      </SectionHead>
      <Stats>
        <Stat label={t('Total Sessions')} value={summary?.sessionsToday} note={t('Sessions run today')} icon={<Layers />} tone="blue" />
        <Stat
          label={t('Total Prints')}
          value={summary?.printsToday}
          note={t(picturesToday === 1 ? '1 picture generated' : '{n} pictures generated', { n: picturesToday })}
          icon={<Printer />}
          tone="purple"
        />
        <Stat
          label={t('Active Session')}
          value={session ? themeName(session.theme, t) : t('None')}
          note={session ? activityName(session, t) : t('Start one below')}
          icon={<Play />}
          tone="indigo"
          small={!!session}
        />
        <Stat
          label={t('Most Used Theme')}
          value={summary?.topTheme ? themeName(summary.topTheme.theme, t) : t('None yet')}
          note={summary?.topTheme ? t(summary.topTheme.count === 1 ? '1 picture today' : '{n} pictures today', { n: summary.topTheme.count }) : t('No pictures today')}
          icon={<BarChart3 />}
          tone="green"
          small
        />
      </Stats>

      <SectionHead title={t('Quick actions')} lead={t('Control the current session.')} />
      <button
        className="flex w-full items-center gap-3.5 rounded-[18px] border-0 bg-primary p-4 text-left text-white shadow-[0_8px_20px_rgba(48,35,68,0.18)]"
        onClick={() => router.push('/teacher/setup')}
      >
        <span className="grid size-[46px] place-items-center rounded-xl bg-white/20">
          <Play size={22} fill="currentColor" />
        </span>
        <span className="flex-1">
          <b className="block text-[17px]">{session ? t('Start New Session') : t('Start Session')}</b>
          <small className="text-[13px] text-white/85">{t('Set up mode, theme and safety')}</small>
        </span>
        <ChevronRight size={20} />
      </button>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {session?.status === 'paused' ? (
          <Action icon={<Play />} tone="green" title={t('Resume Session')} text={t('Let children make pictures again')} onClick={() => act('/api/sessions/current/resume', t('Session resumed.'))} />
        ) : (
          <Action icon={<Pause />} tone="gray" title={t('Pause Session')} text={t('Temporarily stop generation')} disabled={!session} onClick={() => act('/api/sessions/current/pause', t('Session paused.'))} />
        )}
        <Action icon={<Square fill="currentColor" />} tone="red" title={t('End Session')} text={t('Save logs and sync analytics')} disabled={!session} onClick={endSession} />
        <Action icon={<RotateCw />} tone="amber" title={t('Restart Kiosk')} text={t('Reload the kiosk screen')} disabled={!state?.kioskOnline} onClick={() => act('/api/kiosk/restart', t('Kiosk is restarting…'))} />
      </div>

      <NoticeBar
        icon={<Sparkles size={16} className="text-[#d4a017]" />}
        text={session ? t('Next: watch the children in Live Session.') : t('Next: decide which mode to run.')}
        href={session ? '/teacher/live' : '/teacher/setup'}
        link={session ? t('Live session') : t('Choose a mode')}
      />
      {confirmDialog}
    </div>
  );
}

function Action({ icon, tone, title, text, onClick, disabled }: { icon: React.ReactNode; tone: TintName; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="flex items-center gap-3.5 rounded-xl border bg-card px-3.5 py-3 text-left shadow-card transition hover:bg-accent disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <Tint tone={tone}>{icon}</Tint>
      <span>
        <b className="block text-[15px] text-foreground">{title}</b>
        <small className="text-xs text-muted-foreground">{text}</small>
      </span>
    </button>
  );
}
