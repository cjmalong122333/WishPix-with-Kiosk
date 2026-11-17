'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bot, Check, Cpu, Database, ExternalLink, HardDrive, Image as ImageIcon, Mic, Monitor, Moon, Pencil, Printer, RotateCw, Sun, SunDim, Wifi, X } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { PROBLEM_NAMES } from '@/lib/labels';
import { duration, kioskStatus, toDate, useNow, when } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useLive } from '@/components/teacher/auth';
import { useConfirm } from '@/components/teacher/confirm';
import { Hero, OnlinePill, PageTitle, Panel, SectionHead, Tint, type TintName } from '@/components/teacher/ui';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

type Info = {
  name: string;
  firmware: string;
  lastSeen: string | null;
  online: boolean;
  connectedAt: string | null;
  autoSleep: boolean;
  autoSleepMinutes: number;
  storage: { files: number; bytes: number };
};
type Health = { internet?: boolean; database?: boolean };
type Provider = { provider: string; model: string | null; fallback?: string | null };
type System = { version: string; speech: Provider; safety: Provider; images: Provider; printer: { reachable: boolean; mode: string | null; name: string | null } };

export default function KioskManagement() {
  const state = useLive();
  const t = useT();
  const [confirm, confirmDialog] = useConfirm();
  const [info, setInfo] = useState<Info | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const status = kioskStatus(state, t);
  const now = useNow();

  const load = useCallback(() => {
    api<Info>('/api/kiosk')
      .then(setInfo)
      .catch((e: Error) => toast.error(t.error(e.message)));
  }, [t]);
  const checkHealth = useCallback(() => {
    api<Health>('/api/health')
      .then(setHealth)
      .catch(() => setHealth({}));
    api<System>('/api/system')
      .then(setSystem)
      .catch(() => {});
  }, []);
  useEffect(() => load(), [load, state?.kioskOnline, state?.kioskName]);
  useEffect(() => checkHealth(), [checkHealth]);

  async function act(path: string, message: string, method = 'POST', body?: unknown) {
    try {
      await api(path, { method, body });
      toast.success(message);
      load();
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
  }

  const sleeping = state?.screen?.sleeping;
  const printer = state?.printer;
  const printerText = printer?.problem
    ? t(PROBLEM_NAMES[printer.problem] ?? printer.problem)
    : printer?.lowPaper
      ? t('Paper is low')
      : printer?.lowInk
        ? t('Ink is low')
        : t('Ready');
  const pictures = info?.storage.files ?? 0;
  const connectedAt = toDate(info?.connectedAt);

  return (
    <div>
      <PageTitle title={t('Kiosk Management')} lead={t('The kiosk screen, its health and its controls.')} small />

      <Hero>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">
            <Monitor size={18} className="text-[#e5daf5]" /> {t('Kiosk')}
          </span>
          <OnlinePill online={state?.kioskOnline} onText={t('Online')} offText={t('Offline')} />
        </div>
        <KioskName name={state?.kioskName ?? info?.name} onSave={(name) => act('/api/kiosk', t('Kiosk renamed.'), 'PATCH', { name })} />
        <p className="m-0 max-w-[460px] text-sm text-white/85">{status.text}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            [info?.online ? t('Connected for') : t('Last seen'), info ? (info.online && connectedAt ? duration(now - connectedAt.getTime(), t) : when(info.lastSeen, t) || t('Never')) : '–'],
            [t('Screen'), state?.kioskOnline ? (sleeping ? t('Sleeping') : t('Awake')) : '–'],
            [t('Version'), system?.version ?? info?.firmware ?? '–'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] tracking-[0.06em] text-white/70 uppercase">{label}</dt>
              <dd className="m-0 mt-0.5 font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </Hero>

      <SectionHead title={t('Health check')}>
        <button
          className="border-0 bg-transparent p-0 text-[13px] font-semibold text-primary"
          onClick={() => {
            setHealth(null);
            checkHealth();
          }}
        >
          {t('Check again')}
        </button>
      </SectionHead>
      <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
        <HealthRow icon={<Monitor />} label={t('Kiosk screen')} ok={state?.kioskOnline} text={state?.kioskOnline ? t('Connected') : t('Not connected. Turn on the kiosk screen.')} />
        <HealthRow
          icon={<Printer />}
          label={t('Printer')}
          ok={!!printer && !printer.problem}
          warn={!!printer && !printer.problem && (printer.lowPaper || printer.lowInk)}
          text={printerText}
          link={printer?.problem || printer?.lowPaper || printer?.lowInk ? '/teacher/print' : null}
        />
        <HealthRow
          icon={<Wifi />}
          label={t('Internet (AI services)')}
          ok={health?.internet}
          pending={!health}
          text={!health ? t('Checking…') : health.internet ? t('Reachable') : t('Not reachable. Pictures cannot be made.')}
        />
        <HealthRow icon={<Database />} label={t('Database')} ok={health?.database} pending={!health} text={!health ? t('Checking…') : health.database ? t('Working') : t('Not working')} />
        <HealthRow
          icon={<HardDrive />}
          label={t('Saved pictures')}
          ok
          text={info ? `${t(pictures === 1 ? '1 picture' : '{n} pictures', { n: pictures })} · ${mb(info.storage.bytes)}` : '…'}
        />
      </ul>

      {system && (
        <>
          <SectionHead title={t('Services')} lead={t('Set up by your system administrator.')} />
          <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
            <ServiceRow icon={<Mic />} tone="blue" label={t('Speech to text')} value={system.speech.provider === 'browser' ? t('Browser speech recognition (free)') : system.speech.provider} model={system.speech.model} />
            <ServiceRow icon={<Bot />} tone="indigo" label={t('Safety checks')} value={system.safety.provider === 'Word filter' ? t('Word filter only') : t('Word filter + OpenAI')} model={system.safety.model} />
            <ServiceRow
              icon={<ImageIcon />}
              tone="green"
              label={t('Pictures')}
              value={system.images.provider === 'Pollinations' ? t('Pollinations (free)') : system.images.provider}
              model={[system.images.model, system.images.fallback ? t('falls back to {name}', { name: system.images.fallback }) : null].filter(Boolean).join(' · ') || null}
            />
            <ServiceRow
              icon={<Printer />}
              tone="purple"
              label={t('Printer service')}
              value={!system.printer.reachable ? t('Not running') : system.printer.mode === 'mock' ? t('Practice mode (no printer)') : t('CUPS printer')}
              model={system.printer.name}
            />
          </ul>
        </>
      )}

      <SectionHead title={t('Screen')} />
      <Panel>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">{sleeping ? t('The screen is asleep') : t('The screen is awake')}</b>
            <small className="text-[13px] text-muted-foreground">
              {info?.autoSleep ? t('Sleeps by itself after {n} min with nobody using it.', { n: info.autoSleepMinutes }) : t('Auto-sleep is off.')}{' '}
              <Link href="/teacher/settings" className="text-primary">
                {t('Change this in Settings.')}
              </Link>
            </small>
          </span>
          {sleeping ? (
            <Button onClick={() => act('/api/kiosk/wake', t('Kiosk is awake.'))} disabled={!state?.kioskOnline}>
              <Sun /> {t('Wake')}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => act('/api/kiosk/sleep', t('Kiosk is sleeping.'))} disabled={!state?.kioskOnline}>
              <Moon /> {t('Sleep')}
            </Button>
          )}
        </div>
        <Brightness
          value={state?.screen?.brightness ?? 100}
          onSave={(b) => void api('/api/kiosk', { method: 'PATCH', body: { brightness: b } }).catch((e: Error) => toast.error(t.error(e.message)))}
        />
      </Panel>

      <SectionHead title={t('Controls')} />
      <div className="grid gap-2.5 lg:grid-cols-3">
        <button
          className="flex items-center gap-3.5 rounded-xl border bg-card px-3.5 py-3 text-left shadow-card hover:bg-accent disabled:opacity-50"
          disabled={!state?.kioskOnline}
          onClick={async () => {
            if (await confirm({ title: t('Restart the kiosk screen?'), text: t('Reloads the kiosk screen. The session keeps running.'), confirm: t('Restart Kiosk') }))
              void act('/api/kiosk/restart', t('Kiosk is restarting…'));
          }}
        >
          <Tint tone="amber">
            <RotateCw />
          </Tint>
          <span>
            <b className="block text-[15px]">{t('Restart Kiosk')}</b>
            <small className="text-xs text-muted-foreground">{t('Reloads the kiosk screen. The session keeps running.')}</small>
          </span>
        </button>
        <a className="flex items-center gap-3.5 rounded-xl border bg-card px-3.5 py-3 text-left no-underline shadow-card hover:bg-accent" href="/kiosk" target="_blank" rel="noreferrer">
          <Tint tone="blue">
            <ExternalLink />
          </Tint>
          <span>
            <b className="block text-[15px] text-foreground">{t('Open kiosk screen')}</b>
            <small className="text-xs text-muted-foreground">{t('Only works on the kiosk itself.')}</small>
          </span>
        </a>
        <div className="flex items-center gap-3.5 rounded-xl border bg-card px-3.5 py-3">
          <Tint tone="gray">
            <Cpu />
          </Tint>
          <span>
            <b className="block text-[15px]">{t('Version {v}', { v: system?.version ?? info?.firmware ?? '' })}</b>
            <small className="text-xs text-muted-foreground">{t('Updates are installed by your system administrator.')}</small>
          </span>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}

function KioskName({ name, onSave }: { name?: string; onSave: (name: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const iconBtn = 'grid place-items-center rounded-lg border-0 bg-white/10 p-1.5 text-white hover:bg-white/20';
  if (!editing) {
    return (
      <h2 className="mt-3.5 mb-1.5 flex items-center gap-2 text-[21px] font-extrabold">
        {name ?? t('Kiosk')}
        <button
          className={iconBtn}
          onClick={() => {
            setDraft(name ?? '');
            setEditing(true);
          }}
          aria-label={t('Rename kiosk')}
        >
          <Pencil size={16} />
        </button>
      </h2>
    );
  }
  return (
    <form
      className="mt-3.5 mb-1.5 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onSave(draft.trim());
        setEditing(false);
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={40}
        aria-label={t('Kiosk name')}
        autoFocus
        className="h-10 min-w-0 flex-1 rounded-lg border border-white/30 bg-white/10 px-3 text-lg font-bold text-white outline-0"
      />
      <button className={iconBtn} aria-label={t('Save name')}>
        <Check size={18} />
      </button>
      <button type="button" className={iconBtn} onClick={() => setEditing(false)} aria-label={t('Cancel')}>
        <X size={18} />
      </button>
    </form>
  );
}

// Saves a moment after the slider stops moving, so dragging doesn't send dozens of requests.
function Brightness({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const t = useT();
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);
  const change = (v: number) => {
    dragging.current = true;
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dragging.current = false;
      onSave(v);
    }, 350);
  };
  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-2 flex justify-between">
        <b className="text-[15px]">{t('Brightness')}</b>
        <small className="text-[13px] text-muted-foreground">{local}%</small>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <SunDim size={16} />
        <Slider min={30} max={100} step={5} value={[local]} onValueChange={([v]) => change(v)} aria-label={t('Brightness')} />
        <Sun size={18} />
      </div>
    </div>
  );
}

type HealthProps = { icon: React.ReactNode; label: string; ok?: boolean; warn?: boolean; pending?: boolean; text: string; link?: string | null };

function HealthRow({ icon, label, ok, warn, pending, text, link }: HealthProps) {
  const t = useT();
  const tone = pending ? 'wait' : !ok ? 'bad' : warn ? 'warn' : 'ok';
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-card">
      <Tint tone={tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : tone === 'ok' ? 'green' : 'gray'}>{icon}</Tint>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px]">{label}</b>
        <small className={cn('text-[13px]', tone === 'bad' ? 'text-danger' : 'text-muted-foreground')}>{text}</small>
      </span>
      {link && (
        <Link className="text-[13px] font-bold text-primary no-underline" href={link}>
          {t('Fix')} →
        </Link>
      )}
    </li>
  );
}

function ServiceRow({ icon, tone, label, value, model }: { icon: React.ReactNode; tone: TintName; label: string; value: string; model: string | null }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
      <Tint tone={tone}>{icon}</Tint>
      <span className="min-w-0 flex-1">
        <small className="block text-xs text-muted-foreground">{label}</small>
        <b className="block text-[15px]">{value}</b>
        {model && <small className="block truncate font-mono text-[11px] text-muted-foreground">{model}</small>}
      </span>
    </li>
  );
}
