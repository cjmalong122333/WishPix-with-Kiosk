'use client';

import { useT } from '@/i18n';
import { LogoMark } from '@/components/logo';

// Splash background used by the loader, login and system check screens.
export function WelcomeShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 pt-16 pb-8 text-center" style={{ background: 'var(--splash-gradient)' }}>
      <p className="mb-[18px] text-[11px] font-bold tracking-[0.24em] text-brand-700 uppercase">{t('Local. Secure. Made for educators.')}</p>
      <div className="grid h-[130px] w-40 place-items-center overflow-hidden rounded-[14px] bg-navy-900 p-1.5">
        <TeacherArt />
      </div>
      <h1 className="mt-[22px] mb-1 max-w-[340px] text-[26px] leading-tight font-extrabold text-brand-600">{t('Welcome to the WishPix Teacher App')}</h1>
      <p className="mb-5 text-[15px] text-brand-600">{t('Small voices. Big imagination.')}</p>
      {children}
      <p className="mt-3.5 flex items-center gap-1.5 font-extrabold text-brand-600">
        <LogoMark size={20} /> WishPix
      </p>
    </div>
  );
}

// A teacher at the kiosk.
function TeacherArt() {
  const t = useT();
  return (
    <svg viewBox="0 0 160 130" role="img" aria-label={t('Teacher at the kiosk')} className="size-full">
      <rect x="92" y="36" width="52" height="36" rx="3" fill="#cfe7ff" stroke="#1e3a5f" strokeWidth="2" />
      <rect x="98" y="42" width="18" height="12" rx="2" fill="#5fb3f4" />
      <rect x="120" y="42" width="18" height="12" rx="2" fill="#ffd36b" />
      <rect x="98" y="57" width="40" height="9" rx="2" fill="#9fd8a8" />
      <rect x="114" y="72" width="8" height="10" fill="#1e3a5f" />
      <rect x="84" y="82" width="70" height="5" rx="2" fill="#7fc6c0" />
      <path d="M90 87v34M148 87v34" stroke="#7fc6c0" strokeWidth="4" />
      <circle cx="52" cy="28" r="12" fill="#f6c9a5" />
      <path d="M40 26c0-10 24-12 24 0-4-4-20-4-24 0z" fill="#8a5a3b" />
      <circle cx="52" cy="13" r="5" fill="#8a5a3b" />
      <path d="M36 44h32l4 40H32z" fill="#1d6aa5" />
      <path d="M48 44l4 10 4-10" fill="#fff" />
      <path d="M68 50l20-8" stroke="#1d6aa5" strokeWidth="7" strokeLinecap="round" />
      <path d="M38 84h12v36h-12zM54 84h12v36H54z" fill="#1e3a5f" />
    </svg>
  );
}
