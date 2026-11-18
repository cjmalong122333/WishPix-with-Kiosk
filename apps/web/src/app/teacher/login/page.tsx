'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n';
import { IDLE_KEY, useAuth } from '@/components/teacher/auth';
import { PublicShell, WavingPixi } from '@/components/teacher/public-shell';

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const inputClass =
    'mt-2 h-12 w-full rounded-[14px] border-2 border-[#e7ddf2] bg-[#fcfaff] px-4 text-base font-medium text-k-ink outline-none placeholder:text-[#9c92ac] focus:border-k-purple sm:h-[54px] sm:text-[16.5px]';

  return (
    <PublicShell
      active="login"
      footer="A little support from you. A world of discovery for them."
    >
      <div className="mx-auto grid w-full max-w-[1150px] items-stretch gap-6 lg:grid-cols-[581fr_510fr] lg:gap-10">
        {/* Left Soft-Lavender Welcome Card */}
        <div className="order-2 flex flex-col rounded-[24px] bg-k-purple-soft p-6 sm:p-8 lg:order-1 lg:min-h-[560px] lg:rounded-[28px] lg:px-[38px] lg:py-8">
          <p className="m-0 text-xs font-extrabold tracking-[0.03em] text-k-purple uppercase sm:text-[13.5px]">
            WELCOME TO YOUR IMAGINATION STATION
          </p>
          <h1 className="mt-3 m-0 text-2xl leading-[1.15] font-extrabold tracking-[-0.015em] text-k-ink sm:text-3xl lg:mt-4 lg:text-[38px]">
            A little idea.
            <br />
            A whole new adventure.
          </h1>
          <p className="mt-3.5 m-0 text-base leading-[1.38] font-medium text-k-muted sm:text-lg lg:mt-5 lg:text-[20px]">
            Help your child turn spoken ideas
            <br className="hidden sm:inline" /> into hands-on learning.
          </p>
          <WavingPixi className="mx-auto my-4 w-[240px] shrink-0 sm:w-[280px] lg:my-auto lg:w-[336px]" />
          <p className="mt-auto m-0 text-center text-base font-extrabold text-k-purple sm:text-[17.5px]">
            Pixi is ready when you are.
          </p>
        </div>

        {/* Right White Log in Form Card */}
        <form
          onSubmit={submit}
          noValidate
          className="order-1 flex flex-col rounded-[24px] bg-white p-6 sm:p-8 lg:order-2 lg:min-h-[560px] lg:rounded-[28px] lg:px-10 lg:py-9"
        >
          <p className="m-0 text-xs font-extrabold tracking-[0.03em] text-k-purple uppercase sm:text-[13.5px]">
            FOR PARENTS &amp; EDUCATORS
          </p>
          <h2 className="mt-3 m-0 text-2xl leading-[1.15] font-extrabold tracking-[-0.015em] text-k-ink sm:text-3xl lg:mt-[14px] lg:text-[36px]">
            Welcome back!
          </h2>
          <p className="mt-2.5 m-0 text-sm font-medium text-k-muted sm:text-[16.5px]">
            Log in to start your next learning adventure.
          </p>

          {idleMinutes && (
            <p className="mt-3 mb-0 rounded-[10px] bg-k-purple-soft px-3.5 py-2 text-[13.5px] font-semibold text-k-purple" role="status">
              {t('You were signed out after {n} minutes without activity.', { n: idleMinutes })}
            </p>
          )}

          <label htmlFor="username" className="mt-6 block text-[15px] font-extrabold text-k-ink lg:mt-7">
            Email address
          </label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="you@example.com"
            autoComplete="username"
            required
            onChange={() => setError(null)}
            className={inputClass}
          />

          <label htmlFor="password" className="mt-5 block text-[15px] font-extrabold text-k-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            onChange={() => setError(null)}
            className={inputClass}
          />

          <span className="mt-3 self-end text-sm font-extrabold text-k-purple">
            Forgot password?
          </span>

          {error && (
            <p className="mt-2 mb-0 text-sm font-semibold text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 h-12 w-full rounded-full border-0 bg-k-purple text-base font-extrabold text-white transition-opacity hover:opacity-95 disabled:opacity-70 sm:h-14 sm:text-[18px] lg:mt-auto"
          >
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </PublicShell>
  );
}
