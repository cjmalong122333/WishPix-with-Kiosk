'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Menu, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pixi, type PixiMood } from '@/components/pixi/pixi';
import { FlatPixi } from '@/components/kiosk/screens';

export type PublicNavItem = 'home' | 'about' | 'team' | 'login';

type PublicShellProps = {
  active: PublicNavItem;
  footer: string;
  children: React.ReactNode;
};

const NAV_LINKS: { id: Exclude<PublicNavItem, 'login'>; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: '/teacher' },
  { id: 'about', label: 'About', href: '/teacher/about' },
  { id: 'team', label: 'Team', href: '/teacher/team' },
];

export function PublicShell({ active, footer, children }: PublicShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      data-public-teacher
      className="min-h-dvh overflow-x-hidden bg-k-bg font-kiosk text-k-ink"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col justify-between px-4 py-4 sm:px-6 lg:px-8 lg:py-[26px]">
        {/* Top Navigation Pill Bar */}
        <header className="relative z-20 rounded-[20px] border border-[#ebe4f7] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(48,35,68,0.02)] sm:px-6 lg:rounded-[22px] lg:py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/teacher" className="flex items-center gap-3 no-underline sm:gap-[15px]" onClick={() => setMenuOpen(false)}>
              <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-k-purple text-white sm:size-[46px] sm:rounded-[12px]">
                <Star className="size-5 sm:size-[25px]" strokeWidth={2.1} />
              </span>
              <span className="flex flex-col">
                <b className="text-2xl leading-none font-extrabold tracking-[-0.01em] text-k-ink sm:text-[29px]">WishPix</b>
                <small className="mt-1 text-[9px] leading-none font-extrabold tracking-[0.04em] text-k-muted uppercase sm:text-[9.5px]">
                  IMAGINATION STATION
                </small>
              </span>
            </Link>

            {/* Desktop / Tablet Navigation */}
            <nav className="hidden items-center gap-2 md:flex lg:gap-4" aria-label="Public navigation">
              {NAV_LINKS.map((item) => {
                const isCurrent = active === item.id;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-full px-5 text-[15px] font-extrabold no-underline transition-colors lg:h-[45px] lg:px-7 lg:text-[17px]',
                      isCurrent ? 'bg-k-purple-soft text-k-purple' : 'text-k-ink hover:text-k-purple'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/teacher/login"
                className="ml-1 flex h-10 items-center justify-center rounded-full bg-k-purple px-6 text-[15px] font-extrabold text-white no-underline transition-opacity hover:opacity-95 lg:ml-3 lg:h-[45px] lg:w-[142px] lg:px-0 lg:text-[17px]"
              >
                Log in
              </Link>
            </nav>

            {/* Mobile Controls */}
            <div className="flex items-center gap-2 md:hidden">
              <Link
                href="/teacher/login"
                className="flex h-9 items-center justify-center rounded-full bg-k-purple px-4 text-sm font-extrabold text-white no-underline transition-opacity hover:opacity-95"
              >
                Log in
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                className="grid size-9 place-items-center rounded-xl border border-[#ebe4f7] bg-k-bg text-k-ink"
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>

          {/* Mobile Collapsible Navigation */}
          {menuOpen && (
            <nav className="mt-3 flex flex-col gap-1 border-t border-[#ebe4f7] pt-3 md:hidden" aria-label="Mobile public navigation">
              {NAV_LINKS.map((item) => {
                const isCurrent = active === item.id;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex h-10 items-center rounded-xl px-3.5 text-[15px] font-extrabold no-underline transition-colors',
                      isCurrent ? 'bg-k-purple-soft text-k-purple' : 'text-k-ink hover:bg-k-bg hover:text-k-purple'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        {/* Page Content */}
        <main className="my-auto w-full py-6 sm:py-8 lg:py-6">{children}</main>

        {/* Bottom Centered Footer */}
        <p className="m-0 pt-2 text-center text-xs font-medium text-k-muted sm:text-sm lg:text-[15px]">
          {footer}
        </p>
      </div>
    </div>
  );
}

export function WavingPixi({ className, mood = 'idle' }: { className?: string; mood?: PixiMood }) {
  const [pixiOk, setPixiOk] = useState(true);
  const pixiOff = useCallback(() => setPixiOk(false), []);

  // Callers set only the width: the box keeps the kiosk's shape (440x370), so
  // Pixi is drawn at the same scale for the same width on every page.
  return (
    <div className={cn('pointer-events-none relative aspect-[44/37] select-none', className)}>
      {pixiOk ? (
        <Pixi mood={mood} onUnavailable={pixiOff} className="size-full" />
      ) : (
        <div className="mx-auto aspect-square h-[70%] translate-y-[20%]">
          <FlatPixi />
        </div>
      )}
    </div>
  );
}
