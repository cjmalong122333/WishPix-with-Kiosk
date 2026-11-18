'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Bell, Clock, FileText, LayoutGrid, LogOut, Menu, Monitor, Printer, Send, Server, Settings, ShieldCheck, SlidersHorizontal, Star, X, Zap,
  type LucideIcon,
} from 'lucide-react';
import { useT } from '@/i18n';
import type { KioskState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuth, useLive } from '@/components/teacher/auth';

type Item = { to: string; label: string; icon: LucideIcon; badge?: (s: KioskState | null) => string | number | null };

const NAV: { section: string; items: Item[] }[] = [
  {
    section: 'Teach',
    items: [
      { to: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { to: 'setup', label: 'Session Setup', icon: Settings },
      { to: 'live', label: 'Live Session', icon: Zap },
      { to: 'moderation', label: 'Moderation', icon: ShieldCheck, badge: (s) => s?.pendingModeration || null },
    ],
  },
  {
    section: 'Hardware',
    items: [
      { to: 'print-to-kiosk', label: 'Print to Kiosk', icon: Send, badge: (s) => s?.teacherPrint?.pending || null },
      { to: 'print', label: 'Print Management', icon: Printer, badge: (s) => (s?.printer?.problem ? '!' : null) },
      { to: 'kiosk', label: 'Kiosk Management', icon: Server, badge: (s) => (s && !s.kioskOnline ? '!' : null) },
    ],
  },
  {
    section: 'Insights',
    items: [
      { to: 'logs', label: 'Activity Logs', icon: Clock },
      { to: 'analytics', label: 'Analytics', icon: BarChart3 },
      { to: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  { section: 'System', items: [{ to: 'settings', label: 'Settings', icon: SlidersHorizontal }] },
];

// Header + side menu around every signed-in page. On phones the menu is a
// drawer; on wide screens it stays open on the left.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, teacher, signOut } = useAuth();
  const live = useLive();
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background font-teacher">
        <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" role="status" aria-label={t('Loading')} />
      </div>
    );
  }

  // Menu items that need the teacher's attention, e.g. blocked requests or a printer problem.
  const items = NAV.flatMap((g) => g.items);
  const badges = Object.fromEntries(items.filter((i) => i.badge).map((i) => [i.to, i.badge!(live)]));
  const firstAlert = items.find((i) => badges[i.to]);
  const initials = (teacher?.displayName ?? 'T')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-dvh bg-background font-teacher text-foreground lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        aria-label={t('Main menu')}
        className={cn(
          'no-print fixed inset-y-0 left-0 z-30 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-white px-4 pt-[22px] pb-4 text-foreground transition-transform duration-250',
          'lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:max-w-none lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <Link href="/teacher/dashboard" className="flex items-center gap-3 no-underline" onClick={() => setOpen(false)}>
            <span className="grid size-[38px] place-items-center rounded-[10px] bg-primary text-white">
              <Star size={21} strokeWidth={2.1} />
            </span>
            <span className="flex flex-col">
              <b className="text-[22px] leading-none font-extrabold tracking-[-0.01em] text-foreground">WishPix</b>
              <small className="mt-1 text-[9px] leading-none font-extrabold tracking-[0.04em] text-muted-foreground uppercase">
                Imagination Station
              </small>
            </span>
          </Link>
          <button className="border-0 bg-transparent p-1 text-foreground lg:hidden" onClick={() => setOpen(false)} aria-label={t('Close menu')}>
            <X size={20} />
          </button>
        </div>
        <KioskCard live={live} />
        <nav>
          {NAV.map((group) => (
            <div key={group.section} className="mt-5">
              <p className="mb-1.5 ml-2 text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase">{t(group.section)}</p>
              {group.items.map(({ to, label, icon: Icon }) => {
                const active = pathname === `/teacher/${to}` || pathname.startsWith(`/teacher/${to}/`);
                return (
                  <Link
                    key={to}
                    href={`/teacher/${to}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] font-semibold text-foreground no-underline transition-colors hover:bg-accent hover:text-primary',
                      active && 'bg-accent font-extrabold text-primary'
                    )}
                  >
                    <Icon size={18} /> {t(label)}
                    {badges[to] && (
                      <em
                        className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white not-italic"
                        aria-label={badges[to] === '!' ? t('Needs attention') : t('{n} waiting', { n: badges[to]! })}
                      >
                        {badges[to]}
                      </em>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 pt-6">
          <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-accent text-xs font-extrabold text-primary">WP</span>
          <div className="min-w-0">
            <b className="block text-[15px]">{t('WishPix Teacher')}</b>
            <small className="text-xs text-muted-foreground">{t('System v{v}', { v: '1.0.0' })}</small>
          </div>
          <button className="ml-auto border-0 bg-transparent p-1.5 text-muted-foreground hover:text-primary" onClick={() => signOut()} aria-label={t('Sign out')} title={t('Sign out')}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div
        className={cn('no-print fixed inset-0 z-20 bg-[#302344]/40 transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={() => setOpen(false)}
      />

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-white/90 px-4 backdrop-blur">
          <button
            className="relative grid place-items-center rounded-lg border-0 bg-transparent p-1.5 text-foreground lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={firstAlert ? t('Open menu, some items need attention') : t('Open menu')}
          >
            <Menu size={24} />
            {firstAlert && <i className="absolute top-1 right-1.5 size-2.5 rounded-full border-2 border-white bg-danger" />}
          </button>
          <span className="flex flex-1 items-center gap-2 text-xl font-extrabold text-foreground">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-primary text-white lg:hidden">
              <Star size={17} strokeWidth={2.1} />
            </span>
            <span>
              WishPix
              <i className="ml-1 inline-block size-[7px] rounded-full bg-primary align-super" />
            </span>
          </span>
          <Link
            className="relative grid place-items-center rounded-lg p-1.5 text-foreground hover:text-primary"
            href={`/teacher/${firstAlert?.to ?? 'dashboard'}`}
            aria-label={firstAlert ? t('Alerts: {page} needs attention', { page: t(firstAlert.label) }) : t('No alerts')}
            title={firstAlert ? t(firstAlert.label) : t('No alerts')}
          >
            <Bell size={22} />
            {firstAlert && <i className="absolute top-1 right-1.5 size-2.5 rounded-full border-2 border-white bg-danger" />}
          </Link>
          <Link className="grid size-[38px] place-items-center rounded-full bg-primary text-sm font-bold text-white no-underline" href="/teacher/settings" title={teacher?.displayName} aria-label={t('Settings')}>
            {initials}
          </Link>
        </header>
        <main className="mx-auto max-w-[760px] px-3.5 pt-[18px] pb-10 sm:px-6 md:max-w-[920px] lg:max-w-[1100px] lg:px-8 lg:pt-7 lg:pb-12 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}

function KioskCard({ live }: { live: KioskState | null }) {
  const t = useT();
  const online = live?.kioskOnline;
  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-border bg-accent p-3.5">
      <Monitor size={20} className="text-primary" />
      <div>
        <small className="block text-[10px] font-extrabold tracking-[0.1em] text-primary uppercase">{t('Connected kiosk')}</small>
        <b className="block">{live?.kioskName ?? t('Kiosk')}</b>
        <span className="text-xs text-muted-foreground">{online ? t('Online') : t('Offline')}</span>
      </div>
      <i className={cn('absolute top-3.5 right-3.5 size-[9px] rounded-full', online ? 'bg-[#4ade80] shadow-[0_0_8px_#4ade80]' : 'bg-[#f87171]')} />
    </div>
  );
}
