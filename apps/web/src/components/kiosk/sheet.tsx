'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import type { Current, Sheet as SheetData } from '@/lib/types';

// The printed page as the child (or teacher) sees it on screen.
//
// Normally this is the page itself: /api/pages/<id> asks the hardware
// service to draw it with the same code and paper size as the printer (a
// 4x6 inkjet sheet, or a 58 mm thermal strip), so the preview always
// matches the print. Only when that is not possible (the printer service is
// not running, or a demo screen) is the page drawn here instead, roughly.

type Props = { current: Current | null; activityType?: string; theme?: string; compact?: boolean };

export function Sheet(props: Props) {
  const { current } = props;
  const src = current?.pageUrl ?? (current?.id ? `/api/pages/${current.id}` : null);
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="block max-h-[inherit] w-full bg-white object-contain"
        src={src}
        alt={current?.recognizedText ?? ''}
        onError={() => setFailed(src)}
      />
    );
  }
  return <DrawnSheet {...props} />;
}

const INSTRUCTION = 'Color the picture and share something about it with your teacher or classmates.';

// The three pages, roughly as the hardware service lays them out
// (services/hardware/app/layout.py): black on white only.
function DrawnSheet({ current, activityType }: Props) {
  const t = useT();
  const sheet = current?.sheet ?? null;
  const words = wordsOf(sheet, current);
  const kind = sheet && 'en' in sheet ? sheet.kind : activityType === 'trace_learn' ? 'trace_image' : 'coloring';
  const both = [words.en, words.fil].filter(Boolean).map((w) => w.toUpperCase());
  const label = [...new Set(both)].join(' / ');
  const img = current?.imageUrl ?? undefined;

  return (
    <div className="@container size-full">
      <article className="flex aspect-[2/3] w-full flex-col bg-white text-black [&_img]:grayscale [&_img]:contrast-200" style={{ padding: '6cqw' }}>
        {kind === 'trace_word' && (
          <div className="flex flex-1 flex-col justify-around">
            {[0, 1, 2, 3].map((i) => (
              <DottedText key={i} text={label} />
            ))}
          </div>
        )}
        {kind === 'trace_image' && (
          <>
            <div className="flex min-h-0 flex-[3] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img && <img className="max-h-full max-w-full object-contain opacity-60" src={img} alt="" />}
            </div>
            <div className="flex flex-1 items-center">
              <DottedText text={label} />
            </div>
          </>
        )}
        {kind === 'coloring' && (
          <>
            <p className="m-0 text-center" style={{ fontSize: '3cqw' }}>
              {t(INSTRUCTION)}
            </p>
            <div className="flex min-h-0 flex-1 items-center justify-center py-[3cqw]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img && <img className="max-h-full max-w-full object-contain" src={img} alt="" />}
            </div>
            <p className="m-0 text-center font-black tracking-[0.06em] uppercase" style={{ fontSize: '10cqw', lineHeight: 1 }}>
              {(t.lang === 'fil' && words.fil) || words.en}
            </p>
          </>
        )}
      </article>
    </div>
  );
}

function wordsOf(sheet: SheetData | null, current: Current | null): { en: string; fil: string } {
  if (sheet && 'en' in sheet) return { en: sheet.en, fil: sheet.fil };
  if (sheet && 'word' in sheet) return { en: sheet.word, fil: '' };
  return { en: current?.label?.en ?? '', fil: current?.label?.fil ?? '' };
}

// Capital letters drawn with dots along the strokes, roughly.
function DottedText({ text }: { text: string }) {
  const size = 100;
  const w = Math.max(text.length * size * 0.78, size);
  return (
    <svg className="w-full overflow-visible" viewBox={`0 0 ${w} ${size * 1.2}`} role="img" aria-label={text}>
      <text
        x={w / 2}
        y={size * 0.95}
        fontSize={size}
        textAnchor="middle"
        letterSpacing={size * 0.18}
        fontWeight={400}
        fill="none"
        stroke="#000"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray="0.1 9"
      >
        {text}
      </text>
    </svg>
  );
}
