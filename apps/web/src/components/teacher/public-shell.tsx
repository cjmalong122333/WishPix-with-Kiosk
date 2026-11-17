'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
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
  return (
    <div
      data-kiosk
      className="fixed inset-0 grid place-items-center overflow-hidden bg-k-bg font-kiosk text-k-ink"
    >
      <div className="relative h-[80rem] w-[128rem]">
        {/* Top Navigation Pill Bar */}
        <header className="absolute top-[2.6rem] left-[4.4rem] flex h-[7.4rem] w-[118.6rem] items-center justify-between rounded-[2.2rem] border border-[#ebe4f7] bg-white px-[2.4rem] shadow-[0_2px_10px_rgba(48,35,68,0.02)]">
          <Link href="/teacher" className="flex items-center gap-[1.5rem] no-underline">
            <span className="grid size-[4.6rem] place-items-center rounded-[1.2rem] bg-k-purple text-white">
              <Star className="size-[2.5rem]" strokeWidth={2.1} />
            </span>
            <span className="flex flex-col">
              <b className="text-[2.9rem] leading-none font-extrabold tracking-[-0.01em] text-k-ink">WishPix</b>
              <small className="mt-[0.45rem] text-[0.95rem] leading-none font-extrabold tracking-[0.04em] text-k-muted uppercase">
                IMAGINATION STATION
              </small>
            </span>
          </Link>

          <nav className="flex items-center gap-[1.6rem]" aria-label="Public navigation">
            {NAV_LINKS.map((item) => {
              const isCurrent = active === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex h-[4.5rem] items-center justify-center rounded-full px-[2.8rem] text-[1.7rem] font-extrabold no-underline transition-colors',
                    isCurrent ? 'bg-k-purple-soft text-k-purple' : 'text-k-ink hover:text-k-purple'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/teacher/login"
              className="ml-[1.2rem] flex h-[4.5rem] w-[14.2rem] items-center justify-center rounded-full bg-k-purple text-[1.7rem] font-extrabold text-white no-underline transition-opacity hover:opacity-95"
            >
              Log in
            </Link>
          </nav>
        </header>

        {/* Page Content */}
        <main className=" contents">{children}</main>

        {/* Bottom Centered Footer */}
        <p className="absolute inset-x-0 top-[76rem] m-0 text-center text-[1.5rem] font-medium text-k-muted">
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
