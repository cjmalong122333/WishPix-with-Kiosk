'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLive } from '@/components/teacher/auth';
import { WelcomeShell } from '@/components/teacher/welcome';

type Health = { internet: boolean; database: boolean; kiosk: boolean };

// Checks Internet, Database and Kiosk one after another, then opens the dashboard.
export default function SystemCheck() {
  const t = useT();
  const router = useRouter();
  const live = useLive();
  const [health, setHealth] = useState<Health | null>(null);
  const [step, setStep] = useState(0); // how many rows have finished checking

  useEffect(() => {
    let stop = false;
    const load = () =>
      api<Health>('/api/health')
        .then((h) => !stop && setHealth(h))
        .catch(() => !stop && setHealth({ internet: false, database: false, kiosk: false }));
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  // The kiosk row uses the live connection so it turns green the moment the kiosk opens.
  const kioskOn = live?.kioskOnline ?? health?.kiosk;
  const results = [health?.internet, health?.database, kioskOn];
  const currentOk = results[step];

  useEffect(() => {
    if (!health || step >= 3 || !currentOk) return;
    const timer = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(timer);
  }, [health, step, currentOk]);

  const ready = step === 3;
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => router.replace('/teacher/dashboard'), 1400);
    return () => clearTimeout(timer);
  }, [ready, router]);

  const rows = [
    { name: t('Internet Connection'), ok: t('Online'), bad: t('No internet. Pictures need the internet.') },
    { name: t('Database Connection'), ok: t('Database Connected'), bad: t('Database error') },
    { name: t('Kiosk Connection'), ok: t('Kiosk Connected'), bad: t('Turn on the kiosk screen.') },
  ];

  return (
    <WelcomeShell>
      <section className="w-full max-w-[440px] rounded-[22px] border border-border bg-card p-6 text-left text-foreground shadow-card" aria-live="polite">
                <p className="m-0 text-xs font-extrabold tracking-[0.12em] text-primary uppercase">{t('System check')}</p>
        <h2 className="mt-3.5 mb-1 text-[28px] font-extrabold">{t('Getting ready...')}</h2>
        <p className="mb-4 border-b border-border pb-4 text-sm text-muted-foreground">{t('Making sure everything is connected before starting')}</p>
        <ul className="m-0 grid list-none gap-[18px] p-0">
          {rows.map((r, i) => {
            const done = i < step;
            const checking = i === step;
            const failed = checking && health && !results[i];
            return (
              <li key={r.name} className="flex items-center gap-3.5">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border-2 border-border transition', done && 'border-success bg-success text-white')}>
                  {done && <Check size={16} strokeWidth={3} />}
                </span>
                <div>
                  <b className="block font-semibold">{r.name}</b>
                  <small className={cn('text-[13px] text-muted-foreground', done && 'text-success', failed && 'text-danger')}>
                    {done ? r.ok : failed ? r.bad : checking ? t('Checking') : t('Waiting')}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-xs font-semibold text-muted-foreground">{ready ? t('All systems are ready. Redirecting to dashboard...') : t('This only takes a moment.')}</p>
        {!ready && step >= 0 && health && !currentOk && (
          <button type="button" className="mt-2 border-0 bg-transparent p-0 text-[13px] font-extrabold text-primary" onClick={() => router.replace('/teacher/dashboard')}>
            {t('Skip for now')}
          </button>
        )}
      </section>
    </WelcomeShell>
  );
}
