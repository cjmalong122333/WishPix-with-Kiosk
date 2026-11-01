import { cn } from '@/lib/utils';

// Simple, friendly illustrations for the kiosk screens, in the WishPix colors.

const NAVY = 'var(--navy-800)';
const BLUE = 'var(--brand-500)';
const ACCENT = 'var(--blue-accent)';

const base = 'block w-full overflow-visible';

export function MoonArt() {
  return (
    <svg viewBox="0 0 200 200" className={cn(base, 'animate-float')} aria-hidden>
      <circle cx="100" cy="100" r="80" fill="#fff" opacity="0.5" />
      <path d="M118 48a56 56 0 1 0 36 92 46 46 0 0 1-36-92z" fill={NAVY} />
      <text x="138" y="62" fontSize="22" fontWeight="800" fill={BLUE}>z</text>
      <text x="154" y="44" fontSize="16" fontWeight="800" fill={BLUE}>z</text>
      <circle cx="56" cy="58" r="4" fill="#fff" />
      <circle cx="160" cy="150" r="3" fill="#fff" />
    </svg>
  );
}

export function PauseArt() {
  return (
    <svg viewBox="0 0 200 200" className={cn(base, 'animate-float')} aria-hidden>
      <circle cx="100" cy="100" r="80" fill="#fff" opacity="0.5" />
      <circle cx="100" cy="100" r="56" fill={NAVY} />
      <rect x="80" y="74" width="14" height="52" rx="5" fill="#fff" />
      <rect x="106" y="74" width="14" height="52" rx="5" fill="#fff" />
    </svg>
  );
}

// level: 0..1 microphone loudness while listening, so the child sees the kiosk hears them.
export function MicArt({ listening, level = 0 }: { listening?: boolean; level?: number }) {
  return (
    <svg viewBox="0 0 200 200" className={base} aria-hidden>
      {listening &&
        [0, 1, 2].map((i) => (
          <circle key={i} cx="100" cy="100" r="60" fill="none" stroke={ACCENT} strokeWidth="4" className="art-ring animate-ring" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
      {listening && <circle cx="100" cy="100" r={60 + level * 30} fill={ACCENT} opacity="0.18" />}
      <circle cx="100" cy="100" r="58" fill={NAVY} />
      <rect x="86" y="62" width="28" height="50" rx="14" fill="#fff" />
      <path d="M74 98a26 26 0 0 0 52 0M100 124v14M86 138h28" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function SparkArt({ spinning }: { spinning?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className={cn(base, spinning ? 'art-spin' : 'animate-float')} aria-hidden>
      <circle cx="100" cy="100" r="80" fill="#fff" opacity="0.45" />
      <path d="M100 30l14 42 42 14-42 14-14 42-14-42-42-14 42-14z" fill={NAVY} />
      <path d="M152 36l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill={BLUE} />
      <path d="M50 136l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill={ACCENT} />
    </svg>
  );
}

export function ThinkArt() {
  return (
    <svg viewBox="0 0 200 200" className={cn(base, 'animate-float')} aria-hidden>
      <circle cx="100" cy="100" r="80" fill="#fff" opacity="0.5" />
      <circle cx="100" cy="106" r="50" fill="#ffd36b" />
      <circle cx="82" cy="98" r="6" fill={NAVY} />
      <circle cx="118" cy="98" r="6" fill={NAVY} />
      <path d="M84 124q16 10 32 0" stroke={NAVY} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="150" cy="56" r="10" fill="#fff" />
      <circle cx="166" cy="34" r="14" fill="#fff" />
      <text x="160" y="40" fontSize="16" fontWeight="800" fill={BLUE}>?</text>
    </svg>
  );
}

export function OopsArt() {
  return (
    <svg viewBox="0 0 200 200" className={cn(base, 'animate-float')} aria-hidden>
      <circle cx="100" cy="100" r="80" fill="#fff" opacity="0.5" />
      <circle cx="100" cy="104" r="50" fill="#9ec5ff" />
      <path d="M80 96l10 6M90 96l-10 6M110 96l10 6M120 96l-10 6" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="100" cy="126" rx="9" ry="7" fill={NAVY} />
    </svg>
  );
}

export function PrinterArt() {
  return (
    <svg viewBox="0 0 320 170" className="relative z-[2] block w-full" aria-hidden>
      <rect x="70" y="8" width="180" height="40" rx="6" fill="#dfe6f1" />
      <rect x="10" y="40" width="300" height="110" rx="22" fill={NAVY} />
      <rect x="40" y="112" width="240" height="16" rx="8" fill="#0a1830" />
      <circle cx="270" cy="72" r="8" fill="#22c55e" className="animate-blink" />
      <rect x="36" y="64" width="80" height="10" rx="5" fill="#2c4c78" />
    </svg>
  );
}
