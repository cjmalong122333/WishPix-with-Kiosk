'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { pixiLine } from '@/components/pixi/lines';
import { Pixi, type PixiMood } from '@/components/pixi/pixi';
import { ThoughtBubble } from '@/components/pixi/thought-bubble';
import { cn } from '@/lib/utils';

// A preview of the Pixi animation, to check each mood before it goes on the
// kiosk screens. ?mood=listening starts in one mood, ?tour=1 plays them all
// in a loop, ?ui=0 hides the controls (for screen recording), ?img=/images/x.png
// shows a real picture on the worksheets. Keys 1-6 switch moods, 0 hides or
// shows Pixi's thought bubble.

const MOODS: { id: PixiMood; label: string; tour: number }[] = [
  { id: 'idle', label: 'Idle', tour: 9 },
  { id: 'listening', label: 'Listening', tour: 6 },
  { id: 'thinking', label: 'Thinking', tour: 5 },
  { id: 'generating', label: 'Generating', tour: 13 },
  { id: 'printing', label: 'Printing', tour: 11 },
  { id: 'success', label: 'Success', tour: 8 },
];

export function PixiPreview() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}

function Preview() {
  const params = useSearchParams();
  const start = MOODS.find((m) => m.id === params.get('mood'))?.id ?? 'idle';
  const [mood, setMood] = useState<PixiMood>(start);
  const [tour, setTour] = useState(params.get('tour') === '1');
  const [level, setLevel] = useState(0);
  const [bubble, setBubble] = useState(true);
  const showUi = params.get('ui') !== '0';
  const current = MOODS.find((m) => m.id === mood)!;

  // A pretend voice while listening, so the wand and "ears" react.
  useEffect(() => {
    if (mood !== 'listening') return;
    const started = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - started) / 1000;
      const words = Math.max(0, Math.sin(t * 2.1)) * (0.5 + 0.5 * Math.sin(t * 13.7) * Math.sin(t * 5.3));
      setLevel(Math.min(1, Math.abs(words) * 1.3));
    }, 60);
    return () => {
      clearInterval(timer);
      setLevel(0);
    };
  }, [mood]);

  // Tour: each mood for a while, then the next.
  useEffect(() => {
    if (!tour) return;
    const timer = setTimeout(() => {
      const i = MOODS.findIndex((m) => m.id === mood);
      setMood(MOODS[(i + 1) % MOODS.length].id);
    }, current.tour * 1000);
    return () => clearTimeout(timer);
  }, [tour, mood, current.tour]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0') return setBubble((v) => !v);
      const m = MOODS[Number(e.key) - 1];
      if (m) {
        setTour(false);
        setMood(m.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative grid h-dvh grid-rows-[1fr_auto] overflow-hidden select-none" style={{ background: 'var(--splash-gradient)' }}>
      <Pixi mood={mood} level={level} picture={params.get('img')} className="min-h-0">
        <ThoughtBubble text={bubble ? pixiLine(mood) : null} mood={mood} />
      </Pixi>

      {showUi && (
        <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-2 pb-6">
          {MOODS.map((m, i) => (
            <button
              key={m.id}
              onClick={() => {
                setTour(false);
                setMood(m.id);
              }}
              className={cn(
                'rounded-full border-0 px-4 py-2 text-sm font-bold transition',
                m.id === mood ? 'bg-navy-800 text-white' : 'bg-white/70 text-navy-800 hover:bg-white'
              )}
            >
              <span className="mr-1 opacity-50">{i + 1}</span> {m.label}
            </button>
          ))}
          <button
            onClick={() => setTour((v) => !v)}
            className={cn('rounded-full border-0 px-4 py-2 text-sm font-bold', tour ? 'bg-brand-600 text-white' : 'bg-white/70 text-navy-800')}
          >
            {tour ? 'Stop tour' : 'Play all'}
          </button>
        </div>
      )}
    </div>
  );
}
