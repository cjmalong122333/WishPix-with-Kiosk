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
      <div className="mx-auto flex w-full max-w-[1158px] flex-col gap-6 lg:gap-8">
        {/* Top Row: About WishPix Text & Lavender Pixi Card */}
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_428px] lg:gap-12">
          {/* Top Left: About WishPix Text */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <p
              className="m-0 animate-k-in text-xs font-extrabold tracking-[0.03em] text-k-purple uppercase fill-mode-both sm:text-[14px]"
              style={reveal(0.15)}
            >
              ABOUT WISHPIX
            </p>
            <h1
              className="mt-3 m-0 animate-k-in text-3xl leading-[1.12] font-extrabold tracking-[-0.015em] text-k-ink fill-mode-both sm:text-4xl lg:mt-[14px] lg:text-[52px]"
              style={reveal(0.25)}
            >
              Their curiosity.
              <br />
              A new way to learn.
            </h1>
            <p
              className="mt-4 m-0 max-w-[520px] animate-k-in text-base leading-[1.42] font-medium text-k-muted fill-mode-both sm:mt-5 sm:text-lg lg:mt-[26px] lg:text-[21.5px]"
              style={reveal(0.4)}
            >
              Every child has a world of ideas. WishPix helps turn those spoken ideas into printable learning materials, connecting imagination with hands-on discovery.
            </p>
          </div>

          {/* Top Right: Soft Lavender Pixi Card */}
          <div className="mx-auto flex w-full max-w-[428px] flex-col items-center justify-center animate-k-pop rounded-[24px] bg-k-purple-soft px-6 py-6 fill-mode-both lg:h-[332px] lg:rounded-[28px]">
            {/* Gentle idle bob once the card has popped in. */}
            <div className="-mt-3 shrink-0 animate-float lg:-mt-4" style={reveal(0.6)}>
              <WavingPixi className="w-[240px] sm:w-[290px] lg:w-[336px]" />
            </div>
            <p
              className="mt-1 m-0 animate-k-in text-center text-lg font-extrabold text-k-purple fill-mode-both sm:text-xl"
              style={reveal(0.35)}
            >
              “What would you like to learn today?”
            </p>
          </div>
        </div>

        {/* Bottom Row: Our Purpose & 3 Flow Steps */}
        <div className="grid gap-6 lg:grid-cols-[432fr_701fr] lg:gap-[26px]">
          {/* Bottom Left: Our Purpose Purple Card */}
          <div
            className="flex flex-col justify-center animate-k-in rounded-[24px] bg-k-purple p-6 text-white transition-transform fill-mode-both hover:-translate-y-1 sm:p-7 lg:min-h-[198px] lg:rounded-[28px]"
            style={reveal(0.7)}
          >
            <p className="m-0 text-xs font-extrabold tracking-[0.03em] text-[#e2d4fb] uppercase sm:text-[13.5px]">
              OUR PURPOSE
            </p>
            <h2 className="mt-2.5 m-0 text-2xl leading-[1.15] font-extrabold tracking-[-0.01em] text-white sm:text-[31px]">
              More wonder.
              <br />
              More ways to learn.
            </h2>
            <p className="mt-3 m-0 text-base font-medium text-[#e9defc] sm:text-[17px]">
              Let children’s interests lead the way.
            </p>
          </div>

          {/* Bottom Right: From a spoken wish to a printed page White Card */}
          <div
            className="flex flex-col justify-center animate-k-in rounded-[24px] bg-white p-6 transition-transform fill-mode-both hover:-translate-y-1 sm:p-7 lg:min-h-[198px] lg:rounded-[28px] lg:px-8"
            style={reveal(0.82)}
          >
            <h2 className="m-0 text-xl font-extrabold tracking-[-0.01em] text-k-ink sm:text-2xl">
              From a spoken wish to a printed page
            </h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-3 lg:gap-7">
              {FLOW_STEPS.map((step, i) => (
                <div
                  key={step.label}
                  className="flex animate-k-in flex-col fill-mode-both"
                  style={reveal(0.95 + i * 0.12)}
                >
                  <b className="text-xs font-extrabold tracking-[0.02em] text-k-purple uppercase sm:text-[14px]">
                    {step.label}
                  </b>
                  <p className="mt-2 m-0 text-sm leading-[1.38] font-medium text-k-muted sm:text-[16.5px]">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
