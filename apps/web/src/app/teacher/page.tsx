'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n';
import { useAuth } from '@/components/teacher/auth';

// Splash spinner, shown briefly when the app opens.
export default function TeacherHome() {
  const { status } = useAuth();
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    if (status === 'loading') return;
    const timer = setTimeout(() => router.replace(status === 'signedIn' ? '/teacher/check' : '/teacher/login'), 700);
    return () => clearTimeout(timer);
  }, [status, router]);
  return (
    <div className="grid min-h-dvh place-items-center" style={{ background: 'var(--splash-gradient)' }}>
      <div className="size-[120px] animate-spin rounded-full border-12 border-[#4b5568] border-t-black border-r-black" role="status" aria-label={t('Loading')} />
    </div>
  );
}
