'use client';

import { PublicShell } from '@/components/teacher/public-shell';

const PILLARS = [
  {
    num: '01',
    tag: 'Learning & education',
    titleLines: ['Make every idea', 'a learning moment.'],
    descLines: [
      'Keep curiosity at the centre of activities',
      'that children can explore, colour,',
      'and learn from.',
    ],
  },
  {
    num: '02',
    tag: 'AI & engineering',
    titleLines: ['Turn little voices', 'into possibilities.'],
    descLines: [
      'Connect spoken ideas with generative',
      'AI to create printable materials',
      'for hands-on discovery.',
    ],
  },
  {
    num: '03',
    tag: 'Design & experience',
    titleLines: ['Make creating', 'feel like play.'],
    descLines: [
      'Shape a friendly experience that',
      'helps children and grown-ups move',
      'from an idea to a printed page.',
    ],
  },
];

export default function TeacherTeamPage() {
  return (
    <PublicShell
      active="team"
      footer="Thoughtful technology. Playful learning. Endless imagination."
    >
      {/* Centered Hero Header */}
      <div className="absolute inset-x-0 top-[15.2rem] flex flex-col items-center text-center">
        <p className="m-0 text-[1.4rem] font-extrabold tracking-[0.03em] text-k-purple uppercase">
          THE HEART OF WISHPIX
        </p>
        <h1 className="mt-[1.4rem] m-0 text-[4.8rem] leading-[1.12] font-extrabold tracking-[-0.015em] text-k-ink">
          Big ideas take a little teamwork.
        </h1>
        <p className="mt-[1.8rem] m-0 text-[2.15rem] leading-[1.38] font-medium text-k-muted">
          Bringing learning, technology, and design together—
          <br />
          with children’s curiosity at the centre.
        </p>
      </div>

      {/* 3 Pillar Cards */}
      <div className="absolute top-[34.6rem] left-[5.8rem] grid w-[116rem] grid-cols-3 gap-[2.5rem]">
        {PILLARS.map((p) => (
          <div
            key={p.num}
            className="flex h-[29rem] flex-col items-start rounded-[2.8rem] bg-white px-[2.8rem] py-[3.2rem]"
          >
            <div className="flex items-baseline gap-[1.8rem]">
              <b className="text-[2rem] font-extrabold text-k-purple">{p.num}</b>
              <b className="text-[1.65rem] font-extrabold text-k-purple">{p.tag}</b>
            </div>
            <h2 className="mt-[3.4rem] m-0 text-[2.6rem] leading-[1.18] font-extrabold tracking-[-0.01em] text-k-ink">
              {p.titleLines[0]}
              <br />
              {p.titleLines[1]}
            </h2>
            <p className="mt-[2.2rem] m-0 text-[1.68rem] leading-[1.45] font-medium text-k-muted">
              {p.descLines[0]}
              <br />
              {p.descLines[1]}
              <br />
              {p.descLines[2]}
            </p>
          </div>
        ))}
      </div>

      {/* Bottom Shared Purpose Banner */}
      <div className="absolute top-[66.8rem] left-[5.8rem] flex h-[6.2rem] w-[116rem] items-center justify-center rounded-[2rem] bg-k-purple-soft">
        <b className="text-[1.85rem] font-extrabold text-k-purple">
          One shared purpose: help every little voice spark a new discovery.
        </b>
      </div>
    </PublicShell>
  );
}
