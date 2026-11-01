'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Keyboard, Mic, RotateCcw, Square, Volume2 } from 'lucide-react';
import { LangProvider, useT } from '@/i18n';
import { api } from '@/lib/api';
import type { Current, KioskState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLiveConnection, useLiveStore } from '@/stores/live';
import { Logo } from '@/components/logo';
import { Stepper } from '@/components/stepper';
import { MicArt, MoonArt, OopsArt, PauseArt, PrinterArt, SparkArt, ThinkArt } from './art';
import { Sheet } from './sheet';
import { playSound, soundReady, unlockSound } from './sounds';
import { browserRecognition, useRecorder } from './use-recorder';

const PREVIEW_SECONDS = 30;
const FLOW_MODES = ['listening', 'heard', 'processing', 'generating', 'printing'];
const TALK_MODES = ['ready', 'listening', 'heard'];
// Kiosk modes that play a chime when the kiosk enters them.
const MODE_SOUNDS = ['listening', 'heard', 'generating', 'printing', 'preview', 'blocked'];

// Rotating lines while the picture is made (it can take a minute).
const GENERATING_LINES = ['Mixing the colors…', 'Drawing the lines…', 'Adding a little magic…', 'Almost ready…', 'Good pictures take a moment…'];

// What the child can speak, from the session's language list.
const SPEECH = [
  { label: 'English', id: 'en', code: 'en-US' },
  { label: 'Filipino', id: 'fil', code: 'fil-PH' },
  { label: 'Taglish', id: 'tl', code: 'fil-PH' }, // Filipino recognition also picks up English words
] as const;
type SpeechId = (typeof SPEECH)[number]['id'];

const ACTIVITY_LABELS: Record<string, string> = { color_create: 'Color & Create', trace_learn: 'Trace & Learn', free_play: 'Free Play' };
const IDEAS: Record<string, string> = {
  Animals: 'a cat, a dog, a lion',
  Transportation: 'a car, a jeepney, an airplane',
  Fruits: 'an apple, a mango, a banana',
  'Community Helpers': 'a doctor, a teacher, a firefighter',
  Shapes: 'a circle, a square, a triangle',
  Colors: 'a red ball, a blue bird, a yellow sun',
  Nature: 'a tree, a flower, a butterfly',
};

const post = (action: string, body?: unknown) => api(`/api/device/${action}`, { method: 'POST', body: body ?? {} });

// The kiosk screen on the Raspberry Pi touchscreen. Children tap the
// microphone, say their idea, check what the kiosk heard, and get a picture.
export function Kiosk({ demo }: { demo?: KioskState | null }) {
  useLiveConnection('kiosk', !demo);
  const live = useLiveStore();
  const state = demo ?? live.state;
  return (
    <LangProvider lang={state?.prefs?.language}>
      <KioskView state={state} connected={demo ? true : live.connected} error={demo ? null : live.error} demo={!!demo} />
    </LangProvider>
  );
}

type ViewProps = { state: (KioskState & { speech?: { server: boolean } }) | null; connected: boolean; error: string | null; demo: boolean };

function KioskView({ state, connected, error, demo }: ViewProps) {
  const t = useT();
  const socket = useLiveStore((s) => s.socket);
  const [soundOn, setSoundOn] = useState(false);
  const mode = state?.mode;
  const volume = state?.prefs?.volume ?? 0;
  const volumeRef = useRef(volume);
  const lastMode = useRef(mode);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // "Restart Kiosk" reloads this screen; "Test sound" in Settings plays a chime.
  useEffect(() => {
    if (!socket) return;
    const reload = () => window.location.reload();
    const sound = (name: string) => playSound(name, volumeRef.current);
    socket.on('kiosk:reload', reload);
    socket.on('kiosk:sound', sound);
    return () => {
      socket.off('kiosk:reload', reload);
      socket.off('kiosk:sound', sound);
    };
  }, [socket]);

  // The browser only allows sound after the screen has been touched once
  // (the Pi's Chromium starts with autoplay allowed, so this is for laptops).
  useEffect(() => {
    if (soundOn) return;
    const unlock = () => void unlockSound().then((ok) => ok && setSoundOn(true));
    void unlockSound().then((ok) => ok && setSoundOn(soundReady()));
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, [soundOn]);

  // A chime each time the kiosk moves on to a new step.
  const sleepingNow = state?.screen?.sleeping;
  useEffect(() => {
    if (mode !== lastMode.current && mode && MODE_SOUNDS.includes(mode) && !sleepingNow) playSound(mode, volumeRef.current);
    lastMode.current = mode;
  }, [mode, sleepingNow]);

  const sleeping = !demo && connected && state?.screen?.sleeping;
  const brightness = state?.screen?.brightness ?? 100;

  let screen;
  if (error) screen = <Message art={<OopsArt />} title={t("Kiosk can't connect")} text={t.error(error)} />;
  else if (!connected || !state) screen = <Message art={<SparkArt />} title={t('Starting WishPix…')} text={t('Connecting to the kiosk server.')} />;
  else screen = <ModeScreen state={state} />;

  return (
    <div
      className="grid h-dvh select-none grid-rows-[auto_1fr_auto] overflow-hidden text-navy-900"
      style={{ background: 'var(--splash-gradient)', fontSize: 'clamp(14px, 1.3vw, 22px)', filter: brightness < 100 ? `brightness(${brightness}%)` : undefined }}
    >
      <header className="flex items-center justify-between px-[2.4em] py-[1.4em]">
        <Logo size={36} />
        <div className="flex items-center gap-[0.8em]">
          {!demo && !soundOn && volume > 0 && (
            <Pill className="bg-warning-bg/90 text-amber-800">
              <Volume2 className="mr-1 inline size-[1em]" /> {t('Touch the screen to turn on sounds')}
            </Pill>
          )}
          {state?.session && (
            <Pill>
              {t('Today:')} <b className="text-brand-700">{t(state.session.theme)}</b>
            </Pill>
          )}
          <Pill>
            <i className={cn('mr-[0.3em] inline-block size-[0.6em] rounded-full', connected ? 'bg-success' : 'bg-danger')} />
            {state?.kioskName ?? t('Kiosk')} · {connected ? t('Online') : t('Offline')}
          </Pill>
        </div>
      </header>

      {/* One key for the whole talk flow, so a recording survives the mode changes. */}
      <main key={TALK_MODES.includes(mode ?? '') ? 'talk' : mode} className="flex min-h-0 animate-k-in items-center justify-center px-[3em]">
        {screen}
      </main>

      <footer className={cn('flex justify-center pt-[1.2em] pb-[2em] transition duration-400', FLOW_MODES.includes(mode ?? '') ? 'opacity-100' : 'translate-y-5 opacity-0')}>
        <div className="w-[min(720px,80vw)] rounded-full bg-navy-800 px-[2em] py-[1em] shadow-card">
          <Stepper mode={mode} />
        </div>
      </footer>

      {sleeping && (
        <button
          className="fixed inset-0 z-50 flex animate-k-in flex-col items-center justify-center gap-[1.4em] border-0 text-[1.5em] text-[#cfe0f5]"
          style={{ background: 'radial-gradient(circle at 50% 40%, #1e3a5f, #0b1f3a 70%)' }}
          onClick={() => void post('touch')}
          aria-label={t('Wake the kiosk')}
        >
          <span className="w-[7em] opacity-80">
            <MoonArt />
          </span>
          <b className="animate-sleep-pulse font-semibold opacity-75">{t('Touch the screen to wake me up')}</b>
        </button>
      )}
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('rounded-full bg-white/65 px-[1.1em] py-[0.5em] text-[0.85em] font-semibold text-navy-700 backdrop-blur', className)}>{children}</span>;
}

function ModeScreen({ state }: { state: NonNullable<ViewProps['state']> }) {
  const t = useT();
  const { mode, session, current } = state;
  switch (mode) {
    case 'waiting':
      return <Message art={<MoonArt />} title={t('Waiting for teacher')} text={t('Your teacher will start an activity soon.')} />;
    case 'paused':
      return <Message art={<PauseArt />} title={t('Little break!')} text={t("Your teacher paused the activity. We'll be back soon.")} />;
    case 'ready':
    case 'listening':
    case 'heard':
      return <TalkFlow state={state} />;
    case 'processing':
      return <Heard text={current?.recognizedText} />;
    case 'generating':
      return <Generating text={current?.recognizedText} override={current?.override} />;
    case 'printing':
      return <Printing current={current} activityType={session?.activity_type} theme={session?.theme} />;
    case 'preview':
      return <Preview current={current} activityType={session?.activity_type} theme={session?.theme} />;
    case 'blocked':
      return <Message art={<ThinkArt />} title={t("Let's try another idea!")} text={t('Tell me about something happy, like a puppy or a rainbow.')} soft />;
    case 'error':
      return <Message art={<OopsArt />} title={t('Oops! The picture got stuck.')} text={t("Let's try again in a moment.")} soft />;
    default:
      return <Message art={<SparkArt />} title="WishPix" />;
  }
}

function Message({ art, title, text, soft, children }: { art?: React.ReactNode; title: string; text?: string; soft?: boolean; children?: React.ReactNode }) {
  return (
    <section className="flex max-w-[34em] flex-col items-center text-center">
      {art && <div className="mb-[1.2em] w-[11em]">{art}</div>}
      <h1 className={cn('mb-[0.3em] text-[3.4em] leading-[1.05] font-extrabold tracking-tight', soft && 'text-brand-700')}>{title}</h1>
      {text && <p className="m-0 text-[1.4em] text-navy-700">{text}</p>}
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-[0.6em] text-[0.9em] font-bold tracking-[0.22em] text-brand-700 uppercase">{children}</p>;
}

function Bubble({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div className={cn('mb-[0.8em] rounded-[1.2em] bg-white px-[1.2em] py-[0.6em] font-extrabold text-brand-600 shadow-card', small ? 'text-[1.6em]' : 'text-[2.6em]')}>
      “{children}”
    </div>
  );
}

function BigButton({ children, onClick, tone = 'primary', disabled }: { children: React.ReactNode; onClick: () => void; tone?: 'primary' | 'soft'; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-[0.5em] rounded-full border-0 whitespace-nowrap px-[1.8em] py-[0.7em] text-[1.6em] font-extrabold transition active:scale-95 disabled:opacity-50',
        tone === 'primary' ? 'bg-brand-600 text-white shadow-[0_10px_24px_rgba(10,132,198,0.4)]' : 'bg-white/80 text-navy-800'
      )}
    >
      {children}
    </button>
  );
}

// ---------- Talking to the kiosk ----------

type Local = { step: 'idle' | 'starting' | 'recording' | 'thinking' | 'typing'; message: string | null };

function TalkFlow({ state }: { state: NonNullable<ViewProps['state']> }) {
  const t = useT();
  const recorder = useRecorder();
  const [local, setLocal] = useState<Local>({ step: 'idle', message: null });
  const [typed, setTyped] = useState('');
  const recognition = useRef<{ stop(): void; abort(): void } | null>(null);
  const session = state.session;
  const mode = state.mode;

  const allowed = SPEECH.filter((l) => session?.languages?.includes(l.label));
  const languages = allowed.length ? allowed : [SPEECH[0]];
  const [chosen, setChosen] = useState<SpeechId | null>(null);
  const preferred = chosen ?? (t.lang === 'fil' ? 'fil' : 'en');
  const lang = languages.find((l) => l.id === preferred) ?? languages[0];

  const fail = useCallback(
    (message: string) => {
      setLocal({ step: 'idle', message: t.error(message) });
      void post('cancel').catch(() => {});
    },
    [t]
  );

  // The server forgets an abandoned wish after a while; follow it back to
  // the start screen (state adjusted while rendering, the microphone
  // released in an effect).
  const [lastMode, setLastMode] = useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    if (mode === 'ready' && (local.step === 'recording' || local.step === 'thinking')) setLocal({ step: 'idle', message: null });
  }
  const { stop: stopRecorder } = recorder;
  useEffect(() => {
    if (mode !== 'ready') return;
    stopRecorder();
    recognition.current?.abort();
  }, [mode, stopRecorder]);

  async function talk() {
    setLocal({ step: 'starting', message: null });
    try {
      await post('listen');
    } catch (err) {
      return setLocal({ step: 'idle', message: t.error((err as Error).message) });
    }

    // 1. Speech-to-text on the server (ElevenLabs).
    if (state.speech?.server) {
      let rec;
      try {
        setLocal({ step: 'recording', message: null });
        rec = await recorder.start();
      } catch {
        return fail('Please allow the microphone, then try again.');
      }
      if (!rec.spoke || rec.blob.size < 1000) return fail("I didn't hear anything. Try again!");
      setLocal({ step: 'thinking', message: null });
      const form = new FormData();
      form.append('audio', rec.blob, 'wish.webm');
      form.append('language', lang.id);
      try {
        await api('/api/device/transcribe', { method: 'POST', form });
        setLocal({ step: 'idle', message: null });
      } catch (err) {
        fail((err as Error).message);
      }
      return;
    }

    // 2. The browser's own speech recognition.
    const Recognition = browserRecognition();
    if (Recognition) {
      const rec = new Recognition();
      recognition.current = rec;
      rec.lang = lang.code;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let text = '';
      rec.onresult = (e) => {
        text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      };
      rec.onerror = (e) => fail(e.error === 'not-allowed' ? 'Please allow the microphone, then try again.' : "I didn't catch that. Try again!");
      rec.onend = () => {
        recognition.current = null;
        if (!text.trim()) return fail("I didn't hear anything. Try again!");
        setLocal({ step: 'thinking', message: null });
        post('heard', { text, language: lang.id })
          .then(() => setLocal({ step: 'idle', message: null }))
          .catch((err: Error) => fail(err.message));
      };
      setLocal({ step: 'recording', message: null });
      rec.start();
      return;
    }

    // 3. No speech recognition at all: type it (a teacher helps).
    setLocal({ step: 'typing', message: null });
  }

  function stopTalking() {
    recorder.stop();
    recognition.current?.stop();
  }

  async function sendTyped() {
    if (!typed.trim()) return;
    setLocal({ step: 'thinking', message: null });
    try {
      await post('heard', { text: typed, language: lang.id });
      setTyped('');
      setLocal({ step: 'idle', message: null });
    } catch (err) {
      fail((err as Error).message);
    }
  }

  async function confirm() {
    try {
      await post('wish');
    } catch (err) {
      setLocal({ step: 'idle', message: t.error((err as Error).message) });
    }
  }

  // Confirm what the kiosk heard.
  if (mode === 'heard' && local.step !== 'recording' && local.step !== 'thinking' && local.step !== 'starting') {
    return (
      <Message title={t('Did you say…')}>
        <div className="mt-[0.4em]">
          <Bubble>{state.current?.recognizedText}</Bubble>
        </div>
        <div className="mt-[0.6em] flex gap-[1em]">
          <BigButton onClick={confirm}>
            <Check className="size-[1.1em]" strokeWidth={3} /> {t('Yes, make it!')}
          </BigButton>
          <BigButton tone="soft" onClick={talk}>
            <RotateCcw className="size-[1em]" /> {t('Try again')}
          </BigButton>
        </div>
        {local.message && <p className="mt-[1em] text-[1.2em] font-semibold text-danger">{local.message}</p>}
      </Message>
    );
  }

  if (local.step === 'recording' || (mode === 'listening' && local.step === 'starting')) {
    return (
      <Message art={<MicArt listening level={recorder.level} />} title={t("I'm listening…")} text={t('Say what you want to see!')}>
        <div className="mt-[1.4em]">
          <BigButton onClick={stopTalking}>
            <Square className="size-[0.9em] fill-current" /> {t("I'm done talking")}
          </BigButton>
        </div>
      </Message>
    );
  }

  if (local.step === 'thinking') {
    return <Message art={<SparkArt spinning />} title={t('Let me think…')} text={t('Listening to your idea.')} />;
  }

  if (local.step === 'typing') {
    return (
      <Message art={<Keyboard className="mx-auto size-[6em] text-navy-800" />} title={t('Type your idea')} text={t('Voice is not set up on this kiosk. A teacher can help type.')}>
        <div className="mt-[1em] flex w-[min(32em,80vw)] gap-[0.6em]">
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendTyped()}
            maxLength={200}
            placeholder={lang.id === 'en' ? 'e.g. a happy cat' : 'hal. masayang pusa'}
            className="h-[2.6em] flex-1 rounded-full border-0 bg-white px-[1em] text-[1.2em] shadow-card outline-none focus:ring-4 focus:ring-brand-500/40"
          />
          <BigButton onClick={sendTyped} disabled={!typed.trim()}>
            {t('OK')}
          </BigButton>
        </div>
        <button className="mt-[1em] border-0 bg-transparent text-[1.1em] font-semibold text-navy-700 underline" onClick={() => fail('')}>
          {t('Cancel')}
        </button>
      </Message>
    );
  }

  // Ready: the big microphone button.
  const someoneTalking = mode === 'listening';
  return (
    <section className="grid w-[min(1200px,100%)] grid-cols-[1.2fr_1fr] items-center gap-[4em]">
      <div>
        <Eyebrow>{t(ACTIVITY_LABELS[session?.activity_type ?? ''] ?? '')}</Eyebrow>
        <h1 className="mb-[0.3em] text-[3.4em] leading-[1.05] font-extrabold tracking-tight">{t("Let's make a picture!")}</h1>
        <ol className="my-[1.2em] grid list-none gap-[0.9em] p-0">
          {[
            [t('Tap the microphone'), t('The big blue button.')],
            [t('Say your idea'), t('Like “a happy cat”.')],
            [t('Get your picture'), t('Watch it appear here!')],
          ].map(([title, text], i) => (
            <li key={i} className="flex items-center gap-[1em] rounded-[1em] bg-white/70 px-[1.1em] py-[0.8em]">
              <span className="grid size-[2.4em] shrink-0 place-items-center rounded-full bg-navy-800 text-[1.1em] font-extrabold text-white">{i + 1}</span>
              <div>
                <b className="block text-[1.25em]">{title}</b>
                <small className="text-[0.95em] text-muted-foreground">{text}</small>
              </div>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[1.05em] text-navy-700">{t('Ideas: {list}', { list: t(IDEAS[session?.theme ?? ''] ?? 'anything you like!') })}</p>
      </div>

      <div className="flex flex-col items-center gap-[1.2em]">
        {languages.length > 1 && (
          <div className="flex gap-[0.4em] rounded-full bg-white/60 p-[0.3em]" role="radiogroup" aria-label={t('Language I will speak')}>
            {languages.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={l.id === lang.id}
                onClick={() => setChosen(l.id)}
                className={cn('rounded-full border-0 px-[1.2em] py-[0.5em] text-[1.05em] font-bold', l.id === lang.id ? 'bg-navy-800 text-white' : 'bg-transparent text-navy-700')}
              >
                {t(l.label)}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={talk}
          disabled={someoneTalking || local.step === 'starting'}
          aria-label={t('Tap to talk')}
          className="grid size-[min(30vw,44vh)] place-items-center rounded-full border-0 bg-navy-800 text-white shadow-[0_20px_50px_rgba(11,31,58,0.35)] transition active:scale-95 disabled:opacity-60"
        >
          <Mic className="size-[40%]" strokeWidth={2.2} />
        </button>
        <b className="text-[1.8em]">{someoneTalking ? t('Someone else is talking…') : t('Tap and talk!')}</b>
        {local.message && (
          <p className="m-0 rounded-[0.8em] bg-white/80 px-[1em] py-[0.5em] text-[1.15em] font-semibold text-danger" role="alert">
            {local.message}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------- The picture ----------

function Heard({ text }: { text?: string }) {
  const t = useT();
  return (
    <section className="flex max-w-[34em] flex-col items-center text-center">
      <Eyebrow>{t('I heard')}</Eyebrow>
      <Bubble>{text}</Bubble>
      <p className="m-0 text-[1.4em] text-navy-700">{t("Checking that it's a happy idea…")}</p>
    </section>
  );
}

function Generating({ text, override }: { text?: string; override?: boolean }) {
  const t = useT();
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % GENERATING_LINES.length), 3500);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="flex max-w-[34em] flex-col items-center text-center">
      <div className="mb-[1.2em] w-[11em]">
        <SparkArt spinning />
      </div>
      {override && <Eyebrow>{t('Your teacher said yes!')}</Eyebrow>}
      <h1 className="mb-[0.3em] text-[3.4em] leading-[1.05] font-extrabold tracking-tight">{t('Making your picture')}</h1>
      <Bubble small>{text}</Bubble>
      <p key={i} className="m-0 animate-k-in text-[1.4em] text-navy-700">
        {t(GENERATING_LINES[i])}
      </p>
    </section>
  );
}

type PictureProps = { current: Current | null; activityType?: string; theme?: string };

function Printing({ current, activityType, theme }: PictureProps) {
  const t = useT();
  return (
    <section className="flex h-full flex-col items-center pt-[1vh]">
      <h1 className="mb-[0.5em] text-[2.6em] font-extrabold">{t('Printing your picture…')}</h1>
      <div className="flex min-h-0 w-[min(24em,57vh)] flex-1 flex-col items-center">
        <PrinterArt />
        <div className="relative z-[1] mt-[-9%] min-h-0 w-[62%] flex-1 overflow-hidden">
          <div className="animate-k-paper shadow-[0_8px_20px_rgba(0,0,0,0.15)]">
            <Sheet current={current} activityType={activityType} theme={theme} compact />
          </div>
        </div>
      </div>
    </section>
  );
}

function Preview({ current, activityType, theme }: PictureProps) {
  const t = useT();
  const [left, setLeft] = useState(PREVIEW_SECONDS);
  const id = current?.id;
  const done = useCallback(() => void post('next', { id }).catch(() => {}), [id]);
  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (left <= 0) done();
  }, [left, done]);

  return (
    <section className="flex h-full items-center gap-[4em] py-[1em]">
      <div className="aspect-[2/3] h-[min(78vh,100%)] animate-k-drop shadow-[0_24px_60px_rgba(11,31,58,0.32)]">
        <Sheet current={current} activityType={activityType} theme={theme} />
      </div>
      <div className="max-w-[22em]">
        <Eyebrow>{t('Print preview')}</Eyebrow>
        <h1 className="mb-[0.3em] text-[3.4em] leading-[1.05] font-extrabold tracking-tight">{t("Here's your picture!")}</h1>
        <div className="inline-block">
          <Bubble small>{current?.recognizedText}</Bubble>
        </div>
        {current?.printProblem && (
          <p className="mb-[1.2em] rounded-[0.8em] bg-warning-bg/90 px-[1em] py-[0.8em] font-semibold text-amber-800">
            {t('The printer needs a little help. Your teacher will print your picture soon!')}
          </p>
        )}
        <div className="my-[1em]">
          <BigButton onClick={done}>{t("I'm done!")}</BigButton>
        </div>
        <p className="m-0 flex items-center gap-[0.6em] text-navy-700">
          <svg viewBox="0 0 36 36" className="size-[1.8em] -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" stroke="rgba(11,31,58,0.15)" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="4"
              stroke="var(--navy-800)"
              strokeDasharray="94.2"
              strokeLinecap="round"
              style={{ strokeDashoffset: 94.2 * (1 - left / PREVIEW_SECONDS), transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          {t('Next friend in {n}s', { n: Math.max(left, 0) })}
        </p>
      </div>
    </section>
  );
}
