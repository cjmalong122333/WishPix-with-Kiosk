'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User } from 'lucide-react';
import { useT } from '@/i18n';
import { IDLE_KEY, useAuth } from '@/components/teacher/auth';
import { WelcomeShell } from '@/components/teacher/welcome';

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Why the teacher was signed out, if it was for being idle (browser only).
  const idleMinutes = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem(IDLE_KEY),
    () => null
  );

  useEffect(() => {
    if (status === 'signedIn') router.replace('/teacher/check');
  }, [status, router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await signIn(String(f.get('username')).trim(), String(f.get('password')));
    } catch (err) {
      setError(t.error((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const field = 'flex h-[52px] items-center gap-2.5 rounded-[10px] border border-[#22385a] bg-navy-900 px-3.5 text-[#8a9ab3] focus-within:border-brand-500';
  const input = 'min-w-0 flex-1 border-0 bg-transparent text-base text-white outline-0 placeholder:text-[#8a9ab3]';

  return (
    <WelcomeShell>
      <form className="w-full max-w-[440px] rounded-2xl bg-navy-800 p-6 text-left text-white shadow-[0_16px_40px_rgba(11,31,58,0.3)]" onSubmit={submit} noValidate>
        <h2 className="mb-2.5 text-[22px] font-bold">{t('Welcome back')}</h2>
        <p className="mb-3.5 text-sm text-[#c3cfe0]">{t('Sign in to run sessions on your daycare kiosk.')}</p>
        {idleMinutes && (
          <p className="mb-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-[#c3cfe0]" role="status">
            {t('You were signed out after {n} minutes without activity.', { n: idleMinutes })}
          </p>
        )}
        <label className="mt-3 mb-2 block font-semibold" htmlFor="username">
          {t('Username')}
        </label>
        <div className={field}>
          <User size={16} aria-hidden="true" />
          <input id="username" name="username" placeholder={t('Enter your username')} autoComplete="username" required onChange={() => setError(null)} className={input} />
        </div>
        <label className="mt-3 mb-2 block font-semibold" htmlFor="password">
          {t('Password')}
        </label>
        <div className={field}>
          <Lock size={16} aria-hidden="true" />
          <input
            id="password"
            name="password"
            type="password"
            placeholder={t('Enter your password')}
            autoComplete="current-password"
            required
            onChange={() => setError(null)}
            className={input}
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-[#ff4d5e]" role="alert">
            {error}
          </p>
        )}
        <button
          className="mt-4 h-[54px] w-full rounded-[10px] border-0 bg-brand-700 text-lg font-bold text-white shadow-[0_6px_20px_rgba(10,132,198,0.45)] disabled:opacity-70"
          disabled={busy}
        >
          {busy ? t('Signing in…') : t('Login')}
        </button>
        <p className="mt-3.5 text-center text-[13px] text-[#aab8cc]">{t('Contact your System Administrator for credential recovery.')}</p>
      </form>
    </WelcomeShell>
  );
}
