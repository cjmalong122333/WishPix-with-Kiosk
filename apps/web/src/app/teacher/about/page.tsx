'use client';

import { PublicShell, WavingPixi } from '@/components/teacher/public-shell';

const FLOW_STEPS = [
  {
    label: '01 · SPEAK',
    desc: 'A child shares an idea in their own words.',
  },
  {
    label: '02 · GENERATE',
    desc: 'WishPix turns speech into a prompt for AI.',
  },
  {
    label: '03 · PRINT',
    desc: 'AI creates materials for learning off-screen.',
  },
];

// Staggered entrance, matching the home page: each element fades/rises in
// after its delay. `fill-mode-both` keeps it hidden until its delay elapses.
const reveal = (seconds: number) => ({ animationDelay: `${seconds}s` });

export default function TeacherAboutPage() {
  return (
    <PublicShell
      active="about"
      footer="A little imagination can open a whole world of learning."
    >
      {/* Top Left: About WishPix Text */}
      <div className="absolute top-[15.6rem] left-[5.7rem] flex w-[66rem] flex-col items-start">
        <p
          className="m-0 animate-k-in text-[1.4rem] font-extrabold tracking-[0.03em] text-k-purple uppercase fill-mode-both"
          style={reveal(0.15)}
        >
          ABOUT WISHPIX
        </p>
        <h1
          className="mt-[1.4rem] m-0 animate-k-in text-[5.2rem] leading-[1.12] font-extrabold tracking-[-0.015em] text-k-ink fill-mode-both"
          style={reveal(0.25)}
        >
          Their curiosity.
          <br />
          A new way to learn.
        </h1>
        <p
          className="mt-[2.6rem] m-0 max-w-[52rem] animate-k-in text-[2.15rem] leading-[1.42] font-medium text-k-muted fill-mode-both"
          style={reveal(0.4)}
        >
          Every child has a world of ideas. WishPix helps turn those spoken ideas into printable learning materials, connecting imagination with hands-on discovery.
        </p>
      </div>

      {/* Top Right: Soft Lavender Pixi Card */}
      <div className="absolute top-[14.3rem] left-[78.8rem] flex h-[33.2rem] w-[42.8rem] flex-col items-center justify-center animate-k-pop rounded-[2.8rem] bg-k-purple-soft px-[2.4rem] fill-mode-both">
        {/* Gentle idle bob once the card has popped in. */}
        <div className="-mt-[1.6rem] shrink-0 animate-float" style={reveal(0.6)}>
          <WavingPixi className="w-[33.6rem]" />
        </div>
        <p
          className="mt-[0.4rem] m-0 animate-k-in text-center text-[2rem] font-extrabold text-k-purple fill-mode-both"
          style={reveal(0.35)}
        >
          “What would you like to learn today?”
        </p>
      </div>

      {/* Bottom Left: Our Purpose Purple Card */}
      <div className="absolute top-[51.8rem] left-[5.7rem] flex h-[19.8rem] w-[43.2rem] flex-col justify-center animate-k-in rounded-[2.8rem] bg-k-purple px-[3rem] py-[2.8rem] text-white transition-transform fill-mode-both hover:-translate-y-[0.4rem]"
        style={reveal(0.7)}
      >
        <p className="m-0 text-[1.35rem] font-extrabold tracking-[0.03em] text-[#e2d4fb] uppercase">
          OUR PURPOSE
        </p>
        <h2 className="mt-[1rem] m-0 text-[3.1rem] leading-[1.15] font-extrabold tracking-[-0.01em] text-white">
          More wonder.
          <br />
          More ways to learn.
        </h2>
        <p className="mt-[1.4rem] m-0 text-[1.7rem] font-medium text-[#e9defc]">
          Let children’s interests lead the way.
        </p>
      </div>

      {/* Bottom Right: From a spoken wish to a printed page White Card */}
      <div className="absolute top-[51.8rem] left-[51.5rem] flex h-[19.8rem] w-[70.1rem] flex-col justify-center animate-k-in rounded-[2.8rem] bg-white px-[3.2rem] py-[2.8rem] transition-transform fill-mode-both hover:-translate-y-[0.4rem]"
        style={reveal(0.82)}
      >
        <h2 className="m-0 text-[2.45rem] font-extrabold tracking-[-0.01em] text-k-ink">
          From a spoken wish to a printed page
        </h2>
        <div className="mt-[2.2rem] grid grid-cols-3 gap-[2.8rem]">
          {FLOW_STEPS.map((step, i) => (
            <div
              key={step.label}
              className="flex animate-k-in flex-col fill-mode-both"
              style={reveal(0.95 + i * 0.12)}
            >
              <b className="text-[1.4rem] font-extrabold tracking-[0.02em] text-k-purple uppercase">
                {step.label}
              </b>
              <p className="mt-[0.8rem] m-0 text-[1.65rem] leading-[1.38] font-medium text-k-muted">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
