'use client';

import { useT, type T } from '@/i18n';
import type { Current, Sheet as SheetData } from '@/lib/types';
import { cn } from '@/lib/utils';

// The printed page as the child sees it on screen: 4x6 in portrait, laid
// out like the hardware service prints it. Sizes use container units, so
// the sheet scales with its box.

type Props = { current: Current | null; activityType?: string; theme?: string; compact?: boolean };

export function Sheet({ current, activityType, theme, compact }: Props) {
  const t = useT();
  const sheet = current?.sheet ?? null;
  const date = new Date().toLocaleDateString(t.locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const label = current?.label ? (t.lang === 'fil' ? current.label.fil : current.label.en) : null;
  const caption = activityType === 'free_play' ? current?.recognizedText : label;
  const img = current?.imageUrl ?? undefined;

  return (
    <div className="@container size-full">
      <article
        className={cn('flex aspect-[2/3] w-full flex-col bg-white text-[#111]', activityType !== 'free_play' && '[&_img]:grayscale [&_img]:contrast-150')}
        style={{ padding: '5cqw 6cqw' }}
      >
        <header className="flex justify-between border-b border-[#e5e9f0]" style={{ fontSize: '2.8cqw', paddingBottom: '1.6cqw' }}>
          <span className="font-extrabold text-navy-800">WishPix</span>
          <span className="text-[#8a94a6]">{[theme ? t(theme) : '', date].filter(Boolean).join(' · ')}</span>
        </header>

        {activityType === 'color_create' && <Title>{t('Color me!')}</Title>}
        {activityType === 'trace_learn' && <Title>{traceTitle(sheet, t)}</Title>}

        <div className="flex min-h-0 flex-1 items-center justify-center">
          {activityType === 'trace_learn' && sheet ? (
            <TraceLayout sheet={sheet} imageUrl={img} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="max-h-full max-w-full object-contain" src={img} alt={current?.recognizedText ?? ''} />
          )}
        </div>

        {caption && activityType !== 'trace_learn' && (
          <p className="m-0 text-center font-bold first-letter:uppercase" style={{ fontSize: '6cqw', marginTop: '2cqw' }}>
            {caption}
          </p>
        )}

        {!compact && (
          <footer className="flex items-end" style={{ gap: '2cqw', marginTop: '3cqw', fontSize: '4.2cqw' }}>
            <span className="font-bold">{t('Name:')}</span>
            <i className="flex-1 border-b-[0.4cqw] border-[#333]" style={{ marginBottom: '1cqw' }} />
          </footer>
        )}
      </article>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="m-0 text-center font-bold" style={{ fontSize: '7.5cqw', margin: '3cqw 0 1cqw' }}>
      {children}
    </h2>
  );
}

function traceTitle(sheet: SheetData | null, t: T) {
  switch (sheet?.kind) {
    case 'letter': return t('{letter} is for {word}', { letter: sheet.letter, word: sheet.word });
    case 'number': return t('Count and trace');
    case 'shape': return t('Trace the {shape}s', { shape: t(sheet.shape) });
    case 'prewriting': return t('Follow the dotted line');
    case 'word': return t('Trace the word');
    default: return t('Trace & Learn');
  }
}

function Pic({ src, className }: { src?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cn('max-h-[34%] max-w-[60%] object-contain', className)} src={src} alt="" />;
}

function TraceLayout({ sheet, imageUrl }: { sheet: SheetData; imageUrl?: string }) {
  const wrap = 'flex size-full flex-col items-center justify-evenly';
  switch (sheet.kind) {
    case 'letter':
      return (
        <div className={wrap}>
          <Pic src={imageUrl} />
          <DottedText text={`${sheet.letter}${sheet.letter.toLowerCase()}`} size={150} />
          <DottedText text={`${sheet.letter} ${sheet.letter.toLowerCase()} `.repeat(2).trim()} size={60} />
        </div>
      );
    case 'number':
      return (
        <div className={wrap}>
          <Pic src={imageUrl} className="max-h-[30%] max-w-[90%]" />
          <DottedText text={String(sheet.count)} size={150} />
          <DottedText text={Array(5).fill(sheet.count).join(' ')} size={60} />
        </div>
      );
    case 'shape':
      return (
        <div className={wrap}>
          <Pic src={imageUrl} />
          <div className="grid w-[70%] grid-cols-2" style={{ gap: '4cqw' }}>
            {[0, 1, 2, 3].map((i) => (
              <DottedShape key={i} shape={sheet.shape} />
            ))}
          </div>
        </div>
      );
    case 'prewriting':
      return (
        <div className={wrap}>
          <Pic src={imageUrl} className="max-h-[26%]" />
          {[0, 1, 2].map((i) => (
            <DottedPath key={i} kind={sheet.path} />
          ))}
        </div>
      );
    case 'word':
      return (
        <div className={wrap}>
          <Pic src={imageUrl} />
          <DottedText text={sheet.word.toLowerCase()} size={sheet.word.length > 5 ? 80 : 110} />
          <DottedText text={sheet.word.toLowerCase()} size={sheet.word.length > 5 ? 56 : 72} />
        </div>
      );
  }
}

const DOT = { fill: 'none', stroke: '#3d4656', strokeLinecap: 'round' as const };

// Outline letters drawn with dots, plus a writing baseline.
function DottedText({ text, size }: { text: string; size: number }) {
  const w = Math.max(text.length * size * 0.62, size);
  return (
    <svg className="max-h-[30%] w-full overflow-visible" viewBox={`0 0 ${w} ${size * 1.15}`} role="img" aria-label={text}>
      <line x1="0" x2={w} y1={size * 0.98} y2={size * 0.98} stroke="#c9d0db" strokeWidth="1.5" />
      <line x1="0" x2={w} y1={size * 0.5} y2={size * 0.5} stroke="#e2e6ec" strokeWidth="1" strokeDasharray="6 6" />
      <text x={w / 2} y={size * 0.96} fontSize={size} textAnchor="middle" fontWeight={700} {...DOT} strokeWidth={3.2} strokeDasharray="0.1 6.5">
        {text}
      </text>
    </svg>
  );
}

function DottedShape({ shape }: { shape: string }) {
  const shapes: Record<string, React.ReactNode> = {
    circle: <circle cx="50" cy="50" r="40" />,
    square: <rect x="12" y="12" width="76" height="76" />,
    triangle: <path d="M50 10 90 88H10z" />,
    star: <path d="M50 8l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 39l30-3z" />,
    heart: <path d="M50 88S10 62 10 36a20 20 0 0 1 40-6 20 20 0 0 1 40 6c0 26-40 52-40 52z" />,
  };
  return (
    <svg className="aspect-square w-full" viewBox="0 0 100 100">
      <g {...DOT} strokeWidth={3.5} strokeDasharray="0.1 8">
        {shapes[shape] ?? shapes.circle}
      </g>
    </svg>
  );
}

function DottedPath({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    zigzag: 'M10 60 L50 15 L90 60 L130 15 L170 60 L210 15 L250 60 L290 15 L330 60 L370 15 L410 60',
    wave: 'M10 40 Q50 0 90 40 T170 40 T250 40 T330 40 T410 40',
    loops:
      'M10 50 C40 50 50 10 70 10 S90 50 70 50 S90 10 130 10 S150 50 130 50 S150 10 190 10 S210 50 190 50 S210 10 250 10 S270 50 250 50 S270 10 310 10 S330 50 310 50 S330 10 370 10 S410 50 410 50',
    bumps: 'M10 60 Q50 0 90 60 Q130 0 170 60 Q210 0 250 60 Q290 0 330 60 Q370 0 410 60',
  };
  return (
    <svg className="max-h-[14%] w-full" viewBox="0 0 420 70">
      <circle cx="10" cy={kind === 'wave' ? 40 : kind === 'loops' ? 50 : 60} r="6" fill="var(--success)" />
      <path d={paths[kind] ?? paths.wave} {...DOT} strokeWidth={5} strokeDasharray="0.1 11" />
    </svg>
  );
}
