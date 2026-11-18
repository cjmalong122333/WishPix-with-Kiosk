'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, Cloud, Globe, Heart, Image as ImageIcon, Layers, Lock, Paintbrush, Palette, Pencil, Play, Plus, Settings, Shapes,
  ShieldCheck, Smile, Sparkles, Stethoscope, Type, X, Zap, type LucideIcon,
} from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { MODE_NAMES, SAFETY_NAMES, themeName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLive } from '@/components/teacher/auth';
import { ErrorText, PageTitle, Panel, Tint, Warn, type TintName } from '@/components/teacher/ui';

// Session Setup: what the kiosk does until the teacher ends the session.
//   Trace & Learn:  Mode Preset -> Mode (Trace Word | Trace Image) -> Theme -> Safety -> Start
//   Color & Create: Mode Preset -> Theme -> Safety -> Start (one output, so no Mode step)
// In the database the mode preset is the session's activity_type and the mode
// its activity_subtype (src/server/catalog.ts).

type StepId = 'preset' | 'mode' | 'theme' | 'safety' | 'start';
const STEP_NAMES: Record<StepId, string> = { preset: 'Activity Preset', mode: 'Mode', theme: 'Theme', safety: 'Safety', start: 'Start' };
const stepsFor = (preset: string | null): StepId[] =>
  preset === 'trace_learn' ? ['preset', 'mode', 'theme', 'safety', 'start'] : ['preset', 'theme', 'safety', 'start'];

const PRESET_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
  trace_learn: { icon: Pencil, tone: 'purple' },
  color_create: { icon: Palette, tone: 'blue' },
};
const MODE_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
  trace_word: { icon: Type, tone: 'purple' },
  trace_image: { icon: ImageIcon, tone: 'green' },
};

const THEME_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
  free_expression: { icon: Sparkles, tone: 'blue' },
  animals: { icon: Smile, tone: 'gray' },
  transportation: { icon: Zap, tone: 'orange' },
  fruits: { icon: Heart, tone: 'red' },
  community_helpers: { icon: Stethoscope, tone: 'green' },
  shapes: { icon: Shapes, tone: 'blue' },
  colors: { icon: Paintbrush, tone: 'amber' },
  nature: { icon: Cloud, tone: 'pink' },
};

const SAFETY_LEVELS = [
  { id: 'strict', icon: Lock, tag: 'Maximum filtering', text: 'Only clearly child-friendly requests pass. Best for the youngest groups.' },
  { id: 'standard', icon: ShieldCheck, tag: 'Recommended', text: 'Blocks violence, adult content and unsafe phrases while allowing everyday play.' },
  { id: 'custom', icon: Settings, tag: 'Teacher-defined', text: 'Start from Standard and add your own blocked and allowed words.' },
];

type Subtype = { id: string; name: string; description: string };
type Preset = { id: string; name: string; description: string; subtypes: Subtype[] };
type Theme = { id: string; name: string; examples: string[]; recommended?: boolean };
type Catalog = { activities: Preset[]; themes: Theme[]; languages: string[] };

type Form = {
  activityType: string | null; // mode preset
  activitySubtype: string | null; // mode
  theme: string | null;
  customTheme: string;
  safetyLevel: string;
  blockedWords: string[];
  allowedWords: string[];
  languages: string[];
};

const FREE_EXPRESSION = 'Free Expression';

export default function SessionSetup() {
  const live = useLive();
  const t = useT();
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [at, setAt] = useState<StepId>('preset');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState<Form>({
    activityType: null,
    activitySubtype: null,
    // Free Expression is chosen until the teacher picks a theme.
    theme: FREE_EXPRESSION,
    customTheme: '',
    safetyLevel: 'standard',
    blockedWords: [],
    allowedWords: [],
    languages: ['English', 'Filipino'],
  });
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api<Catalog>('/api/catalog')
      .then(setCatalog)
      .catch((e: Error) => setError(e.message));
  }, []);

  const steps = stepsFor(form.activityType);
  const index = Math.max(0, steps.indexOf(at));
  const preset = catalog?.activities.find((a) => a.id === form.activityType);
  const mode = preset?.subtypes.find((s) => s.id === form.activitySubtype);
  const theme = form.theme === 'custom' ? form.customTheme.trim() : form.theme;
  const canContinue = { preset: !!preset, mode: !!mode, theme: !!theme, safety: form.languages.length > 0, start: true }[at];

  const choosePreset = (p: Preset) => {
    // Color & Create has one output, chosen here; Trace & Learn picks it in the next step.
    const keep = form.activityType === p.id ? form.activitySubtype : null;
    set({ activityType: p.id, activitySubtype: p.subtypes.length === 1 ? p.subtypes[0].id : keep });
  };
  const go = (step: StepId) => {
    // The theme step always opens with a theme chosen: Free Expression by default.
    if (step === 'theme' && !form.theme) set({ theme: FREE_EXPRESSION });
    setAt(step);
  };

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await api('/api/sessions', {
        method: 'POST',
        body: {
          activityType: form.activityType,
          activitySubtype: form.activitySubtype,
          theme,
          safetyLevel: form.safetyLevel,
          languages: form.languages,
          blockedWords: form.safetyLevel === 'custom' ? form.blockedWords : [],
          allowedWords: form.safetyLevel === 'custom' ? form.allowedWords : [],
        },
      });
      toast.success(t('Session started.'));
      router.push('/teacher/dashboard');
    } catch (err) {
      setError(t.error((err as Error).message));
      setStarting(false);
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
      <div className="min-w-0">
        <PageTitle title={t('Session Setup')} lead={t('Choose an activity, theme and safety, then start.')} small>
          <span className="shrink-0 rounded-full border border-border bg-accent px-2.5 py-1 text-xs font-bold text-primary">
            {t('Step {n} of {total}', { n: index + 1, total: steps.length })}
          </span>
        </PageTitle>

        <ol className="mt-3.5 mb-4 flex list-none rounded-xl bg-accent p-1" aria-label={t('Steps')}>
          {steps.map((s, i) => (
            <li key={s} className={cn('min-w-0', i === index ? 'flex-[1.6] sm:flex-1' : 'flex-1')}>
              <button
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-[9px] border-0 bg-transparent px-1.5 py-2 text-[13px] font-semibold text-muted-foreground disabled:cursor-default sm:px-1',
                  i === index && 'bg-white text-primary shadow-sm',
                  i < index && 'text-muted-foreground'
                )}
                onClick={() => i < index && go(s)}
                disabled={i > index}
                aria-current={i === index ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'grid size-[18px] shrink-0 place-items-center rounded-full bg-input text-[11px] font-bold text-muted-foreground',
                    i === index && 'bg-primary text-white',
                    i < index && 'bg-[#22c55e] text-white'
                  )}
                >
                  {i < index ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn('truncate', i !== index && 'hidden sm:inline')}>{t(STEP_NAMES[s])}</span>
              </button>
            </li>
          ))}
        </ol>

        {at === 'preset' && (
          <Section title={t('Choose an Activity')} lead={t('Choose how children will use the kiosk.')}>
            <div className="grid gap-3">
              {catalog?.activities.map((p) => {
                const { icon: Icon, tone } = PRESET_LOOK[p.id] ?? { icon: Layers, tone: 'gray' as const };
                const selected = p.id === form.activityType;
                return (
                  <Option key={p.id} selected={selected} onClick={() => choosePreset(p)}>
                    <Tint tone={tone} size="lg">
                      <Icon />
                    </Tint>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[15px] text-foreground">{t(p.name)}</b>
                      <small className="text-[13px] text-muted-foreground">
                        {t(p.description)}
                        {p.subtypes.length > 1 && <> · {t('{n} modes', { n: p.subtypes.length })}</>}
                      </small>
                    </span>
                    <Radio on={selected} />
                  </Option>
                );
              })}
            </div>
          </Section>
        )}

        {at === 'mode' && preset && (
          <Section title={t('Select Mode')} lead={t('Choose what {preset} prints.', { preset: t(preset.name) })}>
            <div className="grid gap-3 md:grid-cols-2">
              {preset.subtypes.map((s) => {
                const { icon: Icon, tone } = MODE_LOOK[s.id] ?? { icon: Layers, tone: 'gray' as const };
                const selected = s.id === form.activitySubtype;
                return (
                  <Option key={s.id} selected={selected} onClick={() => set({ activitySubtype: s.id })}>
                    <Tint tone={tone} size="lg">
                      <Icon />
                    </Tint>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[15px] text-foreground">{t(s.name)}</b>
                      <small className="text-[13px] text-muted-foreground">{t(s.description)}</small>
                    </span>
                    <Radio on={selected} />
                  </Option>
                );
              })}
            </div>
          </Section>
        )}

        {at === 'theme' && (
          <Section title={t('Select Theme')} lead={t('Pick the learning topic. It is pushed to the kiosk when you start.')}>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5 rounded-2xl border bg-card p-2.5 md:grid-cols-3">
              {catalog?.themes.map((th) => {
                const { icon: Icon, tone } = THEME_LOOK[th.id] ?? { icon: Layers, tone: 'gray' as const };
                const selected = form.theme === th.name;
                return (
                  <button
                    key={th.id}
                    aria-pressed={selected}
                    className={cn(
                      'relative flex min-w-0 flex-col gap-2.5 rounded-xl border bg-white p-3 text-left',
                      // The recommended theme keeps its accent and badge even when another is chosen.
                      th.recommended && 'min-[420px]:col-span-2 border-primary/40 bg-accent/50 ring-4 ring-primary/10 md:col-span-3',
                      selected && 'border-2 border-primary p-[11px]'
                    )}
                    onClick={() => set({ theme: th.name })}
                  >
                    {th.recommended && (
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                        <Sparkles size={11} /> {t('Recommended')}
                      </span>
                    )}
                    <span className={cn('flex min-w-0 items-center gap-2 text-sm font-bold break-words text-foreground', th.recommended && 'pr-24')}>
                      <Tint tone={tone} size="sm">
                        <Icon />
                      </Tint>
                      {t(th.name)}
                    </span>
                    {th.recommended ? (
                      <small className="text-[12px] text-muted-foreground">{t('No theme: children can ask for anything. The safety checks still apply.')}</small>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {th.examples.map((e) => (
                          <em key={e} className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground not-italic">
                            {t(e)}
                          </em>
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className={cn('flex min-w-0 flex-col gap-2.5 rounded-xl border-[1.5px] border-dashed border-input bg-background p-3', form.theme === 'custom' && 'border-2 border-solid border-primary')}>
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Tint tone="green" size="sm">
                    <Plus />
                  </Tint>
                  {t('Custom Theme')}
                </span>
                <Input
                  value={form.customTheme}
                  onChange={(e) => set({ customTheme: e.target.value, theme: 'custom' })}
                  onFocus={() => set({ theme: 'custom' })}
                  placeholder={t('e.g. My Family')}
                  maxLength={40}
                  aria-label={t('Custom Theme')}
                  className="h-9 text-[13px]"
                />
              </div>
            </div>
          </Section>
        )}

        {at === 'safety' && (
          <Section title={t('Select Safety')} lead={t('Child Safe Mode decides what the kiosk will accept.')}>
            <div className="grid gap-3 rounded-t-2xl border border-b-0 bg-card p-3.5 md:grid-cols-3">
              {SAFETY_LEVELS.map(({ id, icon: Icon, tag, text }) => {
                const selected = form.safetyLevel === id;
                return (
                  <button
                    key={id}
                    className={cn('relative flex flex-col items-start gap-1 rounded-xl border bg-white p-[18px] text-left text-muted-foreground', selected && 'border-2 border-primary p-[17px] text-foreground')}
                    onClick={() => set({ safetyLevel: id })}
                  >
                    <i className={cn('mb-2 grid size-10 place-items-center rounded-[10px] bg-accent text-muted-foreground not-italic', selected && 'bg-primary text-white')}>
                      <Icon size={20} />
                    </i>
                    <b className={cn('text-[17px] tracking-[0.04em] text-muted-foreground', selected && 'text-primary')}>{t(SAFETY_NAMES[id])}</b>
                    <em className="text-[11px] font-bold tracking-[0.06em] text-primary uppercase not-italic">{t(tag)}</em>
                    <small className="text-[13px] leading-snug">{t(text)}</small>
                    {selected && (
                      <span className="absolute top-3 right-3 grid size-[22px] place-items-center rounded-full bg-primary text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-b-2xl border border-t-border bg-card px-3.5 pt-4 pb-[18px]">
              <p className="mb-2.5 text-[13px] text-muted-foreground">
                <b className="mr-2 text-[15px] text-primary">{t('Optional')}</b> {t('Fine-tune the rules')}
              </p>
              {form.safetyLevel === 'custom' ? (
                <div className="grid gap-x-6 md:grid-cols-2">
                  <WordList label={t('Custom Blocked Words')} hint={t('Always rejected')} words={form.blockedWords} onChange={(w) => set({ blockedWords: w })} />
                  <WordList label={t('Custom Allowed Words')} hint={t('Always accepted')} words={form.allowedWords} onChange={(w) => set({ allowedWords: w })} />
                </div>
              ) : (
                <p className="my-1 text-[13px] text-muted-foreground">{t('Choose CUSTOM to add your own blocked and allowed words.')}</p>
              )}
              <p className="mt-3.5 text-sm font-bold text-foreground">{t('Language Restrictions')}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">{t('Languages the kiosk will listen for')}</p>
              <div className="flex flex-wrap gap-2">
                {(catalog?.languages ?? ['English', 'Filipino', 'Taglish']).map((l) => {
                  const on = form.languages.includes(l);
                  return (
                    <button
                      key={l}
                      aria-pressed={on}
                      onClick={() => set({ languages: on ? form.languages.filter((x) => x !== l) : [...form.languages, l] })}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border border-input bg-white px-3.5 py-[7px] text-sm font-semibold text-muted-foreground',
                        on && 'border-primary/40 bg-accent text-primary'
                      )}
                    >
                      {on && <Check size={14} strokeWidth={3} />} {t(l)}
                    </button>
                  );
                })}
              </div>
              {form.languages.length === 0 && <ErrorText>{t('Choose at least one language.')}</ErrorText>}
            </div>
          </Section>
        )}

        {at === 'start' && (
          <Section title={t('Start Session')} lead={t('Review what will be sent to the kiosk.')}>
            <div className="grid gap-3 rounded-2xl border bg-card p-4">
              <Review icon={<Palette />} tone="blue" label={t('Mode Preset')} value={t(preset?.name ?? '')} onEdit={() => go('preset')} />
              {steps.includes('mode') && <Review icon={<Type />} tone="purple" label={t('Mode')} value={t(mode?.name ?? '')} onEdit={() => go('mode')} />}
              <Review icon={<Smile />} tone="gray" label={t('Theme')} value={themeName(theme, t)} onEdit={() => go('theme')} />
              <Review icon={<ShieldCheck />} tone="navy" label={t('Safety Rules')} value={t(SAFETY_NAMES[form.safetyLevel])} onEdit={() => go('safety')} />
            </div>
            {!live?.kioskOnline && <Warn>{t('The kiosk is offline. You can start now; children can use it once the kiosk screen is on.')}</Warn>}
            {live?.session && <Warn>{t('Starting will end the current session ({theme}).', { theme: themeName(live.session.theme, t) })}</Warn>}
          </Section>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="sticky bottom-0 z-[5] -mx-3.5 mt-4 flex justify-between gap-3 border-t bg-white/95 px-3.5 py-3.5 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-xl lg:border lg:px-4">
          <Button variant="outline" onClick={() => go(steps[index - 1])} disabled={index === 0}>
            <ArrowLeft /> {t('Back')}
          </Button>
          {at !== 'start' ? (
            <Button onClick={() => go(steps[index + 1])} disabled={!canContinue}>
              {at === 'safety' ? t('Save Settings') : t('Continue')} <ArrowRight />
            </Button>
          ) : (
            <Button className="bg-primary hover:bg-primary/90" onClick={start} disabled={starting}>
              <Play fill="currentColor" /> {starting ? t('Starting…') : t('Start Session')}
            </Button>
          )}
        </div>
      </div>

      <Summary
        preset={preset ? t(MODE_NAMES[preset.id] ?? preset.name) : null}
        mode={steps.includes('mode') && mode ? t(mode.name) : null}
        theme={themeName(theme, t)}
        safety={t(SAFETY_NAMES[form.safetyLevel])}
        languages={form.languages.map((l) => t(l))}
        kioskName={live?.kioskName}
        kioskOnline={live?.kioskOnline}
      />
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="m-0 text-base font-bold text-foreground">{title}</h2>
      <p className="mt-0.5 mb-3.5 text-[13px] text-muted-foreground">{lead}</p>
      {children}
    </section>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={selected}
      className={cn('flex w-full items-center gap-3.5 rounded-[14px] border bg-card p-3.5 text-left shadow-card', selected && 'border-2 border-primary bg-accent/50 p-[13px]')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <em className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-input text-primary not-italic', on && 'border-primary')}>
      {on && <Check size={14} strokeWidth={3} />}
    </em>
  );
}

function WordList({ label, hint, words, onChange }: { label: string; hint: string; words: string[]; onChange: (w: string[]) => void }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const add = () => {
    const w = draft.trim().toLowerCase();
    if (w && !words.includes(w)) onChange([...words, w]);
    setDraft('');
  };
  return (
    <div>
      <p className="mt-3.5 text-sm font-bold text-foreground">{label}</p>
      <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
      <div className="flex overflow-hidden rounded-lg border border-input">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('Type a word, press Enter')}
          aria-label={label}
          maxLength={30}
          className="min-w-0 flex-1 border-0 px-3 py-2.5 text-sm outline-0"
        />
        <button onClick={add} aria-label={t('Add to {list}', { list: label })} className="grid w-11 place-items-center border-0 bg-primary text-white">
          <Plus size={18} />
        </button>
      </div>
      {words.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1.5 pl-2.5 text-[13px]">
              {w}
              <button onClick={() => onChange(words.filter((x) => x !== w))} aria-label={t('Remove {word}', { word: w })} className="grid border-0 bg-transparent p-0.5 text-muted-foreground">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Review({ icon, tone, label, value, onEdit }: { icon: React.ReactNode; tone: TintName; label: string; value: string; onEdit: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3.5 rounded-xl border bg-background p-3.5">
      <Tint tone={tone} size="lg">
        {icon}
      </Tint>
      <span className="min-w-0 flex-1">
        <small className="block text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{label}</small>
        <b className="block text-[15px] text-foreground">{value}</b>
      </span>
      <button className="border-0 bg-transparent p-0 text-[13px] font-bold text-primary" onClick={onEdit}>
        {t('Edit')}
      </button>
    </div>
  );
}

type SummaryProps = {
  preset: string | null;
  mode: string | null;
  theme: string;
  safety: string;
  languages: string[];
  kioskName?: string;
  kioskOnline?: boolean;
};

function Summary({ preset, mode, theme, safety, languages, kioskName, kioskOnline }: SummaryProps) {
  const t = useT();
  const rows: [LucideIcon, string, React.ReactNode][] = [
    [Palette, t('Activity'), preset ? <>{preset}{mode && <> - <small className="text-xs font-semibold">{mode}</small></>}</> : t('Not selected')],
    [Layers, t('Theme'), theme || t('Not selected')],
    [ShieldCheck, t('Safety Rules'), safety],
    [Globe, t('Languages'), languages.length ? languages.join(', ') : t('None')],
  ];
  return (
    <Panel className="mt-2 self-start p-[18px] lg:sticky lg:top-24 lg:mt-0">
      <h2 className="m-0 text-[19px] font-extrabold text-foreground">{t('Session Summary')}</h2>
      <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">{t('Sent to kiosk on start')}</p>
      <dl className="m-0">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="border-t border-border py-3">
            <dt className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
              <Icon size={16} className="text-primary" /> {label}
            </dt>
            <dd className="mt-1 ml-[26px] text-[15px] font-bold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className={cn('mt-1.5 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px]', kioskOnline ? 'bg-[#e3f4ec] text-[#0f8a5f]' : 'bg-danger-bg text-danger')}>
        <i className="size-[7px] rounded-full bg-current" />
        {kioskOnline ? t('{name} kiosk is online', { name: kioskName ?? t('Kiosk') }) : t('{name} kiosk is offline', { name: kioskName ?? t('Kiosk') })}
      </p>
    </Panel>
  );
}
