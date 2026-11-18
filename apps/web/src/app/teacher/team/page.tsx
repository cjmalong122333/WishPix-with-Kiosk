'use client';

import { PublicShell } from '@/components/teacher/public-shell';

const PILLARS = [
  {
    num: '01',
    tag: 'Learning & education',
    titleLines: ['Make every idea', 'a learning moment.'],
    desc: 'Keep curiosity at the centre of activities that children can explore, colour, and learn from.',
  },
  {
    num: '02',
    tag: 'AI & engineering',
    titleLines: ['Turn little voices', 'into possibilities.'],
    desc: 'Connect spoken ideas with generative AI to create printable materials for hands-on discovery.',
  },
  {
    num: '03',
    tag: 'Design & experience',
    titleLines: ['Make creating', 'feel like play.'],
    desc: 'Shape a friendly experience that helps children and grown-ups move from an idea to a printed page.',
  },
];

export default function TeacherTeamPage() {
  return (
    <PublicShell
      active="team"
      footer="Thoughtful technology. Playful learning. Endless imagination."
    >
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-7 lg:gap-8">
        {/* Centered Hero Header */}
        <div className="flex flex-col items-center text-center">
          <p className="m-0 text-xs font-extrabold tracking-[0.03em] text-k-purple uppercase sm:text-[14px]">
            THE HEART OF WISHPIX
          </p>
          <h1 className="mt-3 m-0 text-3xl leading-[1.12] font-extrabold tracking-[-0.015em] text-k-ink sm:text-4xl lg:mt-[14px] lg:text-[48px]">
            Big ideas take a little teamwork.
          </h1>
          <p className="mt-3.5 m-0 max-w-[640px] text-base leading-[1.38] font-medium text-k-muted sm:text-lg lg:mt-[18px] lg:text-[21.5px]">
            Bringing learning, technology, and design together—with children’s curiosity at the centre.
          </p>
        </div>

        {/* 3 Pillar Cards */}
        <div className="grid gap-5 md:grid-cols-3 lg:gap-[25px]">
          {PILLARS.map((p) => (
            <div
              key={p.num}
              className="flex flex-col items-start rounded-[24px] bg-white p-6 sm:p-7 lg:min-h-[290px] lg:rounded-[28px] lg:py-8"
            >
              <div className="flex items-baseline gap-4">
                <b className="text-lg font-extrabold text-k-purple lg:text-[20px]">{p.num}</b>
                <b className="text-base font-extrabold text-k-purple lg:text-[16.5px]">{p.tag}</b>
              </div>
              <h2 className="mt-5 m-0 text-2xl leading-[1.18] font-extrabold tracking-[-0.01em] text-k-ink lg:mt-[34px] lg:text-[26px]">
                {p.titleLines[0]}
                <br />
                {p.titleLines[1]}
              </h2>
              <p className="mt-4 m-0 text-sm leading-[1.45] font-medium text-k-muted sm:text-base lg:mt-[22px] lg:text-[16.8px]">
                {p.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom Shared Purpose Banner */}
        <div className="flex min-h-[56px] items-center justify-center rounded-[18px] bg-k-purple-soft px-5 py-3.5 text-center lg:h-[62px] lg:rounded-[20px]">
          <b className="text-sm font-extrabold text-k-purple sm:text-base lg:text-[18.5px]">
            One shared purpose: help every little voice spark a new discovery.
          </b>
        </div>
      </div>
    </PublicShell>
  );
}
