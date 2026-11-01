import type { Metadata } from 'next';
import { AuthProvider } from '@/components/teacher/auth';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = { title: { default: 'WishPix Teacher App', template: '%s · WishPix' } };

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider>
        {children}
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </AuthProvider>
  );
}
