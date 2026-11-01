'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, Cloud, Globe, Heart, Layers, Lock, Paintbrush, Palette, Pencil, Play, Plus, Settings, Shapes, ShieldCheck,
  Smile, Sparkles, Stethoscope, X, Zap, type LucideIcon,
} from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { ACTIVITY_NAMES, SAFETY_NAMES, themeName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useLive } from '@/components/teacher/auth';
import { ErrorText, PageTitle, Panel, Tint, Warn, type TintName } from '@/components/teacher/ui';

const STEPS = ['Activity', 'Theme', 'Safety', 'Start'];

const ACTIVITY_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
  color_create: { icon: Palette, tone: 'blue' },
  trace_learn: { icon: Pencil, tone: 'purple' },
  free_play: { icon: Sparkles, tone: 'green' },
};

const THEME_LOOK: Record<string, { icon: LucideIcon; tone: TintName }> = {
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
type Activity = { id: string; name: string; description: string; subtypes: Subtype[] };
type Catalog = { activities: Activity[]; themes: { id: string; name: string; examples: string[] }[]; languages: string[] };

type Form = {
  activityType: string | null;
  activitySubtype: string | null;
  theme: string | null;
  customTheme: string;
  safetyLevel: string;
  blockedWords: string[];
  allowedWords: string[];
  languages: string[];
};

export default function SessionSetup() {
  const live = useLive();
  const t = useT();
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState(0);
  const [picking, setPicking] = useState<Activity | null>(null); // activity whose sub-types are open
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState<Form>({
    activityType: null,
    activitySubtype: null,
    theme: null,
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

  const activity = catalog?.activities.find((a) => a.id === form.activityType);
  const subtype = activity?.subtypes.find((s) => s.id === form.activitySubtype);
  const theme = form.theme === 'custom' ? form.customTheme.trim() : form.theme;
  const canContinue = [!!subtype, !!theme, form.languages.length > 0, true][step];

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
        <PageTitle title={t('Session Setup')} lead={t('Choose activity, theme and safety, then start.')} small>
          <span className="shrink-0 rounded-full border border-[#c8dcff] bg-[#eaf2ff] px-2.5 py-1 text-xs font-bold text-blue-700">{t('Step {n} of 4', { n: step + 1 })}</span>
        </PageTitle>

        <ol className="mt-3.5 mb-4 flex list-none rounded-xl bg-[#e9eef5] p-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-[9px] border-0 bg-transparent px-1 py-2 text-[13px] font-semibold text-slate-500 disabled:cursor-default',
                  i === step && 'bg-white text-blue-accent shadow-sm',
                  i < step && 'text-slate-600'
                )}
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
              >
                <span
                  className={cn(
                    'grid size-[18px] place-items-center rounded-full bg-[#d8dee8] text-[11px] font-bold text-slate-600',
                    i === step && 'bg-blue-accent text-white',
                    i < step && 'bg-[#22c55e] text-white'
                  )}
                >
                  {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                {t(s)}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Section title={t('Activity Setup')} lead={t('Choose how children will use the kiosk.')}>
            <div className="grid gap-3">
              {catalog?.activities.map((a) => {
                const { icon: Icon, tone } = ACTIVITY_LOOK[a.id];
                const selected = a.id === form.activityType;
                return (
                  <Option key={a.id} selected={selected} onClick={() => setPicking(a)}>
                    <Tint tone={tone} size="lg">
                      <Icon />
                    </Tint>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[15px] text-foreground">{t(a.name)}</b>
                      <small className="text-[13px] text-muted-foreground">{selected && subtype ? t(subtype.name) : t(a.description)}</small>
                    </span>
                    <Radio on={selected} />
                  </Option>
                );
              })}
            </div>
            {activity && (
              <button className="mt-3.5 border-0 bg-transparent p-0 text-[13px] font-bold text-blue-700" onClick={() => setPicking(activity)}>
                {t('Change activity type')}
              </button>
            )}
          </Section>
        )}

        {step === 1 && (
          <Section title={t('Theme Setup')} lead={t('Pick the learning topic. It is pushed to the kiosk when you start.')}>
            <div className="grid grid-cols-2 gap-2.5 rounded-2xl border bg-card p-2.5 md:grid-cols-3">
              {catalog?.themes.map((th) => {
                const { icon: Icon, tone } = THEME_LOOK[th.id] ?? { icon: Layers, tone: 'gray' as const };
                const selected = form.theme === th.name;
                return (
                  <button
                    key={th.id}
                    className={cn('flex min-w-0 flex-col gap-2.5 rounded-xl border bg-white p-3 text-left', selected && 'border-2 border-blue-accent p-[11px]')}
                    onClick={() => set({ theme: th.name })}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-bold break-words text-foreground">
                      <Tint tone={tone} size="sm">
                        <Icon />
                      </Tint>
                      {t(th.name)}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {th.examples.map((e) => (
                        <em key={e} className="rounded-md border px-2 py-0.5 text-[11px] text-slate-500 not-italic">
                          {t(e)}
                        </em>
                      ))}
                    </span>
                  </button>
                );
              })}
              <div className={cn('flex min-w-0 flex-col gap-2.5 rounded-xl border-[1.5px] border-dashed border-[#b6c0cf] bg-[#fafbfd] p-3', form.theme === 'custom' && 'border-2 border-solid border-blue-accent')}>
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

        {step === 2 && (
          <Section title={t('Safety Setup')} lead={t('Child Safe Mode decides what the kiosk will accept.')}>
            <div className="grid gap-3 rounded-t-2xl border border-b-0 bg-card p-3.5 md:grid-cols-3">
              {SAFETY_LEVELS.map(({ id, icon: Icon, tag, text }) => {
                const selected = form.safetyLevel === id;
                return (
                  <button
                    key={id}
                    className={cn('relative flex flex-col items-start gap-1 rounded-xl border bg-white p-[18px] text-left text-slate-500', selected && 'border-2 border-brand-700 p-[17px] text-slate-700')}
                    onClick={() => set({ safetyLevel: id })}
                  >
                    <i className={cn('mb-2 grid size-10 place-items-center rounded-[10px] bg-[#eef3f9] text-[#7b8ba0] not-italic', selected && 'bg-brand-700 text-white')}>
                      <Icon size={20} />
                    </i>
                    <b className={cn('text-[17px] tracking-[0.04em] text-[#6b7a8f]', selected && 'text-brand-700')}>{t(SAFETY_NAMES[id])}</b>
                    <em className="text-[11px] font-bold tracking-[0.06em] text-[#3b82c4] uppercase not-italic">{t(tag)}</em>
                    <small className="text-[13px] leading-snug">{t(text)}</small>
                    {selected && (
                      <span className="absolute top-3 right-3 grid size-[22px] place-items-center rounded-full bg-brand-700 text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-b-2xl border border-t-[#eef1f5] bg-card px-3.5 pt-4 pb-[18px]">
              <p className="mb-2.5 text-[13px] text-muted-foreground">
                <b className="mr-2 text-[15px] text-brand-700">{t('Optional')}</b> {t('Fine-tune the rules')}
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
                        'inline-flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-3.5 py-[7px] text-sm font-semibold text-slate-600',
                        on && 'border-[#9cc0f5] bg-[#eaf2ff] text-blue-700'
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

        {step === 3 && (
          <Section title={t('Start Session')} lead={t('Review what will be sent to the kiosk.')}>
            <div className="grid gap-3 rounded-2xl border bg-card p-4">
              <Review icon={<Palette />} tone="blue" label={t('Activity Type')} value={`${t(activity?.name ?? '')} - ${t(subtype?.name ?? '')}`} onEdit={() => setStep(0)} />
              <Review icon={<Smile />} tone="gray" label={t('Theme')} value={themeName(theme, t)} onEdit={() => setStep(1)} />
              <Review icon={<ShieldCheck />} tone="navy" label={t('Safety Rules')} value={t(SAFETY_NAMES[form.safetyLevel])} onEdit={() => setStep(2)} />
            </div>
            {!live?.kioskOnline && <Warn>{t('The kiosk is offline. You can start now; children can use it once the kiosk screen is on.')}</Warn>}
            {live?.session && <Warn>{t('Starting will end the current session ({theme}).', { theme: themeName(live.session.theme, t) })}</Warn>}
          </Section>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="sticky bottom-0 z-[5] -mx-4 mt-4 flex justify-between gap-3 border-t bg-white/95 px-4 py-3.5 backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft /> {t('Back')}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              {step === 2 ? t('Save Settings') : t('Continue')} <ArrowRight />
            </Button>
          ) : (
            <Button className="bg-brand-700 hover:bg-brand-700/90" onClick={start} disabled={starting}>
              <Play fill="currentColor" /> {starting ? t('Starting…') : t('Start Session')}
            </Button>
          )}
        </div>
      </div>

      <Summary
        activity={activity && subtype ? [t(ACTIVITY_NAMES[activity.id]), t(subtype.name)] : null}
        theme={themeName(theme, t)}
        safety={t(SAFETY_NAMES[form.safetyLevel])}
        languages={form.languages.map((l) => t(l))}
        kioskName={live?.kioskName}
        kioskOnline={live?.kioskOnline}
      />

      <Dialog open={!!picking} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent className="sm:max-w-lg">
          {picking && (
            <>
              <DialogHeader className="flex-row items-center gap-3 text-left">
                <Tint tone={ACTIVITY_LOOK[picking.id].tone} size="lg">
                  {(() => {
                    const Icon = ACTIVITY_LOOK[picking.id].icon;
                    return <Icon />;
                  })()}
                </Tint>
                <div>
                  <DialogTitle>{t(picking.name)}</DialogTitle>
                  <DialogDescription>{t('Select Activity')}</DialogDescription>
                </div>
              </DialogHeader>
              <div className="grid gap-2.5">
                {picking.subtypes.map((s) => {
                  const selected = form.activityType === picking.id && form.activitySubtype === s.id;
                  return (
                    <Option
                      key={s.id}
                      selected={selected}
                      flat
                      onClick={() => {
                        set({ activityType: picking.id, activitySubtype: s.id });
                        setPicking(null);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block text-[15px] text-foreground">{t(s.name)}</b>
                        <small className="text-[13px] text-muted-foreground">{t(s.description)}</small>
                      </span>
                      <Radio on={selected} />
                    </Option>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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

function Option({ selected, onClick, children, flat }: { selected: boolean; onClick: () => void; children: React.ReactNode; flat?: boolean }) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-3.5 rounded-[14px] border bg-card p-3.5 text-left',
        !flat && 'shadow-card',
        selected && 'border-2 border-blue-accent bg-[#f6f9ff] p-[13px]'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <em className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-[#b6c0cf] text-blue-accent not-italic', on && 'border-blue-accent')}>
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
      <div className="flex overflow-hidden rounded-lg border border-[#cbd5e1]">
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
        <button onClick={add} aria-label={t('Add to {list}', { list: label })} className="grid w-11 place-items-center border-0 bg-brand-700 text-white">
          <Plus size={18} />
        </button>
      </div>
      {words.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded-full bg-[#eef3f9] py-1 pr-1.5 pl-2.5 text-[13px]">
              {w}
              <button onClick={() => onChange(words.filter((x) => x !== w))} aria-label={t('Remove {word}', { word: w })} className="grid border-0 bg-transparent p-0.5 text-slate-500">
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
    <div className="flex items-center gap-3.5 rounded-xl border bg-[#fafbfd] p-3.5">
      <Tint tone={tone} size="lg">
        {icon}
      </Tint>
      <span className="min-w-0 flex-1">
        <small className="block text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{label}</small>
        <b className="block text-[15px] text-foreground">{value}</b>
      </span>
      <button className="border-0 bg-transparent p-0 text-[13px] font-bold text-blue-700" onClick={onEdit}>
        {t('Edit')}
      </button>
    </div>
  );
}

type SummaryProps = { activity: [string, string] | null; theme: string; safety: string; languages: string[]; kioskName?: string; kioskOnline?: boolean };

function Summary({ activity, theme, safety, languages, kioskName, kioskOnline }: SummaryProps) {
  const t = useT();
  const rows: [LucideIcon, string, React.ReactNode][] = [
    [Palette, t('Activity Type'), activity ? <>{activity[0]} - <small className="text-xs font-semibold">{activity[1]}</small></> : t('Not selected')],
    [Layers, t('Theme'), theme || t('Not selected')],
    [ShieldCheck, t('Safety Rules'), safety],
    [Globe, t('Languages'), languages.length ? languages.join(', ') : t('None')],
  ];
  return (
    <Panel className="mt-2 self-start p-[18px] lg:sticky lg:top-24 lg:mt-0">
      <h2 className="m-0 text-[19px] font-bold text-[#0a5b8a]">{t('Session Summary')}</h2>
      <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">{t('Sent to kiosk on start')}</p>
      <dl className="m-0">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="border-t border-[#eef1f5] py-3">
            <dt className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
              <Icon size={16} className="text-[#3b82c4]" /> {label}
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
