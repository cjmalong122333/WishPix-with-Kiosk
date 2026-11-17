import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

// The WishPix mark: a star in a rounded purple square, as on the public pages.
export function LogoMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center', inverted ? 'bg-white text-primary' : 'bg-primary text-white')}
      style={{ width: size, height: size, borderRadius: size * 0.26 }}
    >
      <Star size={size * 0.55} strokeWidth={2.1} />
    </span>
  );
}

export function Logo({ size = 32, light = false, className }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center font-extrabold', light ? 'text-white' : 'text-foreground', className)}
      style={{ gap: size / 3, fontSize: size * 0.7 }}
    >
      <LogoMark size={size} />
      WishPix
    </span>
  );
}
