'use client';

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
  return (
    <PublicShell
      active="home"
      footer="Made for curious children and the grown-ups who help them learn."
    >
      {/* Left Hero: Pixi Circle & Greeting */}
      <div className="absolute top-[16.6rem] left-[7.4rem] flex w-[32rem] flex-col items-center text-center">
        <div className="relative size-[32rem] animate-k-pop rounded-full bg-k-purple-soft fill-mode-both">
          {/* Gentle idle bob once the circle has popped in; on a wrapper because
              WavingPixi centres itself with translate. */}
          <div className="absolute inset-0 animate-float" style={reveal(0.6)}>
            <WavingPixi className="absolute top-1/2 left-1/2 w-[44rem] -translate-x-1/2 -translate-y-1/2" />
          </div>
        </div>
        <h2
          className="relative z-10 -mt-[2.8rem] m-0 animate-k-in text-[3.5rem] leading-[1.15] font-extrabold tracking-[-0.01em] text-k-ink fill-mode-both"
          style={reveal(0.25)}
        >
          Hi! I’m Pixi!
        </h2>
        <p
          className="relative z-10 mt-[0.6rem] m-0 animate-k-in text-[1.95rem] font-medium text-k-muted fill-mode-both"
          style={reveal(0.35)}
        >
          Your WishPix Companion!
        </p>
      </div>

      {/* Right Hero: Headline & Description */}
      <div className="absolute top-[16.2rem] left-[47.6rem] flex w-[68rem] flex-col items-start">
        <p
          className="m-0 animate-k-in text-[1.35rem] font-extrabold tracking-[0.03em] text-k-purple uppercase fill-mode-both"
          style={reveal(0.15)}
        >
          BIG IMAGINATIONS. LITTLE LEARNERS.
        </p>
        <h1
          className="mt-[1.4rem] m-0 animate-k-in text-[5.2rem] leading-[1.12] font-extrabold tracking-[-0.015em] text-k-ink fill-mode-both"
          style={reveal(0.25)}
        >
          Big ideas start
          <br />
          with a little voice.
        </h1>
        <p
          className="mt-[2.4rem] m-0 max-w-[56rem] animate-k-in text-[2.15rem] leading-[1.42] font-medium text-k-muted fill-mode-both"
          style={reveal(0.4)}
        >
          Children speak their ideas. WishPix turns their words into AI prompts and creates printable learning materials—ready to explore, colour, and learn.
        </p>
        <p
          className="mt-[3.4rem] m-0 animate-k-in text-[1.6rem] font-medium text-k-muted fill-mode-both"
          style={reveal(0.55)}
        >
          Speak an idea. See what grows.
        </p>
      </div>

      {/* Bottom Section: 3 Steps */}
      <h2
        className="absolute top-[55.6rem] left-[5.8rem] m-0 animate-k-in text-[2.6rem] font-extrabold tracking-[-0.01em] text-k-ink fill-mode-both"
        style={reveal(0.7)}
      >
        A little voice. A world of learning.
      </h2>

      <div className="absolute top-[60.8rem] left-[5.8rem] grid w-[115.4rem] grid-cols-3 gap-[2.4rem]">
        {STEPS.map((step, i) => (
          <div
            key={step.num}
            className="flex h-[12.2rem] animate-k-in items-start gap-[1.6rem] rounded-[2.2rem] bg-white px-[2.2rem] py-[2.2rem] transition-transform fill-mode-both hover:-translate-y-[0.4rem]"
            style={reveal(0.8 + i * 0.12)}
          >
            <span className="mt-[0.4rem] grid size-[4.2rem] shrink-0 place-items-center rounded-full bg-k-purple-soft text-[1.65rem] font-extrabold text-k-purple">
              {step.num}
            </span>
            <div className="flex flex-col">
              <b className="text-[2rem] leading-tight font-extrabold text-k-ink">{step.title}</b>
              <p className="mt-[0.6rem] m-0 text-[1.55rem] leading-[1.35] font-medium text-k-muted">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </PublicShell>
  );
}
