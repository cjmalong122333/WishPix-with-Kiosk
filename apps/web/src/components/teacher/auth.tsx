'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LangProvider } from '@/i18n';
import { api, onSignedOut } from '@/lib/api';
import type { PublicTeacher } from '@/lib/types';
import { useLiveConnection, useLiveStore } from '@/stores/live';

export const IDLE_KEY = 'wp_idle_signout'; // tells the login page why the teacher was signed out

type Auth = {
  status: 'loading' | 'signedIn' | 'signedOut';
  teacher: PublicTeacher | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: (reason?: 'idle' | 'expired') => void;
  updateTeacher: (t: PublicTeacher) => void;
};

const AuthContext = createContext<Auth | null>(null);

function isPublicTeacherPath(pathname: string) {
  return (
    pathname === '/teacher' ||
    pathname === '/teacher/about' ||
    pathname === '/teacher/team' ||
    pathname === '/teacher/login'
  );
}

// Holds the teacher's sign-in and the live kiosk connection for every page,
// and applies the shared settings: language, theme color and auto sign-out.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [teacher, setTeacher] = useState<PublicTeacher | null>(null);
  const [status, setStatus] = useState<Auth['status']>('loading');
  const [publicLang, setPublicLang] = useState<string | null>(null);
  useLiveConnection('teacher', status === 'signedIn');
  const prefs = useLiveStore((s) => s.state?.prefs);

  useEffect(() => {
    api<{ teacher: PublicTeacher }>('/api/me')
      .then((r) => {
        setTeacher(r.teacher);
        setStatus('signedIn');
      })
      .catch(() => setStatus('signedOut'));
    // Before sign-in there is no live state, so ask for the language directly.
    api<{ language: string }>('/api/prefs')
      .then((p) => setPublicLang(p.language))
      .catch(() => {});
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await api<{ teacher: PublicTeacher }>('/api/auth/login', { method: 'POST', body: { username, password } });
    sessionStorage.removeItem(IDLE_KEY);
    setTeacher(res.teacher);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(
    (reason?: 'idle' | 'expired') => {
      if (reason !== 'expired') void api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      setTeacher(null);
      setStatus('signedOut');
      if (reason !== 'expired' || !isPublicTeacherPath(pathname)) {
        router.replace('/teacher/login');
      }
    },
    [router, pathname]
  );

  // Any API call that finds the sign-in expired (e.g. password changed elsewhere).
  useEffect(() => onSignedOut(() => signOut('expired')), [signOut]);

  useAutoSignOut(status === 'signedIn' && prefs?.autoLogout ? prefs.autoLogoutMinutes : null, () => {
    sessionStorage.setItem(IDLE_KEY, String(prefs?.autoLogoutMinutes ?? ''));
    signOut('idle');
  });

  // Theme color for the Teacher App only; the kiosk keeps its own colors.
  useEffect(() => {
    document.documentElement.dataset.theme = prefs?.themeColor ?? 'deep_blue';
  }, [prefs?.themeColor]);

  // Signed-out teachers only see the welcome pages.
  useEffect(() => {
    if (status === 'signedOut' && !isPublicTeacherPath(pathname)) router.replace('/teacher/login');
  }, [status, pathname, router]);

  const value = useMemo(() => ({ status, teacher, signIn, signOut, updateTeacher: setTeacher }), [status, teacher, signIn, signOut]);
  return (
    <AuthContext.Provider value={value}>
      <LangProvider lang={prefs?.language ?? publicLang}>{children}</LangProvider>
    </AuthContext.Provider>
  );
}

// Signs the teacher out after `minutes` without a tap, click, key or scroll.
function useAutoSignOut(minutes: number | null, onIdle: () => void) {
  const latest = useRef(onIdle);
  useEffect(() => {
    latest.current = onIdle;
  });
  useEffect(() => {
    if (!minutes) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, latest]);
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth needs <AuthProvider>');
  return auth;
}

// The live kiosk state for Teacher App pages.
export const useLive = () => useLiveStore((s) => s.state);
