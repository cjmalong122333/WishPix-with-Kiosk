'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { cloudPath } from './cloud';
import { usePixiAnchor, usePixiHeadroom, type PixiMood } from './pixi';
import styles from './thought-bubble.module.css';

// The little circles between Pixi's head (0) and the bubble (1), smallest
// first, with their size in em.
const CIRCLES = [
  { at: 0.17, size: 0.36 },
  { at: 0.46, size: 0.54 },
  { at: 0.76, size: 0.76 },
];
// Where the circles meet the bubble, as a share of its width and height.
const TAIL_X = 0.66;
const TAIL_Y = 0.9;
// Moods where Pixi is busy, shown with bouncing "..." dots.
const BUSY: PixiMood[] = ['thinking', 'generating'];
// Outlines to switch between, like Pixi's crayon lines (6 times a second).
const BOILS = 3;
const MARGIN = 6;
// Space between the crest and the bubble, in scene units (as in scene.ts).
const GAP = 0.06;

type Size = { w: number; h: number; em: number };

// Pixi's words in a cartoon thought bubble that floats above its head, with
// circles trailing down to it. Put it inside <Pixi>, which tells it where the
// head is each frame. No text: the bubble fades away. Display only.
export function ThoughtBubble({ text, mood, className }: { text: string | null | undefined; mood: PixiMood; className?: string }) {
  // Keep the last words while the bubble fades away, and pop it in again
  // (a new key restarts the animation) when they change.
  const [shown, setShown] = useState(text || '');
  const [pop, setPop] = useState(0);
  const [prev, setPrev] = useState(text);
  if (text !== prev) {
    setPrev(text);
    if (text) {
      setShown(text);
      setPop((n) => n + 1);
    }
  }

  const layer = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const circles = useRef<(HTMLDivElement | null)[]>([]);
  const box = useRef<Size>({ w: 0, h: 0, em: 16 });
  const [size, setSize] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.offsetWidth, h: el.offsetHeight, em: parseFloat(getComputedStyle(el).fontSize) || 16 };
      box.current = next;
      setSize((s) => (s && s.w === next.w && s.h === next.h && s.em === next.em ? s : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Room above Pixi's crest for the bubble (the camera zooms out to make it).
  usePixiHeadroom(text && size ? size.h + MARGIN : 0);

  // Every frame: up and to the left of the crest (the wand is on the right),
  // kept inside the canvas, with the circles leading back to the head.
  usePixiAnchor((a) => {
    const { w, h } = box.current;
    if (!body.current || !layer.current || !w) return;
    let x = a.crestX - 0.38 * a.unit - w;
    let y = a.crestY - GAP * a.unit - h;
    if (y < MARGIN) {
      // No room above the crest: slide down beside it instead.
      y = MARGIN;
      x = Math.min(x, a.crestX - 0.46 * a.unit - w);
    }
    x = Math.min(Math.max(x, MARGIN), a.width - w - MARGIN);
    body.current.style.transform = `translate3d(${x}px,${y}px,0)`;
    const tx = x + w * TAIL_X;
    const ty = y + h * TAIL_Y;
    CIRCLES.forEach((c, i) => {
      const el = circles.current[i];
      if (el) el.style.transform = `translate3d(${a.headX + (tx - a.headX) * c.at}px,${a.headY + (ty - a.headY) * c.at}px,0)`;
    });
    // Shown (and the pop animation started) once it is in place.
    if (!('placed' in layer.current.dataset)) layer.current.dataset.placed = '';
  });

  const cloud = useMemo(() => {
    if (!size) return null;
    const { w, h, em } = size;
    const bump = Math.min(Math.max(h * 0.42, em * 1.2), em * 2);
    return {
      w,
      h,
      base: cloudPath(w, h, { bump }),
      boils: Array.from({ length: BOILS }, (_, i) => ({
        line: cloudPath(w, h, { bump, seed: i * 2 + 1, wobble: 1.3 }),
        sketch: cloudPath(w, h, { bump, seed: i * 2 + 2, wobble: 2.4 }),
      })),
    };
  }, [size]);

  // The dots stay with the last word, so they never wrap onto a line alone.
  const busy = BUSY.includes(mood);
  const cut = shown.lastIndexOf(' ') + 1;

  return (
    <div ref={layer} className={cn(styles.layer, className)} data-out={text ? undefined : ''} aria-hidden={!text}>
      {CIRCLES.map((c, i) => (
        <div
          key={i}
          ref={(el) => {
            circles.current[i] = el;
          }}
          className={styles.pos}
        >
          <div className={styles.fade} style={{ '--i': i, '--out': CIRCLES.length - i } as React.CSSProperties}>
            <span key={pop} className={styles.circle} style={{ '--s': `${c.size}em` } as React.CSSProperties} />
          </div>
        </div>
      ))}
      <div ref={body} className={cn(styles.pos, styles.body)} style={{ '--tail-x': `${TAIL_X * 100}%`, '--tail-y': `${TAIL_Y * 100}%` } as React.CSSProperties}>
        <div className={styles.fade}>
          <div key={pop} className={styles.pop}>
            {cloud && (
              <svg className={styles.cloud} width={cloud.w} height={cloud.h} viewBox={`0 0 ${cloud.w} ${cloud.h}`} aria-hidden>
                <path d={cloud.base} className={styles.glow} />
                <path d={cloud.base} className={styles.fill} />
                {cloud.boils.map((b, i) => (
                  <g key={i} className={styles.boil} style={{ opacity: i ? 0 : 1, animationDelay: `${(-i * 0.5) / BOILS}s` }}>
                    <path d={b.sketch} className={styles.sketch} />
                    <path d={b.line} className={styles.line} />
                  </g>
                ))}
              </svg>
            )}
            <p className={styles.text} aria-live="polite">
              {shown.slice(0, cut)}
              <span className="whitespace-nowrap">
                {shown.slice(cut)}
                {busy && (
                  <span className={styles.dots} aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
