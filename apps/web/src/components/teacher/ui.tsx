'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/status';

// Small building blocks shared by the Teacher App pages, matched to the
// WishPix Figma screens.

export function PageTitle({ title, lead, children, small }: { title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode; small?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className={cn('m-0 font-extrabold tracking-tight text-foreground', small ? 'text-xl' : 'text-2xl')}>{title}</h1>
        {lead && <p className="mt-0.5 text-sm text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

export function SectionHead({ title, children, lead }: { title: React.ReactNode; children?: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <div className="mt-6 mb-2.5 flex items-baseline justify-between gap-3">
      <div>
        <h3 className="m-0 text-[13px] font-bold tracking-[0.06em] text-slate-600 uppercase">{title}</h3>
        {lead && <p className="m-0 text-[13px] text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

export const TINTS = {
  blue: 'bg-[#eaf2ff] text-[#1d6bff]',
  purple: 'bg-[#f4ecff] text-[#9333ea]',
  indigo: 'bg-[#eef0ff] text-[#4f46e5]',
  green: 'bg-[#e8f7ee] text-[#16a34a]',
  red: 'bg-[#fdecef] text-[#e11d48]',
  amber: 'bg-[#fff7e0] text-[#d97706]',
  gray: 'bg-[#f1f4f8] text-[#475569]',
  orange: 'bg-[#fff1e6] text-[#ea580c]',
  pink: 'bg-[#fdeef6] text-[#db2777]',
  navy: 'bg-brand-700 text-white',
} as const;
export type TintName = keyof typeof TINTS;

export function Tint({ tone, children, size = 'md', className }: { tone: TintName; children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'size-[30px] rounded-lg', md: 'size-9 rounded-[10px]', lg: 'size-11 rounded-xl' };
  return <i className={cn('grid shrink-0 place-items-center not-italic [&_svg]:size-[18px]', sizes[size], TINTS[tone], className)}>{children}</i>;
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('min-w-0 rounded-[14px] border bg-card p-4 shadow-card', className)}>{children}</div>;
}

// Summary card used on the Dashboard and the management pages.
export function Stat({ label, value, note, icon, tone, small }: { label: string; value: React.ReactNode; note?: React.ReactNode; icon?: React.ReactNode; tone: TintName; small?: boolean }) {
  return (
    <Panel className="p-3.5">
      <div className="flex justify-between gap-2 text-[13px] text-slate-600">
        <span>{label}</span>
        {icon && <Tint tone={tone}>{icon}</Tint>}
      </div>
      <b className={cn('mt-3 block truncate font-extrabold text-foreground', small ? 'text-[19px]' : 'text-2xl')}>{value ?? '–'}</b>
      {note && <small className="text-xs text-muted-foreground">{note}</small>}
    </Panel>
  );
}

export function Stats({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>;
}

// A row of choices where exactly one is picked (date range, filters).
export function Chips<V extends string>({ label, options, value, onChange }: { label: string; options: [V, string][]; value: V; onChange: (v: V) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-[13px] font-semibold transition',
            value === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-slate-600 hover:bg-accent'
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

const TONES: Record<Tone, string> = {
  blue: 'bg-[#eaf2ff] text-[#1d4ed8]',
  red: 'bg-danger-bg text-danger',
  amber: 'bg-warning-bg text-[#b45309]',
  gray: 'bg-[#f1f4f8] text-slate-600',
  green: 'bg-success-bg text-success',
};

export function Tag({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export function Empty({ icon, title, text, children }: { icon?: React.ReactNode; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed bg-card px-6 py-10 text-center">
      {icon && <span className="text-muted-foreground [&_svg]:size-8">{icon}</span>}
      <b className="text-foreground">{title}</b>
      {text && <p className="m-0 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {children}
    </div>
  );
}

export function Warn({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-[10px] bg-warning-bg px-3 py-2.5 text-[13px] text-amber-800">{children}</p>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-2.5 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

// A picture thumbnail (or a placeholder when there is none).
export function Thumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={cn('size-14 shrink-0 rounded-lg border bg-white object-cover', className)} />
  ) : (
    <span className={cn('grid size-14 shrink-0 place-items-center rounded-lg border bg-muted text-xs text-muted-foreground', className)}>—</span>
  );
}

// Dark navy card at the top of the Dashboard and Live Session.
export function Hero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn('relative mt-[18px] overflow-hidden rounded-2xl p-5 text-white', className)}
      style={{ background: 'radial-gradient(circle at 100% 100%, rgba(29,107,255,0.35), transparent 45%), linear-gradient(135deg, #0b1f3a, #11284a)' }}
    >
      {children}
    </section>
  );
}

export function OnlinePill({ online, onText, offText }: { online?: boolean; onText: string; offText: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        online ? 'border-[#4ade80]/35 bg-[#22c55e]/15 text-[#4ade80]' : 'border-[#f87171]/35 bg-[#f87171]/15 text-[#fca5a5]'
      )}
    >
      <i className={cn('size-[7px] rounded-full', online ? 'bg-[#4ade80]' : 'bg-[#f87171]')} />
      {online ? onText : offText}
    </span>
  );
}

// A bar with a short message and a link: "Printer: Paper jam. Fix it →".
export function NoticeBar({ icon, text, href, link, warn }: { icon: React.ReactNode; text: string; href: string; link: string; warn?: boolean }) {
  return (
    <div
      className={cn(
        'mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-4 py-3.5 text-sm text-slate-700',
        warn ? 'border-[#f6c9d2] bg-danger-bg [&_svg]:text-danger' : 'border-[#d6e6fb] bg-[#eef5ff] [&_svg]:text-[#d4a017]'
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {text}
      </span>
      <Link href={href} className="font-bold text-blue-700 no-underline">
        {link} →
      </Link>
    </div>
  );
}

// One row in a list of requests or events.
export function Row({ children, className, href }: { children: React.ReactNode; className?: string; href?: string }) {
  const cls = cn('flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-card', href && 'no-underline hover:border-[#f3a3b4]', className);
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}
