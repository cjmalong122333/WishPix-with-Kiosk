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
    'mt-[0.8rem] h-[5.4rem] w-full rounded-[1.4rem] border-[0.2rem] border-[#e7ddf2] bg-[#fcfaff] px-[1.8rem] text-[1.65rem] font-medium text-k-ink outline-none placeholder:text-[#9c92ac] focus:border-k-purple';

  return (
    <PublicShell
      active="login"
      footer="A little support from you. A world of discovery for them."
    >
      {/* Left Soft-Lavender Welcome Card */}
      <div className="absolute top-[15.2rem] left-[6.3rem] flex h-[57.3rem] w-[58.1rem] flex-col rounded-[2.8rem] bg-k-purple-soft px-[3.8rem] py-[3.2rem]">
        <p className="m-0 text-[1.35rem] font-extrabold tracking-[0.03em] text-k-purple uppercase">
          WELCOME TO YOUR IMAGINATION STATION
        </p>
        <h1 className="mt-[1.6rem] m-0 text-[3.8rem] leading-[1.15] font-extrabold tracking-[-0.015em] text-k-ink">
          A little idea.
          <br />
          A whole new adventure.
        </h1>
        <p className="mt-[2rem] m-0 text-[2rem] leading-[1.38] font-medium text-k-muted">
          Help your child turn spoken ideas
          <br />
          into hands-on learning.
        </p>
        <WavingPixi className="mx-auto my-auto w-[33.6rem] shrink-0" />
        <p className="mt-auto m-0 text-center text-[1.75rem] font-extrabold text-k-purple">
          Pixi is ready when you are.
        </p>
      </div>

      {/* Right White Log in Form Card */}
      <form
        onSubmit={submit}
        noValidate
        className="absolute top-[15.2rem] left-[70.3rem] flex h-[57.3rem] w-[51rem] flex-col rounded-[2.8rem] bg-white px-[4rem] py-[3.6rem]"
      >
        <p className="m-0 text-[1.35rem] font-extrabold tracking-[0.03em] text-k-purple uppercase">
          FOR PARENTS &amp; EDUCATORS
        </p>
        <h2 className="mt-[1.4rem] m-0 text-[3.6rem] leading-[1.15] font-extrabold tracking-[-0.015em] text-k-ink">
          Welcome back!
        </h2>
        <p className="mt-[1.2rem] m-0 text-[1.65rem] font-medium text-k-muted">
          Log in to start your next learning adventure.
        </p>

        {idleMinutes && (
          <p className="mt-[1.2rem] mb-0 rounded-[1rem] bg-k-purple-soft px-[1.4rem] py-[0.8rem] text-[1.35rem] font-semibold text-k-purple" role="status">
            {t('You were signed out after {n} minutes without activity.', { n: idleMinutes })}
          </p>
        )}

        <label htmlFor="username" className="mt-[2.8rem] block text-[1.5rem] font-extrabold text-k-ink">
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

        <label htmlFor="password" className="mt-[2.2rem] block text-[1.5rem] font-extrabold text-k-ink">
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

        <span className="mt-[1.2rem] self-end text-[1.4rem] font-extrabold text-k-purple">
          Forgot password?
        </span>

        {error && (
          <p className="mt-[0.8rem] mb-0 text-[1.4rem] font-semibold text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-auto h-[5.6rem] w-full rounded-full border-0 bg-k-purple text-[1.8rem] font-extrabold text-white transition-opacity hover:opacity-95 disabled:opacity-70"
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </PublicShell>
  );
}
