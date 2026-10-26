// The WishPix mark from Figma: a sparkle wand in a rounded navy square.
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--navy-800)" />
      <path d="M9 23 19 13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21 6.5l1.2 2.8 2.8 1.2-2.8 1.2L21 14.5l-1.2-2.8-2.8-1.2 2.8-1.2z" fill="var(--brand-500)" />
      <circle cx="11" cy="9" r="1.4" fill="#fff" />
      <circle cx="24.5" cy="20" r="1.2" fill="#fff" />
    </svg>
  )
}

export function Logo({ size = 32, light = false }) {
  return (
    <span className="wp-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: size / 3, fontWeight: 800, fontSize: size * 0.7, color: light ? '#fff' : 'var(--navy-900)' }}>
      <LogoMark size={size} />
      WishPix
    </span>
  )
}
