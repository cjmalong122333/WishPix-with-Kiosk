'use client';

import { useT } from '@/i18n';
import { LogoMark } from '@/components/logo';
import { WavingPixi } from '@/components/teacher/public-shell';

// Background used by the system check screen, in the public pages' colors.
export function WelcomeShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-5 pt-16 pb-8 text-center font-teacher text-foreground">
      <p className="mb-[18px] text-[11px] font-extrabold tracking-[0.24em] text-primary uppercase">{t('Local. Secure. Made for educators.')}</p>
      <div className="relative size-[150px] rounded-full bg-accent">
        <WavingPixi className="absolute top-1/2 left-1/2 w-[200px] -translate-x-1/2 -translate-y-1/2" />
      </div>
      <h1 className="mt-[22px] mb-1 max-w-[340px] text-[26px] leading-tight font-extrabold text-foreground">{t('Welcome to the WishPix Teacher App')}</h1>
      <p className="mb-5 text-[15px] font-medium text-muted-foreground">{t('Small voices. Big imagination.')}</p>
      {children}
      <p className="mt-3.5 flex items-center gap-1.5 font-extrabold text-foreground">
        <LogoMark size={20} /> WishPix
      </p>
    </div>
  );
}
