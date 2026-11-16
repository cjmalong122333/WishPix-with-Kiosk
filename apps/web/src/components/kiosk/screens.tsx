'use client';

import { useEffect, useRef } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CloudAlert,
  FileText,
  Hand,
  House,
  Keyboard,
  Lock,
  Mic,
  Moon,
  Pause,
  Pencil,
  Printer,
  RotateCcw,
  Sparkles,
  Star,
  UserRound,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import type { T } from '@/i18n';
import type { Current } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { KioskButton } from './use-kiosk-buttons';
import type { ScreenId } from './screen-for';
import { Sheet } from './sheet';

// The kiosk screens, drawn after the kiosk design (docs/design/kiosk). The
// stage is 128rem x 80rem and 1rem is 10 px of the 1280x800 design frames,
// so sizes below read as design pixels / 10. Everything here only displays:
// children answer with the physical buttons (use-kiosk-buttons.ts). The
// on-screen buttons can also be clicked, for testing on a laptop.

export type CreatingStage = 'thinking' | 'drawing' | 'almost';

export type View = {
  screen: ScreenId;
  t: T;
  activity: string; // the session's activity type, or ''
  theme: string | null;
  current: Current | null;
  teacher: { name: string; device: string } | null;
  message: string | null; // a note on the "Tell Pixi your idea" screen
  micOn: boolean; // the microphone is open ("Listening…"); before that, "Get ready…"
  level: React.RefObject<number> | null; // live microphone loudness, while recording
  progress: number; // "Starting up" bar, 0..100
  creating: CreatingStage;
  endedLeft: number; // seconds left on "Session ended"
  printerProblem: string | null;
  teacherPrint: { done: number; total: number } | null; // a teacher's file printing
  offlineReason: string | null;
  typed: string;
  setTyped: (text: string) => void;
  sendTyped: () => void;
  press: (button: KioskButton) => void;
  release: (button: KioskButton) => void;
};

export const ENDED_SECONDS = 5;

// ---------- Shared pieces ----------

export function KioskLogo({ t }: { t: T }) {
  return (
    <div className="flex items-center gap-[1.6rem]">
      <span className="grid size-[4.8rem] place-items-center rounded-[1.2rem] bg-k-purple text-white">
        <Star className="size-[2.6rem]" strokeWidth={2} />
      </span>
      <span className="flex flex-col">
        <b className="text-[3rem] leading-none font-bold tracking-[-0.01em] text-k-ink">WishPix</b>
        <small className="mt-[0.5rem] text-[1rem] leading-none font-extrabold tracking-[0.03em] text-k-muted uppercase">{t('Imagination Station')}</small>
      </span>
    </div>
  );
}

// The pill at the top right: what the kiosk is doing.
type Status = { text: string; tone: 'plain' | 'mint' | 'accent'; sound: boolean };

export function headerStatus(screen: ScreenId, activityName: string, t: T): Status {
  switch (screen) {
    case 'starting':
      return { text: t('Waking up…'), tone: 'plain', sound: false };
    case 'waiting':
      return { text: t('Kiosk online'), tone: 'mint', sound: false };
    case 'connected':
      return { text: t('Connected'), tone: 'mint', sound: false };
    case 'ended':
      return { text: t('Session ended'), tone: 'accent', sound: true };
    case 'paused':
    case 'offline':
    case 'printer':
    case 'error':
      return { text: t('Mode paused'), tone: 'accent', sound: true };
    case 'teacher_print':
      return { text: t('Teacher Print'), tone: 'accent', sound: true };
    default:
      return { text: activityName, tone: 'accent', sound: true };
  }
}

type HeaderProps = { t: T; status: Status; soundOn: boolean };

// The kiosk has no language or color controls: both are Teacher App
// settings (Settings > Display Language, Kiosk Color).
export function Header({ t, status, soundOn }: HeaderProps) {
  const pill = 'flex h-[4.2rem] items-center justify-center rounded-full px-[2rem] text-[1.7rem] font-bold whitespace-nowrap';
  return (
    <header className="absolute inset-x-[6.4rem] top-[4rem] flex h-[4.8rem] items-center">
      <KioskLogo t={t} />
      <div className="ml-auto flex gap-[2.4rem]">
        <span
          className={cn(
            pill,
            'min-w-[19.2rem]',
            status.tone === 'mint' && 'bg-k-mint text-k-mint-ink',
            status.tone === 'plain' && 'bg-white text-k-muted',
            status.tone === 'accent' && 'bg-white text-k-purple'
          )}
        >
          {status.text}
        </span>
        {status.sound && (
          <span className={cn(pill, 'gap-[0.8rem] bg-white text-k-muted')}>
            {soundOn ? <Volume2 className="size-[2rem]" /> : <VolumeX className="size-[2rem]" />}
            {soundOn ? t('Sound on') : t('Sound off')}
          </span>
        )}
      </div>
    </header>
  );
}

export function Footer({ text }: { text: string }) {
  return <p className="absolute inset-x-0 top-[74.5rem] m-0 text-center text-[1.8rem] text-k-muted">{text}</p>;
}

// Which step of a wish this is (1 your idea, 2 talking, 3 checking).
function StepBars({ step, className }: { step: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cn('flex gap-[2.8rem]', className)} aria-hidden>
      {[1, 2, 3].map((n) => (
        <i key={n} className={cn('h-[0.6rem] rounded-full transition-all duration-500', n === step ? 'w-[6.4rem] bg-k-purple' : 'w-[4rem] bg-k-purple-line')} />
      ))}
    </div>
  );
}

function Dots({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-[1.4rem]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <i key={i} className="size-[0.9rem] animate-k-dot rounded-full bg-k-purple" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

// The soft circle Pixi stands in (Pixi itself is drawn by the kiosk on top).
function Circle({ className }: { className?: string }) {
  return <div className={cn('shrink-0 rounded-full bg-k-purple-soft', className)} aria-hidden />;
}

// An on-screen copy of a physical button. Clicking works for testing.
function ButtonFace({
  button,
  view,
  className,
  children,
}: {
  button: KioskButton;
  view: View;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onPointerDown={() => {
        view.press(button);
        // Let go anywhere: the screen changes under the pointer while talking.
        window.addEventListener('pointerup', () => view.release(button), { once: true });
      }}
      className={cn('flex items-center rounded-[2.4rem] border-0 font-bold text-white select-none', className)}
    >
      {children}
    </button>
  );
}

// ---------- Layouts ----------

// Pixi in a circle at the top, the words underneath [01, 02, 02B, 07, 09, 12].
function Centered({ circle, children }: { circle?: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-[12.4rem] flex animate-k-in flex-col items-center text-center">
      <Circle className={cn('size-[32rem]', circle)} />
      {children}
    </div>
  );
}

function Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn('m-0 text-[4.8rem] leading-[1.15] font-extrabold tracking-[-0.01em] text-k-ink', className)}>{children}</h1>;
}

function Sub({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[2.6rem] leading-[1.3] text-k-muted', className)}>{children}</p>;
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[1.5rem] font-extrabold tracking-[0.03em] text-k-purple uppercase', className)}>{children}</p>;
}

// Pixi in a circle on the left (with its thought bubble), the words on the
// right [04, 06, 11A-C].
function Beside({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Circle className="absolute top-[20rem] left-[7rem] size-[37rem]" />
      <div className="absolute top-[14.8rem] left-[51.6rem] flex w-[70rem] animate-k-in flex-col items-start">{children}</div>
    </>
  );
}

// ---------- The screens ----------

export function ScreenView({ view }: { view: View }) {
  switch (view.screen) {
    case 'starting':
      return <Starting view={view} />;
    case 'waiting':
      return <Waiting view={view} />;
    case 'connected':
      return <Connected view={view} />;
    case 'paused':
      return <Paused view={view} />;
    case 'ended':
      return <Ended view={view} />;
    case 'home':
      return <Home view={view} />;
    case 'ready':
      return <Ready view={view} />;
    case 'listening':
    case 'thinking':
      return <Listening view={view} />;
    case 'typing':
      return <Typing view={view} />;
    case 'heard':
      return <Heard view={view} />;
    case 'creating':
      return <Creating view={view} />;
    case 'printing':
      return <Printing view={view} />;
    case 'done':
      return <Done view={view} />;
    case 'teacher_print':
      return <TeacherPrinting view={view} />;
    case 'offline':
    case 'printer':
    case 'error':
    case 'blocked':
      return <Help view={view} />;
  }
}

// New: a file a teacher sent is printing (Print to Kiosk). It only starts
// when no child is in the middle of a wish; then the start screen comes back.
function TeacherPrinting({ view: { t, teacherPrint } }: { view: View }) {
  const done = teacherPrint?.done ?? 0;
  const total = Math.max(1, teacherPrint?.total ?? 1);
  return (
    <>
      <Centered>
        <Title className="-mt-[3.2rem]">{t('Printing teacher’s file…')}</Title>
        <Sub className="mt-[0.8rem]">{t('Pixi will be right back!')}</Sub>
        <div className="mt-[4.3rem] h-[1.2rem] w-[42rem] overflow-hidden rounded-full bg-k-purple-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="h-full rounded-full bg-k-purple transition-[width] duration-700 ease-out" style={{ width: `${Math.max(6, (100 * done) / total)}%` }} />
        </div>
        <div className="mt-[2.2rem] flex w-[42rem] items-center justify-between text-[2.1rem]">
          <span className="flex items-center gap-[1rem] text-k-muted">
            <Printer className="size-[2.4rem]" /> {t('Printing…')}
          </span>
          <b className="text-[2.2rem] text-k-purple">{t('{done} of {total}', { done, total })}</b>
        </div>
      </Centered>
      <Footer text={t('Your teacher is printing something. Please wait a moment.')} />
    </>
  );
}

// [01] Starting up
function Starting({ view: { t, progress } }: { view: View }) {
  return (
    <>
      <Centered>
        <Title className="-mt-[3.2rem]">{t("Hi! I'm Pixi!")}</Title>
        <Sub className="mt-[0.8rem]">{t('Your WishPix Companion!')}</Sub>
        <div className="mt-[4.3rem] h-[1.2rem] w-[42rem] overflow-hidden rounded-full bg-k-purple-line">
          <div className="h-full rounded-full bg-k-purple transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-[2.2rem] flex w-[42rem] justify-between text-[2.1rem]">
          <span className="text-k-muted">{t('Starting up…')}</span>
          <b className="text-[2.2rem] text-k-purple">{Math.round(progress)}%</b>
        </div>
        <Dots className="mt-[3.2rem]" />
      </Centered>
      <Footer text={t('A little magic is on its way.')} />
    </>
  );
}

// [02] Waiting for teacher
function Waiting({ view: { t } }: { view: View }) {
  return (
    <>
      <Centered>
        <Title className="-mt-[3.2rem]">{t('Waiting for Teacher…')}</Title>
        <Sub className="mt-[0.8rem]">{t("I'm ready when your teacher is!")}</Sub>
        <div className="mt-[4rem] flex h-[7.6rem] w-[38.8rem] items-center gap-[2rem] rounded-[2.4rem] bg-white px-[2.8rem]">
          <Lock className="size-[2.6rem] shrink-0 text-k-purple" />
          <b className="text-[2rem] text-k-muted">{t("Session hasn't started yet")}</b>
        </div>
      </Centered>
      <Footer text={t('Your teacher will start the fun soon.')} />
    </>
  );
}

// [02B] Connected to the Teacher App
function Connected({ view: { t, teacher } }: { view: View }) {
  return (
    <>
      <Centered>
        <Title className="-mt-[3.2rem]">{t('Connected')}</Title>
        <Sub className="mt-[0.8rem]">{t("Your teacher is ready. Let's create together!")}</Sub>
        <div className="mt-[3.4rem] grid h-[13.6rem] w-[72rem] grid-cols-2 rounded-[2.4rem] bg-white px-[3rem] pt-[2.4rem] text-left">
          {[
            [t('Teacher'), teacher?.name ?? ''],
            [t('Connected device'), teacher ? t(teacher.device) : ''],
          ].map(([label, value]) => (
            <div key={label}>
              <small className="block text-[1.4rem] font-semibold text-k-muted uppercase">{label}</small>
              <b className="mt-[1.4rem] block truncate pr-[2rem] text-[2.6rem] font-semibold text-k-ink">{value}</b>
            </div>
          ))}
        </div>
      </Centered>
      <Footer text={t('Your teacher will choose the next mode.')} />
    </>
  );
}

// New: the teacher paused the activity (like [02]).
function Paused({ view: { t } }: { view: View }) {
  return (
    <>
      <Centered>
        <Title className="-mt-[3.2rem]">{t('Little break!')}</Title>
        <Sub className="mt-[0.8rem]">{t('Your teacher paused this mode.')}</Sub>
        <div className="mt-[4rem] flex h-[7.6rem] min-w-[38.8rem] items-center gap-[2rem] rounded-[2.4rem] bg-white px-[2.8rem]">
          <Pause className="size-[2.6rem] shrink-0 text-k-purple" />
          <b className="text-[2rem] text-k-muted">{t("We'll be back soon.")}</b>
        </div>
      </Centered>
      <Footer text={t('Pixi is resting too.')} />
    </>
  );
}

// [12] Session ended
function Ended({ view: { t, endedLeft } }: { view: View }) {
  return (
    <>
      <Centered circle="size-[30.4rem]">
        <Title className="mt-[0.2rem]">{t('Session ended.')}</Title>
        <Sub className="mt-[2.6rem] text-[2.8rem]">{t('Returning to Home Screen…')}</Sub>
        <div className="mt-[4.4rem] flex h-[8.2rem] w-[38rem] flex-col justify-center rounded-[2.4rem] bg-white px-[2.4rem]">
          <div className="flex items-center gap-[2rem]">
            <House className="size-[2.8rem] shrink-0 text-k-purple" />
            <b className="text-[2.4rem] text-k-purple">{t('Home in {n} seconds', { n: Math.max(endedLeft, 0) })}</b>
          </div>
          <div className="mt-[1rem] h-[0.4rem] overflow-hidden rounded-full bg-k-purple-line">
            <div
              className="h-full rounded-full bg-k-purple transition-[width] duration-1000 ease-linear"
              style={{ width: `${(100 * (ENDED_SECONDS - endedLeft)) / ENDED_SECONDS}%` }}
            />
          </div>
        </div>
      </Centered>
      <Footer text={t('Pixi will be ready for the next adventure.')} />
    </>
  );
}

// What each mode's start screen [03A-B] says and shows. (Frame 03C, Free
// Play, was removed with the mode.)
function activityCopy(activity: string, t: T) {
  switch (activity) {
    case 'trace_learn':
      return {
        title: t('Trace & Learn'),
        lines: [t('Follow the lines, find your magic.'), t("Let's learn one little stroke at a time!")],
        button: t("Let's trace!"),
        card: t("Let's trace a word"),
        tag: t('Little lines, big adventures'),
        footer: t('Little lines. Big discoveries.'),
      };
    default:
      return {
        title: t('Color & Create'),
        lines: [t('Big ideas. Brilliant colors.'), t("Let's make something amazing!")],
        button: t("Let's create!"),
        card: t('Make it yours'),
        tag: t('A splash of imagination'),
        footer: t('Dream it. Say it. Color it.'),
      };
  }
}

export const activityName = (activity: string, t: T) => activityCopy(activity, t).title;

// [03A-C] The activity's start screen. Yes (or the talk button) begins.
function Home({ view }: { view: View }) {
  const { t, activity, theme } = view;
  const copy = activityCopy(activity, t);
  return (
    <>
      <div className="absolute top-[15.8rem] left-[6.4rem] flex w-[54rem] animate-k-in flex-col items-start">
        <p className="m-0 flex h-[3.8rem] w-full items-center gap-[0.8rem] rounded-full bg-k-accent-soft px-[1.8rem] text-[1.3rem] font-extrabold tracking-[0.03em] text-k-accent uppercase">
          {t("Today's theme")} <span aria-hidden>·</span> {theme ? t(theme) : t('Your imagination')}
        </p>
        <h1 className="m-0 mt-[2.6rem] max-w-[42rem] text-[7.2rem] leading-[1.2] font-extrabold tracking-[-0.015em] text-k-ink">{copy.title}</h1>
        <p className="m-0 mt-[2.4rem] text-[2.7rem] leading-[1.2] text-k-muted">
          {copy.lines[0]}
          <br />
          {copy.lines[1]}
        </p>
        <ButtonFace button="yes" view={view} className="mt-[4.6rem] h-[8.8rem] w-[36.6rem] justify-between bg-k-accent px-[2.8rem] text-[3.2rem]">
          {copy.button}
          <ArrowRight className="size-[3rem]" strokeWidth={1.8} />
        </ButtonFace>
        <p className="m-0 mt-[1.4rem] text-[1.9rem] text-k-muted">{t('Press the green button to begin.')}</p>
      </div>

      <div className="absolute top-[14.8rem] left-[67.6rem] h-[49rem] w-[54rem] animate-k-in rounded-[4.8rem] bg-k-accent-soft">
        <div className="absolute top-[5.6rem] left-[2.6rem] flex h-[27rem] w-[27.4rem] rotate-[4deg] flex-col rounded-[2.8rem] bg-white p-[2.6rem] shadow-[0_0.4rem_1.6rem_rgba(48,35,68,0.05)]">
          <b className="text-[1.4rem] font-extrabold text-k-accent uppercase">{copy.card}</b>
          <ActivityArt activity={activity} />
        </div>
        {activity === 'trace_learn' && <b className="absolute top-[6.4rem] left-[39.4rem] text-[7rem] leading-none font-bold text-k-teal">a</b>}
        {/* In front of Pixi (z-20 is above the Pixi layer), as in the design. */}
        <p className="absolute top-[40.4rem] left-[3.8rem] z-20 m-0 flex h-[5rem] min-w-[32.6rem] items-center justify-center rounded-full bg-white px-[2.4rem] text-[1.8rem] font-bold whitespace-nowrap text-k-accent">
          {copy.tag}
        </p>
      </div>

      <StepBars step={1} className="absolute top-[67.8rem] left-[51rem]" />
      <Footer text={copy.footer} />
    </>
  );
}

function ActivityArt({ activity }: { activity: string }) {
  if (activity === 'trace_learn') {
    return (
      <div className="flex flex-1 flex-col items-center justify-end">
        <b className="text-[13rem] leading-[0.9] font-bold text-k-teal">A</b>
        <i className="mt-[2rem] h-[0.2rem] w-full bg-k-mint" />
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-between pt-[2.4rem]">
      <Pencil className="size-[8rem] text-k-purple" strokeWidth={1.2} />
      <div className="flex w-full justify-between px-[0.4rem]">
        {['#a587dc', '#f5c55c', '#ee9b9b', '#83cbb4'].map((c) => (
          <i key={c} className="size-[3.6rem] rounded-full" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

// Things to try saying, for the day's theme [04].
function ideasFor(theme: string | null, t: T): [string, string][] {
  switch (theme) {
    case 'Animals':
      return [['🐱', t('A Cute Cat')], ['🐶', t('A Happy Dog')], ['🦁', t('A Big Lion')]];
    case 'Transportation':
      return [['🚒', t('Fire Truck')], ['🚌', t('School Bus')], ['✈️', t('Airplane')]];
    case 'Fruits':
      return [['🍎', t('A Red Apple')], ['🥭', t('A Sweet Mango')], ['🍌', t('A Banana')]];
    case 'Community Helpers':
      return [['🩺', t('A Kind Doctor')], ['📚', t('A Friendly Teacher')], ['🚒', t('A Brave Firefighter')]];
    case 'Shapes':
      return [['🔴', t('A Red Circle')], ['🟦', t('A Blue Square')], ['🔺', t('A Triangle')]];
    case 'Colors':
      return [['🐦', t('A Blue Bird')], ['☀️', t('A Yellow Sun')], ['🍓', t('A Red Strawberry')]];
    case 'Nature':
      return [['🌳', t('A Big Tree')], ['🌻', t('A Sunflower')], ['🦋', t('A Butterfly')]];
    default:
      return [['🐱', t('A Cute Cat')], ['🚒', t('Fire Truck')], ['🦕', t('Big Dinosaur')]];
  }
}

// [04] Tell Pixi your idea. Hold the talk button to talk.
function Ready({ view }: { view: View }) {
  const { t, theme, message } = view;
  return (
    <>
      <Beside>
        <Eyebrow>1 / {t('Your idea')}</Eyebrow>
        <Title className="mt-[1.8rem] max-w-[48rem] leading-[1.25]">{t('Tell me what you want to create!')}</Title>
        <Sub className="mt-[1.8rem] text-[2.4rem]">{t('Think of something you love. Try saying…')}</Sub>
        <div className="mt-[1.8rem] grid w-[67.6rem] grid-cols-3 gap-[1.4rem]">
          {ideasFor(theme, t).map(([emoji, idea]) => (
            <div key={idea} className="flex h-[11.2rem] flex-col items-center justify-center rounded-[2rem] bg-white px-[1rem] text-center">
              <span className="text-[3rem] leading-none">{emoji}</span>
              <b className="mt-[1.2rem] text-[2rem] leading-tight font-bold text-k-ink">{idea}</b>
            </div>
          ))}
        </div>
        <ButtonFace button="talk" view={view} className="mt-[2.8rem] h-[8.4rem] w-[44rem] gap-[2rem] bg-k-green px-[3.2rem] text-[2.8rem]">
          <Mic className="size-[3rem]" strokeWidth={2} />
          {t('Hold to talk')}
        </ButtonFace>
        {message ? (
          <p className="m-0 mt-[1.2rem] rounded-[1.2rem] bg-k-warn px-[1.4rem] py-[0.4rem] text-[2.1rem] font-semibold text-k-warn-ink" role="alert">
            {message}
          </p>
        ) : (
          <p className="m-0 mt-[1.2rem] text-[2.1rem] text-k-green-ink">{t('Hold the talk button while you say your idea.')}</p>
        )}
        <StepBars step={1} className="mt-[3.4rem]" />
      </Beside>
      <Footer text={t('Speak clearly. One idea at a time.')} />
    </>
  );
}

// [05] Listening, while the talk button is held down. Before the microphone
// opens, "Get ready…" (new, about a second), and after the button is let
// go, "Let me think…" (new) while the recording is turned into text.
function Listening({ view }: { view: View }) {
  const { t, screen, level, micOn } = view;
  const thinking = screen === 'thinking';
  const listening = !thinking && micOn;
  const getReady = !thinking && !micOn;
  return (
    <>
      <div className="absolute inset-x-0 top-[12.2rem] flex animate-k-in flex-col items-center text-center">
        <p className={cn('m-0 flex h-[2.2rem] items-center gap-[1rem] text-[1.6rem] font-extrabold text-k-purple uppercase', !listening && 'invisible')}>
          <i className="size-[1.2rem] animate-blink rounded-full bg-k-purple" />
          {t('Microphone is on')}
        </p>
        <div className="relative mt-[2rem] grid size-[25.2rem] place-items-center rounded-full bg-[#f0e9fc]">
          {listening && <i className="absolute inset-0 animate-ring rounded-full bg-[#e6d9fa]" aria-hidden />}
          <i className="size-[21.4rem] rounded-full bg-[#e6d9fa]" aria-hidden />
        </div>
        <Title className="mt-[1.4rem]">{thinking ? t('Let me think…') : getReady ? t('Get ready…') : t('Listening…')}</Title>
        <Sub className="mt-[0.6rem] text-[2.8rem]">
          {thinking ? t('Listening to your idea.') : getReady ? t('Keep holding the talk button.') : t('Tell me your idea!')}
        </Sub>
        <Waves level={listening ? level : null} dim={!listening} />
        <div className="mt-[1.8rem] h-[8.4rem]">
          {listening && (
            <ButtonFace button="talk" view={view} className="h-full animate-k-glow gap-[1.6rem] bg-k-green px-[3.6rem] text-[2.6rem]">
              <Hand className="size-[2.8rem]" strokeWidth={2} />
              {t("Let go when you're done")}
            </ButtonFace>
          )}
        </div>
        <StepBars step={2} className="mt-[1.2rem]" />
      </div>
      <Footer
        text={thinking ? t('Pixi is listening carefully.') : getReady ? t('Pixi is getting ready to listen.') : t("Let go of the talk button when you're done talking.")}
      />
    </>
  );
}

// The sound wave under "Listening…": follows the microphone when there is a
// live level, otherwise it just sways.
const WAVE = [0.8, 1.4, 2.6, 4.2, 2.2, 3.4, 5.2, 3.6, 4.4, 5.8, 3.6, 4.8, 2.4, 4, 2.2, 2.8, 1.4, 0.8];
const DARK = new Set([6, 7, 8, 9, 10, 11, 13]);

function Waves({ level, dim }: { level: React.RefObject<number> | null; dim?: boolean }) {
  const bars = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (!level) return;
    let frame = 0;
    let smooth = 0;
    const tick = (now: number) => {
      const v = level.current ?? 0;
      smooth += (v - smooth) * (v > smooth ? 0.5 : 0.12);
      bars.current.forEach((el, i) => {
        if (!el) return;
        const sway = 0.5 + 0.5 * Math.sin(now / 160 + i * 0.9);
        const scale = Math.min(1, 0.22 + smooth * 1.6 * (0.55 + 0.45 * sway));
        el.style.transform = `scaleY(${scale.toFixed(3)})`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level]);

  return (
    <div className={cn('mt-[2rem] flex h-[6rem] items-center gap-[1.2rem]', dim && 'opacity-50')} aria-hidden>
      {WAVE.map((h, i) => (
        <i
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className={cn('w-[1rem] rounded-full', DARK.has(i) ? 'bg-k-purple' : 'bg-k-purple-mid', !level && 'animate-k-wave')}
          style={{ height: `${Math.max(h, 1)}rem`, animationDelay: level ? undefined : `${(i % 6) * -0.18}s` }}
        />
      ))}
    </div>
  );
}

// New: no speech recognition on this kiosk, so a teacher types the idea.
function Typing({ view }: { view: View }) {
  const { t, typed, setTyped, sendTyped } = view;
  return (
    <>
      <Beside>
        <Eyebrow>1 / {t('Your idea')}</Eyebrow>
        <Title className="mt-[1.8rem]">{t('Type your idea')}</Title>
        <Sub className="mt-[1.8rem] max-w-[62rem] text-[2.4rem]">{t('Voice is not set up on this kiosk. A teacher can help type.')}</Sub>
        <div className="mt-[3.2rem] flex w-[67.6rem] gap-[1.4rem]">
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendTyped()}
            maxLength={200}
            placeholder={t('e.g. a happy cat')}
            className="h-[8.4rem] flex-1 rounded-[2.4rem] border-2 border-k-border bg-white px-[2.4rem] text-[2.6rem] text-k-ink outline-none focus:border-k-purple"
          />
          <button
            type="button"
            onClick={sendTyped}
            disabled={!typed.trim()}
            className="h-[8.4rem] rounded-[2.4rem] border-0 bg-k-green px-[3.6rem] text-[2.8rem] font-bold text-white disabled:opacity-50"
          >
            {t('OK')}
          </button>
        </div>
        <Keyboard className="mt-[3rem] size-[4rem] text-k-purple-mid" aria-hidden />
      </Beside>
      <Footer text={t('Press Escape (the purple button) to cancel.')} />
    </>
  );
}

// [06] Check your idea: green (Yes) makes it, purple (No) tries again.
function Heard({ view }: { view: View }) {
  const { t, current } = view;
  return (
    <>
      <Beside>
        <Eyebrow>3 / {t('Check your idea')}</Eyebrow>
        <Title className="mt-[2.4rem] text-[4.4rem]">{t('Here’s what I heard…')}</Title>
        <div className="mt-[3.2rem] flex h-[19.8rem] w-full flex-col rounded-[2.8rem] bg-white px-[3rem] pt-[2.6rem]">
          <small className="text-[1.5rem] font-bold text-k-muted uppercase">{t('Your idea')}</small>
          <b className="mt-[2.2rem] line-clamp-2 text-[4rem] leading-[1.2] font-extrabold text-k-ink first-letter:uppercase">“{current?.recognizedText}”</b>
        </div>
        <Sub className="mt-[2.6rem]">{t('Is that what you said?')}</Sub>
        <div className="mt-[2.4rem] grid w-full grid-cols-2 gap-[2.4rem]">
          <ButtonFace button="yes" view={view} className="h-[8.4rem] gap-[2rem] bg-k-green px-[3rem] text-[2.8rem]">
            <Check className="size-[3rem]" strokeWidth={2.2} />
            {t('That’s It')}
          </ButtonFace>
          <ButtonFace button="no" view={view} className="h-[8.4rem] gap-[2rem] bg-k-purple px-[3rem] text-[2.8rem]">
            <RotateCcw className="size-[3rem]" strokeWidth={2.2} />
            {t('Try Again')}
          </ButtonFace>
        </div>
        <p className="m-0 mt-[1rem] text-[2.1rem] text-k-muted">{t('Press green for That’s It. Press purple to Try Again.')}</p>
        <StepBars step={3} className="mt-[2.2rem]" />
      </Beside>
      <Footer text={t('You can always try again.')} />
    </>
  );
}

// [07] Creating your picture: safety checks (thinking), then drawing.
function Creating({ view: { t, current, creating } }: { view: View }) {
  const stages: [CreatingStage, string][] = [
    ['thinking', t('Thinking…')],
    ['drawing', t('Drawing…')],
    ['almost', t('Almost ready…')],
  ];
  const at = stages.findIndex(([id]) => id === creating);
  return (
    <>
      <Centered>
        <Title className="-mt-[2.4rem]">{t('Creating your picture…')}</Title>
        <Sub className="mt-[0.6rem] line-clamp-1 max-w-[90rem]">“{current?.recognizedText}”</Sub>
        {current?.override && <p className="m-0 mt-[0.8rem] text-[1.8rem] font-bold text-k-green-ink">{t('Your teacher said yes!')}</p>}
        <div className="mt-[3.4rem] flex gap-[1.8rem]">
          {stages.map(([id, label], i) => (
            <span
              key={id}
              className={cn(
                'flex h-[6.4rem] w-[23.2rem] items-center justify-center gap-[1.2rem] rounded-[2rem] px-[1.6rem] text-[2.2rem] leading-tight font-bold transition-colors duration-500',
                i === at ? 'bg-k-purple text-white' : 'bg-white text-k-muted'
              )}
            >
              {i < at && <Check className="size-[2.2rem] shrink-0 text-k-teal" strokeWidth={2.4} />}
              {label}
            </span>
          ))}
        </div>
        <Dots className="mt-[3.8rem]" />
      </Centered>
      <Footer text={t('A little imagination takes a little time.')} />
    </>
  );
}

// [08] The picture is ready and the worksheet is printing.
function Printing({ view: { t, current, activity, theme } }: { view: View }) {
  const label = current?.label ? (t.lang === 'fil' ? current.label.fil : current.label.en) : null;
  return (
    <>
      <div className="absolute top-[14.4rem] left-[6.4rem] flex w-[56rem] animate-k-in flex-col items-start">
        <Eyebrow>{t('Your idea, brought to life')}</Eyebrow>
        <h1 className="m-0 mt-[2.4rem] max-w-[33rem] text-[5.2rem] leading-[1.27] font-extrabold tracking-[-0.01em] text-k-ink">{t('Your picture is ready!')}</h1>
        <div className="mt-[3.6rem] flex h-[7.8rem] w-[48.6rem] items-center gap-[2rem] rounded-[2.4rem] bg-white px-[2.4rem]">
          <Printer className="size-[3rem] shrink-0 text-k-purple" />
          <b className="text-[2.6rem] font-bold text-k-purple">{t('Printing worksheet…')}</b>
        </div>
        <p className="m-0 mt-[3.4rem] text-[2.3rem] leading-[1.3] text-k-muted">
          {t('Pixi is getting it ready for you.')}
          <br />
          {t('You don’t need to press anything.')}
        </p>
        {/* Pixi stands to the left of this line. */}
        <b className="mt-[8rem] ml-[16rem] text-[2.1rem] font-bold text-k-purple">
          {label ? t('Your {thing} is on its way!', { thing: label.toLowerCase() }) : t('Your picture is on its way!')}
        </b>
      </div>
      {/* The page as it prints: a 4x6 sheet, or a 58 mm thermal strip (which can be longer, or sideways). */}
      <div className="absolute top-[12.4rem] left-[74.5rem] max-h-[54.6rem] w-[36.4rem] animate-k-drop overflow-hidden rounded-[2.8rem] border-2 border-k-border bg-white">
        <Sheet current={current} activityType={activity} theme={theme ?? undefined} />
      </div>
      <p className="absolute top-[68.6rem] left-[74.5rem] m-0 w-[36.4rem] text-center text-[1.4rem] font-bold text-k-muted uppercase">{t('Image preview')}</p>
      <Footer text={t('Please wait while your worksheet prints.')} />
    </>
  );
}

// [09] Worksheet ready
function Done({ view: { t } }: { view: View }) {
  return (
    <>
      <Centered circle="bg-k-mint">
        <span className="-mt-[4.4rem] flex h-[4.6rem] items-center gap-[1.2rem] rounded-full bg-k-teal px-[2rem] text-[1.8rem] font-bold text-white">
          <Check className="size-[2.2rem]" strokeWidth={2.4} />
          {t('Printing complete')}
        </span>
        <Title className="mt-[3rem]">{t('Your worksheet is ready!')}</Title>
        <Sub className="mt-[1.2rem] text-[3rem]">{t('Please take your worksheet.')}</Sub>
        <div className="mt-[3.2rem] flex h-[6.8rem] items-center gap-[1.6rem] rounded-[2.4rem] bg-white px-[2.8rem]">
          <ArrowDown className="size-[2.6rem] text-k-purple" />
          <b className="text-[2rem] text-k-purple">{t('Collect it from the printer')}</b>
        </div>
      </Centered>
      {/* Stars around Pixi's circle, as in the design. */}
      {[
        ['left-[40.8rem] top-[18rem] size-[2.4rem] text-k-purple', 0],
        ['left-[85.6rem] top-[21rem] size-[3rem] text-k-gold', 0.6],
        ['left-[43.6rem] top-[34.1rem] size-[1.9rem] text-k-teal', 1.2],
        ['left-[83.6rem] top-[35.2rem] size-[2rem] text-k-purple', 1.8],
      ].map(([cls, delay]) => (
        <Star key={cls} className={cn('absolute animate-k-twinkle', cls as string)} style={{ animationDelay: `${delay}s` }} strokeWidth={1.6} aria-hidden />
      ))}
      <Footer text={t('Thank you for creating with Pixi!')} />
    </>
  );
}

// [11A-C] Something needs a teacher. Also (new) an idea the safety check
// stopped, in the same layout.
function Help({ view }: { view: View }) {
  const { t, screen, printerProblem, offlineReason } = view;
  let icon = <WifiOff />;
  let title = t('Connection unavailable.');
  let sub = t('Please ask your teacher.');
  let card = t('Internet problem');
  let text = offlineReason ?? t('Your teacher will help you continue.');
  let footer = t('Pixi needs a little help getting back online.');
  let wait = true;
  let tile = 'bg-k-warn text-k-warn-ink';

  if (screen === 'printer') {
    icon = <FileText />;
    sub = t('Please ask your teacher.');
    text = t('Your teacher will help you continue.');
    footer = t('Your teacher can help refill the printer.');
    if (printerProblem === 'no_paper') {
      title = t('Printer needs paper.');
      card = t('Paper tray is empty');
    } else {
      title = t('Printer needs help.');
      card = printerProblem === 'jam' ? t('Paper is stuck') : printerProblem === 'no_ink' ? t('Printer is out of ink') : t('The printer is not working');
      footer = t('Your teacher will print your picture soon.');
    }
  } else if (screen === 'error') {
    icon = <CloudAlert />;
    title = t('Something went wrong.');
    sub = t('Please try again later.');
    card = t('Picture service unavailable');
    text = t('Ask your teacher before starting again.');
    footer = t('Pixi couldn’t create your picture this time.');
  } else if (screen === 'blocked') {
    icon = <Sparkles />;
    title = t("Let's try another idea!");
    sub = t('Tell me about something happy, like a puppy or a rainbow.');
    card = t('Pixi can’t draw that one');
    text = t('Your teacher will take a look.');
    footer = t('You can always try again.');
    wait = false;
    tile = 'bg-k-purple-soft text-k-purple';
  }

  return (
    <>
      <Beside>
        <span className={cn('grid size-[8.4rem] place-items-center rounded-[2.2rem] [&>svg]:size-[3.4rem]', tile)}>{icon}</span>
        <Title className="mt-[3.2rem]">{title}</Title>
        <Sub className="mt-[1.4rem] text-[3rem]">{sub}</Sub>
        <div className="mt-[4.6rem] flex w-full flex-col rounded-[2.8rem] bg-white px-[2.8rem] py-[2.6rem]">
          <b className="flex items-center gap-[2rem] text-[2.3rem] font-bold text-k-ink">
            <span className={cn('[&>svg]:size-[2.4rem]', screen === 'blocked' ? 'text-k-purple' : 'text-k-warn-ink')}>{icon}</span>
            {card}
          </b>
          <span className="mt-[1.4rem] text-[2.1rem] text-k-muted">{text}</span>
        </div>
        {wait && (
          <p className="m-0 mt-[4.4rem] flex items-center gap-[1.6rem] text-[2.3rem] font-bold text-k-purple">
            <UserRound className="size-[2.6rem]" />
            {t('Please wait for your teacher.')}
          </p>
        )}
      </Beside>
      <Footer text={footer} />
    </>
  );
}

// The screen while the kiosk sleeps. Any button wakes it.
export function Sleep({ t }: { t: T }) {
  return (
    <div
      className="absolute inset-0 z-30 flex animate-k-in flex-col items-center justify-center gap-[2.4rem] text-center"
      style={{ background: 'radial-gradient(circle at 50% 40%, #3b2d5c, #1d1530 70%)' }}
    >
      <Moon className="size-[9rem] text-[#cbb8f4]" strokeWidth={1.4} />
      <b className="text-[3.6rem] font-extrabold text-white">{t('Shh… Pixi is sleeping.')}</b>
      <span className="animate-sleep-pulse text-[2.4rem] font-semibold text-[#cbb8f4]">{t('Press any button to wake me up')}</span>
    </div>
  );
}

// A flat drawing of Pixi, for kiosks where the 3D Pixi can't run (no WebGL,
// or too slow). Bobs gently.
export function FlatPixi() {
  return (
    <svg viewBox="0 0 200 200" className="size-full animate-float" aria-hidden>
      <g fill="#cdbaf5" opacity="0.9">
        <path d="M38 52l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#a8e8d2" />
        <path d="M160 40l2.5 7.5 7.5 2.5-7.5 2.5-2.5 7.5-2.5-7.5-7.5-2.5 7.5-2.5z" fill="#f7d774" />
        <path d="M34 118l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#f7d774" />
        <path d="M166 120l2.5 7.5 7.5 2.5-7.5 2.5-2.5 7.5-2.5-7.5-7.5-2.5 7.5-2.5z" fill="#a8e8d2" />
      </g>
      <rect x="72" y="138" width="20" height="34" rx="8" fill="#a98ce6" stroke="#6f4bb8" strokeWidth="5" />
      <rect x="108" y="138" width="20" height="34" rx="8" fill="#a98ce6" stroke="#6f4bb8" strokeWidth="5" />
      <path
        d="M100 22l20 42 46 6-34 31 9 46-41-23-41 23 9-46-34-31 46-6z"
        fill="#b9a0ee"
        stroke="#6f4bb8"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path d="M100 38l12 26" stroke="#d8c8f8" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="84" cy="96" rx="8" ry="10" fill="#3b2650" />
      <ellipse cx="116" cy="96" rx="8" ry="10" fill="#3b2650" />
      <circle cx="81" cy="92" r="3" fill="#fff" />
      <circle cx="113" cy="92" r="3" fill="#fff" />
      <ellipse cx="70" cy="110" rx="8" ry="5" fill="#f19aa6" />
      <ellipse cx="130" cy="110" rx="8" ry="5" fill="#f19aa6" />
      <path d="M92 112q8 7 16 0" fill="none" stroke="#3b2650" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
