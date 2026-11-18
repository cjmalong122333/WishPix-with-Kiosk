'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { isStandaloneApp } from '@/components/teacher/install-prompt';
import { PublicShell, WavingPixi } from '@/components/teacher/public-shell';

const STEPS = [
  {
    num: '01',
    title: 'Say it',
    desc: 'Tell Pixi what you want to learn about.',
  },
  {
    num: '02',
    title: 'Create it',
    desc: 'AI turns your words into learning materials.',
  },
  {
    num: '03',
    title: 'Print it',
    desc: 'Bring your creation to life, one page at a time.',
  },
];

// Staggered entrance: each element fades/rises in after its delay.
// `fill-mode-both` keeps it hidden until its delay elapses.
const reveal = (seconds: number) => ({ animationDelay: `${seconds}s` });

export default function TeacherHomePage() {
  const router = useRouter();
  const standalone = useSyncExternalStore(
    () => () => {},
    () => isStandaloneApp(window),
    () => false
  );

  useEffect(() => {
    if (standalone) {
      router.replace('/teacher/login');
    }
  }, [standalone, router]);

  if (standalone) {
    return null;
  }

  return (
    <PublicShell
      active="home"
      footer="Made for curious children and the grown-ups who help them learn."
    >
      <div className="mx-auto flex w-full max-w-[1154px] flex-col gap-10 lg:gap-12">
        {/* Top Hero: Left Pixi Circle & Right Headline */}
        <div className="grid items-center gap-8 lg:grid-cols-[320px_1fr] lg:gap-20">
          {/* Left Hero: Pixi Circle & Greeting */}
          <div className="mx-auto flex flex-col items-center text-center">
            <div className="relative size-56 animate-k-pop rounded-full bg-k-purple-soft fill-mode-both sm:size-64 lg:size-[320px]">
              {/* Gentle idle bob once the circle has popped in; on a wrapper because
                  WavingPixi centres itself with translate. */}
              <div className="absolute inset-0 animate-float" style={reveal(0.6)}>
                <WavingPixi className="absolute top-1/2 left-1/2 w-[308px] -translate-x-1/2 -translate-y-1/2 sm:w-[352px] lg:w-[440px]" />
              </div>
            </div>
            <h2
              className="relative z-10 -mt-5 m-0 animate-k-in text-2xl leading-[1.15] font-extrabold tracking-[-0.01em] text-k-ink fill-mode-both sm:-mt-6 sm:text-3xl lg:-mt-[28px] lg:text-[35px]"
              style={reveal(0.25)}
            >
              Hi! I’m Pixi!
            </h2>
            <p
              className="relative z-10 mt-1.5 m-0 animate-k-in text-base font-medium text-k-muted fill-mode-both sm:text-lg lg:text-[19.5px]"
              style={reveal(0.35)}
            >
              Your WishPix Companion!
            </p>
          </div>

          {/* Right Hero: Headline & Description */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <p
              className="m-0 animate-k-in text-xs font-extrabold tracking-[0.03em] text-k-purple uppercase fill-mode-both sm:text-[13.5px]"
              style={reveal(0.15)}
            >
              BIG IMAGINATIONS. LITTLE LEARNERS.
            </p>
            <h1
              className="mt-3 m-0 animate-k-in text-3xl leading-[1.12] font-extrabold tracking-[-0.015em] text-k-ink fill-mode-both sm:text-4xl lg:mt-[14px] lg:text-[52px]"
              style={reveal(0.25)}
            >
              Big ideas start
              <br />
              with a little voice.
            </h1>
            <p
              className="mt-4 m-0 max-w-[560px] animate-k-in text-base leading-[1.42] font-medium text-k-muted fill-mode-both sm:mt-5 sm:text-lg lg:mt-6 lg:text-[21.5px]"
              style={reveal(0.4)}
            >
              Children speak their ideas. WishPix turns their words into AI prompts and creates printable learning materials—ready to explore, colour, and learn.
            </p>
            <p
              className="mt-5 m-0 animate-k-in text-sm font-medium text-k-muted fill-mode-both sm:mt-7 sm:text-base"
              style={reveal(0.55)}
            >
              Speak an idea. See what grows.
            </p>
          </div>
        </div>

        {/* Bottom Section: 3 Steps */}
        <div>
          <h2
            className="m-0 animate-k-in text-center text-xl font-extrabold tracking-[-0.01em] text-k-ink fill-mode-both sm:text-2xl lg:text-left lg:text-[26px]"
            style={reveal(0.7)}
          >
            A little voice. A world of learning.
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3 lg:mt-5 lg:gap-6">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className="flex animate-k-in items-start gap-4 rounded-[20px] bg-white p-5 transition-transform fill-mode-both hover:-translate-y-1 lg:min-h-[122px] lg:rounded-[22px] lg:px-[22px] lg:py-[22px]"
                style={reveal(0.8 + i * 0.12)}
              >
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-k-purple-soft text-base font-extrabold text-k-purple lg:mt-1 lg:size-[42px] lg:text-[16.5px]">
                  {step.num}
                </span>
                <div className="flex flex-col">
                  <b className="text-lg leading-tight font-extrabold text-k-ink lg:text-[20px]">{step.title}</b>
                  <p className="mt-1.5 m-0 text-sm leading-[1.35] font-medium text-k-muted lg:text-[15.5px]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
