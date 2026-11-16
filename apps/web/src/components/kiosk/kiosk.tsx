'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LangProvider, useT, type T } from '@/i18n';
import { api } from '@/lib/api';
import type { KioskState } from '@/lib/types';
import { useLiveConnection, useLiveStore } from '@/stores/live';
import { Pixi, type PixiMood } from '@/components/pixi/pixi';
import { ThoughtBubble } from '@/components/pixi/thought-bubble';
import { holdLeft, onTheWay, QUIET_SCREENS, screenFor, STOPPING_PROBLEMS, TALK_SCREENS, type ScreenId, type TalkStep } from './screen-for';
import { activityName, ENDED_SECONDS, FlatPixi, Header, headerStatus, ScreenView, Sleep, type CreatingStage, type View } from './screens';
import { playSound, unlockSound, useSoundReady } from './sounds';
import { useKioskButtons, type KioskButton } from './use-kiosk-buttons';
import { browserRecognition, useRecorder } from './use-recorder';

// The kiosk screen (Chromium in kiosk mode on the Raspberry Pi). There is no
// touchscreen: children use three buttons, Yes, No and a talk button they
// hold while they speak (use-kiosk-buttons.ts). screenFor() picks the screen
// and screens.tsx draws it, after the kiosk design in docs/design/kiosk.

// Screens that play a chime when they appear (sounds.ts). "listening" plays
// when the microphone opens, after "Get ready…".
const SCREEN_SOUNDS: Partial<Record<ScreenId, string>> = {
  heard: 'heard',
  creating: 'generating',
  printing: 'printing',
  done: 'preview',
  blocked: 'blocked',
  teacher_print: 'printing',
};
// Some screens stay a little longer before the next one: HOLD in screen-for.ts.
// After the talk button goes down, "Get ready…" shows this long before the
// microphone opens (with a chime and "Listening…").
const GET_READY_MS = 1000;
// The "Thinking…" step on "Creating your picture" shows at least this long.
const THINKING_MS = 1500;
// How long "Worksheet ready" stays before the next child (Yes skips it).
const DONE_SECONDS = 20;
// A child who stops pressing buttons on "Tell Pixi your idea" goes back to the start screen.
const READY_IDLE_MS = 60_000;
// After this long, "Drawing…" becomes "Almost ready…".
const ALMOST_MS = 12_000;
// A dropped connection is only shown after this long (a server restart reconnects sooner).
const OFFLINE_GRACE_MS = 3_000;

// What the child can speak, from the session's language list.
const SPEECH = [
  { label: 'English', id: 'en', code: 'en-US' },
  { label: 'Filipino', id: 'fil', code: 'fil-PH' },
  { label: 'Taglish', id: 'tl', code: 'fil-PH' }, // Filipino recognition also picks up English words
] as const;

const post = (action: string, body?: unknown) => api(`/api/device/${action}`, { method: 'POST', body: body ?? {} });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Where Pixi stands on each screen, in design pixels (the 1280x800 frames),
// its mood, and what it says in its thought bubble (screens without a
// bubble have their words under Pixi instead).
type Spot = { x: number; y: number; w: number; h: number };
const CENTER: Spot = { x: 420, y: 76, w: 440, h: 370 };
const BESIDE: Spot = { x: 40, y: 112, w: 460, h: 500 };
const LISTEN: Spot = { x: 480, y: 150, w: 320, h: 300 };
const HELP = (t: T) => t('It’s okay. Let’s get some help.');
const PIXI: Record<ScreenId, { spot: Spot; mood: PixiMood; bubble?: (t: T) => string }> = {
  starting: { spot: CENTER, mood: 'idle' },
  offline: { spot: BESIDE, mood: 'idle', bubble: HELP },
  waiting: { spot: CENTER, mood: 'idle' },
  connected: { spot: CENTER, mood: 'success' },
  ended: { spot: { x: 430, y: 88, w: 420, h: 360 }, mood: 'idle' },
  paused: { spot: CENTER, mood: 'idle' },
  home: { spot: { x: 900, y: 300, w: 320, h: 330 }, mood: 'idle' },
  ready: { spot: BESIDE, mood: 'idle', bubble: (t) => t('I can’t wait to hear your idea!') },
  listening: { spot: LISTEN, mood: 'listening' },
  thinking: { spot: LISTEN, mood: 'thinking' },
  typing: { spot: BESIDE, mood: 'idle', bubble: (t) => t('A teacher can help me listen!') },
  heard: { spot: BESIDE, mood: 'thinking', bubble: (t) => t('Did I get that right?') },
  creating: { spot: { x: 370, y: 94, w: 540, h: 380 }, mood: 'generating' },
  printing: { spot: { x: 50, y: 545, w: 170, h: 160 }, mood: 'printing' },
  done: { spot: CENTER, mood: 'success' },
  printer: { spot: BESIDE, mood: 'idle', bubble: HELP },
  blocked: { spot: BESIDE, mood: 'thinking', bubble: (t) => t('Let’s think of a happy idea!') },
  error: { spot: BESIDE, mood: 'idle', bubble: HELP },
  teacher_print: { spot: CENTER, mood: 'printing' },
};

// Print to Kiosk: how soon the screen asks again for a waiting teacher's file
// after the server said the kiosk was busy.
const TEACHER_PRINT_RETRY_MS = 5_000;

// Development only: a made-up state, and the screen to show (src/app/kiosk/kiosk-screen.tsx).
export type KioskDemo = { state: KioskState; screen?: ScreenId; message?: string; getReady?: boolean };

export function Kiosk({ demo }: { demo?: KioskDemo | null }) {
  useLiveConnection('kiosk', !demo);
  const live = useLiveStore();
  const state = demo?.state ?? live.state;
  return (
    <LangProvider lang={state?.prefs?.language}>
      <KioskView state={state} connected={demo ? true : live.connected} error={demo ? null : live.error} demo={demo ?? null} />
    </LangProvider>
  );
}

type ViewProps = { state: (KioskState & { speech?: { server: boolean } }) | null; connected: boolean; error: string | null; demo: KioskDemo | null };

function KioskView({ state, connected, error, demo }: ViewProps) {
  const t = useT();
  const socket = useLiveStore((s) => s.socket);
  const mode = state?.mode ?? null;
  const session = state?.session ?? null;
  const current = state?.current ?? null;
  const volume = state?.prefs?.volume ?? 0;
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  const now = useNow();

  // ---------- Connection ----------
  const [everConnected, setEverConnected] = useState(false);
  if (connected && state && !everConnected) setEverConnected(true);
  const [lostAt, setLostAt] = useState<number | null>(null);
  const lost = !demo && !connected && (everConnected || !!error);
  if (lost && lostAt === null) setLostAt(now);
  if (!lost && lostAt !== null) setLostAt(null);
  const offline = lostAt !== null && now - lostAt >= OFFLINE_GRACE_MS;
  const link = demo || (connected && state && !offline) ? 'online' : offline ? 'offline' : everConnected ? 'online' : 'starting';

  // ---------- "Session ended" countdown (kiosk only) ----------
  const [lastSession, setLastSession] = useState(session?.id ?? null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  if ((session?.id ?? null) !== lastSession) {
    setLastSession(session?.id ?? null);
    setEndedAt(lastSession !== null && !session ? now : null);
  }
  const endedLeft = endedAt === null ? 0 : ENDED_SECONDS - Math.floor((now - endedAt) / 1000);
  const sessionEnded = endedAt !== null && endedLeft > 0;

  // ---------- Talking ----------
  const recorder = useRecorder();
  const recognition = useRef<{ stop(): void; abort(): void } | null>(null);
  const holding = useRef(false);
  const [talk, setTalk] = useState<TalkStep>('idle');
  const [message, setMessage] = useState<string | null>(() => (demo?.message ? t.error(demo.message) : null));
  const [typed, setTyped] = useState('');

  // ---------- Start screen -> "Tell Pixi your idea" (kiosk only) ----------
  const [started, setStarted] = useState(false);
  const [lastMode, setLastMode] = useState(mode);
  const [lastPress, setLastPress] = useState(0);
  const [modeAt, setModeAt] = useState(now);
  if (mode !== lastMode) {
    setLastMode(mode);
    setModeAt(now);
    if (mode === 'ready') {
      // A new child starts on the start screen; "Try again" stays on the idea screen.
      if (lastMode !== 'listening' && lastMode !== 'heard') setStarted(false);
      // The server forgets an abandoned wish after a while: follow it back.
      if (talk === 'recording' || talk === 'thinking') setTalk('idle');
    }
  }
  const { stop: stopRecorder } = recorder;
  useEffect(() => {
    if (mode !== 'ready') return;
    stopRecorder();
    recognition.current?.abort();
  }, [mode, stopRecorder]);

  const allowed = SPEECH.filter((l) => session?.languages?.includes(l.label));
  const languages = allowed.length ? allowed : [SPEECH[0]];
  const speech = languages.find((l) => l.id === t.lang) ?? languages[0];

  const fail = useCallback(
    (text: string) => {
      setTalk('idle');
      setMessage(text ? t.error(text) : null);
      if (!demo) void post('cancel').catch(() => {});
    },
    [t, demo]
  );

  async function startTalking() {
    holding.current = true;
    setMessage(null);
    setStarted(true);
    if (demo) return;
    // "Get ready…" (the server already shows the child as talking), then the microphone opens.
    setTalk('starting');
    try {
      await Promise.all([post('listen'), wait(GET_READY_MS)]);
    } catch (err) {
      setTalk('idle');
      return setMessage(t.error((err as Error).message));
    }
    if (!holding.current) return fail('Hold the talk button while you talk!');
    playSound('listening', volumeRef.current);

    // 1. Speech-to-text on the server (ElevenLabs).
    if (state?.speech?.server) {
      let rec;
      try {
        setTalk('recording');
        rec = await recorder.start();
      } catch {
        return fail('Please allow the microphone, then try again.');
      }
      if (!rec.spoke || rec.blob.size < 1000) return fail("I didn't hear anything. Try again!");
      setTalk('thinking');
      const form = new FormData();
      form.append('audio', rec.blob, 'wish.webm');
      form.append('language', speech.id);
      try {
        await api('/api/device/transcribe', { method: 'POST', form });
        setTalk('idle');
      } catch (err) {
        fail((err as Error).message);
      }
      return;
    }

    // 2. The browser's own speech recognition, until the button is let go.
    const Recognition = browserRecognition();
    if (Recognition) {
      const rec = new Recognition();
      recognition.current = rec;
      rec.lang = speech.code;
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let text = '';
      let failed = false;
      rec.onresult = (e) => {
        text = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join(' ');
      };
      rec.onerror = (e) => {
        if (e.error === 'aborted') return;
        failed = true;
        fail(e.error === 'not-allowed' ? 'Please allow the microphone, then try again.' : "I didn't catch that. Try again!");
      };
      rec.onend = () => {
        recognition.current = null;
        if (failed) return;
        if (!text.trim()) return fail("I didn't hear anything. Try again!");
        setTalk('thinking');
        post('heard', { text, language: speech.id })
          .then(() => setTalk('idle'))
          .catch((err: Error) => fail(err.message));
      };
      setTalk('recording');
      rec.start();
      return;
    }

    // 3. No speech recognition at all: a teacher types the idea.
    setTalk('typing');
  }

  function stopTalking() {
    holding.current = false;
    recorder.stop();
    recognition.current?.stop();
  }

  async function sendTyped() {
    if (!typed.trim()) return;
    setTalk('thinking');
    try {
      await post('heard', { text: typed, language: speech.id });
      setTyped('');
      setTalk('idle');
    } catch (err) {
      fail((err as Error).message);
    }
  }

  // ---------- Which screen ----------
  const problem = state?.printer?.problem ?? null;
  const target: ScreenId =
    demo?.screen ??
    screenFor({
      link,
      mode,
      teacherOpen: !!state?.teacher,
      sessionEnded,
      started,
      talk,
      printerStopped: !!problem && STOPPING_PROBLEMS.includes(problem),
      printFailed: !!current?.printProblem,
    });
  // What the child sees: the target screen, once the screen showing has had
  // its HOLD time. The buttons act on what is shown.
  const shown = useHeldScreen(target);
  const screen = shown.id;
  const sleeping = (!!demo || link === 'online') && !!state?.screen?.sleeping;

  // Back to the start screen when a child walks away from "Tell Pixi your idea".
  if (screen === 'ready' && started && lastPress && now - Math.max(lastPress, modeAt) > READY_IDLE_MS) {
    setStarted(false);
    setMessage(null);
  }

  // "Worksheet ready" (or its printer problem) moves on to the next child.
  const currentId = current?.id;
  const doneOver = mode === 'preview' && now - modeAt >= DONE_SECONDS * 1000;
  const sentNext = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (demo || !doneOver || sentNext.current === currentId) return;
    sentNext.current = currentId;
    void post('next', { id: currentId }).catch(() => {});
  }, [demo, doneOver, currentId]);

  // ---------- Buttons ----------
  function press(button: KioskButton) {
    void unlockSound();
    setLastPress(Date.now());
    if (demo) return;
    if (sleeping) {
      void post('touch').catch(() => {});
      return;
    }
    // Any press counts as someone at the kiosk (keeps it from sleeping).
    void post('touch').catch(() => {});
    if (button === 'talk') {
      if (TALK_SCREENS.includes(screen) && talk === 'idle') void startTalking();
      return;
    }
    switch (screen) {
      case 'home':
        if (button === 'yes') setStarted(true);
        break;
      case 'ready':
        if (button === 'no') {
          setStarted(false);
          setMessage(null);
        } else setMessage(t('Hold the talk button and tell me!'));
        break;
      case 'heard':
        if (button === 'yes') void post('wish').catch((err: Error) => setMessage(t.error(err.message)));
        else void post('cancel').catch(() => {});
        break;
      case 'done':
      case 'printer':
        if (button === 'yes' && mode === 'preview') void post('next', { id: currentId }).catch(() => {});
        break;
      case 'typing':
        if (button === 'no') {
          setTyped('');
          fail('');
        }
        break;
    }
  }

  function release(button: KioskButton) {
    if (button === 'talk') stopTalking();
  }

  useKioskButtons({ down: press, up: release });

  // ---------- Sounds and teacher commands ----------
  // "Restart Kiosk" reloads this screen; "Test sound" in Settings plays a chime.
  useEffect(() => {
    if (!socket) return;
    const reload = () => window.location.reload();
    // The answer tells the Teacher App whether the sound was really heard.
    const sound = (name: string, answer?: unknown) => {
      const result = playSound(name, volumeRef.current);
      if (typeof answer === 'function') answer(result);
    };
    socket.on('kiosk:reload', reload);
    socket.on('kiosk:sound', sound);
    return () => {
      socket.off('kiosk:reload', reload);
      socket.off('kiosk:sound', sound);
    };
  }, [socket]);

  // Chromium on the Pi may play sound right away; elsewhere the first button
  // press (or click) turns sound on.
  useEffect(() => {
    void unlockSound();
    const unlock = () => void unlockSound();
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // ---------- Print to Kiosk ----------
  // A file a teacher sent prints only while nobody is in the middle of a
  // wish: the start screen (before Yes), no session, or a paused one. The
  // server checks again, then shows "Printing teacher's file…" and comes back
  // to the start screen.
  const waitingFiles = state?.teacherPrint?.pending ?? 0;
  const quiet = QUIET_SCREENS.includes(screen) && talk === 'idle';
  const [askAgain, setAskAgain] = useState(0);
  useEffect(() => {
    if (demo || link !== 'online' || !quiet || waitingFiles === 0) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void post('teacher-print')
      .catch(() => {})
      .finally(() => {
        if (alive) retry = setTimeout(() => setAskAgain((n) => n + 1), TEACHER_PRINT_RETRY_MS);
      });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [demo, link, quiet, waitingFiles, askAgain]);

  const chimed = useRef(screen);
  useEffect(() => {
    if (screen === chimed.current) return;
    chimed.current = screen;
    const sound = SCREEN_SOUNDS[screen];
    if (sound && !sleeping) playSound(sound, volumeRef.current);
  }, [screen, sleeping]);
  // "Sound on" only when the browser really lets the kiosk play sound.
  const soundReady = useSoundReady();

  // ---------- Drawing ----------
  const [pixiOk, setPixiOk] = useState(true);
  const pixiOff = useCallback(() => setPixiOk(false), []);
  const pixi = PIXI[screen];
  const creating: CreatingStage =
    mode === 'processing' || (screen === 'creating' && now - shown.at < THINKING_MS) ? 'thinking' : now - modeAt > ALMOST_MS ? 'almost' : 'drawing';
  const activity = session?.activity_type ?? '';
  const progress = demo?.screen === 'starting' ? 60 : link === 'starting' ? (connected ? 75 : 35) : 100;
  const brightness = state?.screen?.brightness ?? 100;
  const kioskColor = state?.prefs?.kioskColor ?? 'auto';
  // Pixi reads the microphone level every frame (the React Compiler keeps this stable).
  const levelRead = () => recorder.level.current;

  const view: View = {
    screen,
    t,
    activity,
    theme: session?.theme ?? null,
    current,
    teacher: state?.teacher ?? null,
    message,
    micOn: demo ? !demo.getReady : talk === 'recording',
    level: talk === 'recording' && state?.speech?.server ? recorder.level : null,
    progress,
    creating,
    endedLeft: demo?.screen === 'ended' ? 3 : endedLeft,
    printerProblem: screen === 'printer' ? (problem ?? 'error') : null,
    teacherPrint: state?.teacherPrint?.printing ?? null,
    offlineReason: !connected && error && !everConnected ? t.error(error) : null,
    typed,
    setTyped,
    sendTyped: () => void sendTyped(),
    press,
    release,
  };

  const status = useMemo(() => headerStatus(screen, activityName(activity, t), t), [screen, activity, t]);

  return (
    <div
      data-kiosk
      // Which screen is showing (a ScreenId), for debugging and automated checks.
      data-screen={sleeping ? 'sleep' : screen}
      data-activity={activity || undefined}
      data-tint={screen === 'home' ? activity : undefined}
      // Kiosk Color from the Teacher App's Settings (globals.css); auto keeps each mode's own colors.
      data-color={kioskColor !== 'auto' ? kioskColor : undefined}
      className="fixed inset-0 grid place-items-center overflow-hidden bg-k-bg font-kiosk text-k-ink transition-colors duration-500 select-none"
      style={{ filter: brightness < 100 ? `brightness(${brightness}%)` : undefined }}
    >
      <div className="relative h-[80rem] w-[128rem]">
        <Header t={t} status={status} soundOn={volume > 0 && (soundReady || !!demo)} />
        {/* A new key per screen restarts the screen's entrance animation. */}
        <div key={screen} className="absolute inset-0">
          <ScreenView view={view} />
        </div>

        {/* Pixi stays on screen between screens and glides to its place. */}
        <div
          className="pointer-events-none absolute z-10 transition-[left,top,width,height,opacity] duration-700 ease-out"
          style={{ left: `${pixi.spot.x / 10}rem`, top: `${pixi.spot.y / 10}rem`, width: `${pixi.spot.w / 10}rem`, height: `${pixi.spot.h / 10}rem`, opacity: sleeping ? 0 : 1 }}
        >
          {pixiOk ? (
            <Pixi
              mood={pixi.mood}
              level={levelRead}
              picture={current?.imageUrl ?? null}
              wish={current?.recognizedText ?? null}
              paused={sleeping}
              onUnavailable={pixiOff}
              className="size-full"
            >
              <ThoughtBubble className="text-[2rem]!" text={(screen === 'ready' && message) || pixi.bubble?.(t) || null} mood={pixi.mood} />
            </Pixi>
          ) : (
            <div className="mx-auto aspect-square h-[70%] translate-y-[20%]">
              <FlatPixi />
            </div>
          )}
        </div>

        {sleeping && <Sleep t={t} />}
      </div>
    </div>
  );
}

// The screen to show: `target`, except that the screen showing now stays
// until its HOLD time is over, and a screen on the way (onTheWay) shows
// first. Both in screen-for.ts. `at` is when the shown screen appeared.
function useHeldScreen(target: ScreenId) {
  const [shown, setShown] = useState(() => ({ id: target, at: Date.now() }));
  useEffect(() => {
    if (target === shown.id) return;
    const next = onTheWay(shown.id, target) ?? target;
    const timer = setTimeout(() => setShown({ id: next, at: Date.now() }), holdLeft(shown.id, Date.now() - shown.at));
    return () => clearTimeout(timer);
  }, [target, shown]);
  return shown;
}

// The time now, updated 4 times a second (for countdowns and timeouts).
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return now;
}
