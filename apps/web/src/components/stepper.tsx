'use client';

import { Check } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Same steps as the Live Session monitor in the Teacher App.
const FLOW_STEPS = [
  { id: 'listening', label: 'Listening' },
  { id: 'processing', label: 'Processing' },
  { id: 'generating', label: 'Generating' },
  { id: 'printing', label: 'Printing' },
];

const ORDER: Record<string, number> = { ready: -1, listening: 0, heard: 0, processing: 1, generating: 2, printing: 3, preview: 4 };

// Light text: drawn on the dark navy pill (kiosk footer, Live Session card).
export function Stepper({ mode, size = 'md' }: { mode?: string | null; size?: 'md' | 'sm' }) {
  const t = useT();
  const at = ORDER[mode ?? ''] ?? -1;
  const dot = size === 'md' ? 'size-10 text-base' : 'size-7 text-xs';
  return (
    <ol className="m-0 flex list-none justify-center gap-1 p-0 sm:gap-2">
      {FLOW_STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'active' : 'todo';
        return (
          <li key={s.id} className="relative flex min-w-0 max-w-36 flex-1 flex-col items-center gap-1.5">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute h-[3px] -translate-y-1/2 rounded-full',
                  size === 'md' ? 'top-5' : 'top-3.5',
                  state === 'todo' ? 'bg-white/30' : 'bg-white/90'
                )}
                style={{ left: 'calc(-50% + 18px)', right: 'calc(50% + 20px)' }}
              />
            )}
            <span
              className={cn(
                'grid place-items-center rounded-full font-bold',
                dot,
                state === 'done' && 'bg-success text-white',
                state === 'active' && 'animate-step-pulse bg-blue-accent text-white shadow-[0_0_0_6px_rgba(29,107,255,0.3)]',
                state === 'todo' && 'bg-white/25 text-white/85'
              )}
            >
              {state === 'done' ? <Check className="size-1/2" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('max-w-full truncate text-center font-semibold', size === 'md' ? 'text-xs sm:text-[15px]' : 'text-[11px] sm:text-xs', state === 'todo' ? 'text-white/75' : 'text-white')}>
              {t(s.label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
