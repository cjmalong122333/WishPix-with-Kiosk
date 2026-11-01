import { cn } from '@/lib/utils';

// The WishPix mark: a sparkle wand in a rounded navy square.
export function LogoMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill={inverted ? '#fff' : 'var(--navy-800)'} />
      <path d="M9 23 19 13" stroke={inverted ? 'var(--navy-800)' : '#fff'} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21 6.5l1.2 2.8 2.8 1.2-2.8 1.2L21 14.5l-1.2-2.8-2.8-1.2 2.8-1.2z" fill="var(--brand-500)" />
      <circle cx="11" cy="9" r="1.4" fill={inverted ? 'var(--navy-800)' : '#fff'} />
      <circle cx="24.5" cy="20" r="1.2" fill={inverted ? 'var(--navy-800)' : '#fff'} />
    </svg>
  );
}

export function Logo({ size = 32, light = false, className }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center font-extrabold', light ? 'text-white' : 'text-navy-900', className)}
      style={{ gap: size / 3, fontSize: size * 0.7 }}
    >
      <LogoMark size={size} />
      WishPix
    </span>
  );
}
