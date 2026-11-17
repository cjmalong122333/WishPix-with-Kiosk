'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Globe, Info, KeyRound, LogOut, Moon, Palette, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import type { PublicTeacher } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/components/teacher/auth';
import { ErrorText, PageTitle, Panel, Tint } from '@/components/teacher/ui';

// Shades of purple for the Teacher App accent (html[data-theme]) and the kiosk
// screen (the --k-* tokens), both in globals.css. The first is the WishPix purple.
const THEMES = [
  ['purple', 'Purple', '#7950d5'],
  ['lavender', 'Lavender', '#7b62c9'],
  ['violet', 'Violet', '#5b2fb0'],
  ['plum', 'Plum', '#8e3a7e'],
  ['grape', 'Grape', '#4b3a9e'],
] as const;
const KIOSK_COLORS = THEMES;
const SLEEP_MINUTES = [5, 10, 15, 30, 60];
const LOGOUT_MINUTES = [15, 30, 60, 120];

type Settings = {
  language: 'en' | 'fil';
  volume: number;
  theme_color: string;
  kiosk_color: string;
  auto_sleep: boolean;
  auto_sleep_minutes: number;
  auto_logout: boolean;
  auto_logout_minutes: number;
};

export default function SettingsPage() {
  const { teacher, signOut } = useAuth();
  const t = useT();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api<{ settings: Settings }>('/api/settings')
      .then((r) => setSettings(r.settings))
      .catch((e: Error) => toast.error(t.error(e.message)));
  }, [t]);

  // Saves one change right away; the whole app follows through the live state.
  const save = useCallback(
    async (patch: Partial<Settings>, message: string) => {
      setSettings((s) => (s ? { ...s, ...patch } : s));
      try {
        const r = await api<{ settings: Settings }>('/api/settings', { method: 'PATCH', body: patch });
        setSettings(r.settings);
        toast.success(message);
      } catch (err) {
        toast.error(t.error((err as Error).message));
      }
    },
    [t]
  );

  if (!settings) return <p className="text-[13px] text-muted-foreground">{t('Loading…')}</p>;

  return (
    <div className="grid gap-4">
      <PageTitle title={t('Settings')} lead={t('Changes are saved right away.')} small />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          icon={<Globe />}
          title={t('Display Language')}
          text={t('Used by the Teacher App, every kiosk screen and the word under Color & Create pictures. Tracing sheets always print in English and Filipino.')}
        >
          <div className="flex gap-2" role="radiogroup" aria-label={t('Display Language')}>
            {(
              [
                ['en', 'English'],
                ['fil', 'Filipino'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.language === id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold',
                  settings.language === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
                )}
                onClick={() => save({ language: id }, id === 'fil' ? 'Naka-Filipino na.' : 'Now in English.')}
              >
                {settings.language === id && <Check size={14} strokeWidth={3} />} {label}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<Palette />} title={t('Theme color')} text={t('The main color of the Teacher App.')}>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={t('Theme color')}>
            {THEMES.map(([id, label, color]) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.theme_color === id}
                className="flex flex-col items-center gap-1 border-0 bg-transparent p-0 text-xs text-muted-foreground"
                onClick={() => save({ theme_color: id }, t('Theme color saved.'))}
              >
                <i
                  className={cn('grid size-10 place-items-center rounded-full text-white ring-offset-2', settings.theme_color === id && 'ring-2 ring-foreground/40')}
                  style={{ background: color }}
                >
                  {settings.theme_color === id && <Check size={16} strokeWidth={3} />}
                </i>
                {t(label)}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<Palette />} title={t('Kiosk color')} text={t('The colors of the kiosk screen. The kiosk changes right away.')}>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={t('Kiosk color')}>
            {KIOSK_COLORS.map(([id, label, color]) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.kiosk_color === id}
                className="flex flex-col items-center gap-1 border-0 bg-transparent p-0 text-xs text-muted-foreground"
                onClick={() => save({ kiosk_color: id }, t('Kiosk color saved.'))}
              >
                <i
                  className={cn('grid size-10 place-items-center rounded-full text-white ring-offset-2', settings.kiosk_color === id && 'ring-2 ring-foreground/40')}
                  style={{ background: color }}
                >
                  {settings.kiosk_color === id && <Check size={16} strokeWidth={3} />}
                </i>
                {t(label)}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<Volume2 />} title={t('Kiosk sounds')} text={t('Small chimes when a child talks, a picture is ready and a page prints.')}>
          <Volume value={settings.volume} onSave={(v) => save({ volume: v }, t('Volume saved.'))} />
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              api<{ played: boolean; reason?: string }>('/api/settings/test-sound', { method: 'POST' })
                .then((r) => {
                  if (r.played) toast.success(t('The kiosk played a test sound.'));
                  else if (r.reason === 'no_kiosk') toast.error(t('The kiosk screen is not open.'));
                  else if (r.reason === 'muted') toast.error(t('The kiosk volume is 0. Turn it up first.'));
                  // A browser plays no sound until someone presses a key on the page (not on the Pi).
                  else toast.error(t('The kiosk screen cannot play sound yet. Press Yes or Talk on the kiosk once, then try again.'));
                })
                .catch((e: Error) => toast.error(t.error(e.message)))
            }
          >
            <Volume2 /> {t('Test sound')}
          </Button>
        </Section>

        <Section icon={<Moon />} title={t('Kiosk auto-sleep')} text={t('Rests the kiosk screen when nobody is using it.')}>
          <Toggle id="auto-sleep" label={t('Sleep when not in use')} on={settings.auto_sleep} onChange={(on) => save({ auto_sleep: on }, on ? t('Auto-sleep is on.') : t('Auto-sleep is off.'))} />
          {settings.auto_sleep && (
            <MinuteChoice label={t('Sleep after')} value={settings.auto_sleep_minutes} options={SLEEP_MINUTES} onChange={(m) => save({ auto_sleep_minutes: m }, t('Saved.'))} />
          )}
        </Section>

        <Section icon={<ShieldCheck />} title={t('Auto sign-out')} text={t('Signs the teacher out of this device after a time without activity.')}>
          <Toggle id="auto-logout" label={t('Sign out when not in use')} on={settings.auto_logout} onChange={(on) => save({ auto_logout: on }, on ? t('Auto sign-out is on.') : t('Auto sign-out is off.'))} />
          {settings.auto_logout && (
            <MinuteChoice label={t('Sign out after')} value={settings.auto_logout_minutes} options={LOGOUT_MINUTES} onChange={(m) => save({ auto_logout_minutes: m }, t('Saved.'))} />
          )}
        </Section>

        <Section icon={<Info />} title={t('About WishPix')}>
          <ul className="m-0 grid list-disc gap-1 pl-5 text-[13px] text-muted-foreground">
            <li>{t('Version {v}', { v: '1.0.0' })}</li>
            <li>{t('Everything is saved on the kiosk only. Pictures are made by an online AI image service.')}</li>
            <li>{t('No child names and no voice recordings are ever saved.')}</li>
          </ul>
        </Section>
      </div>

      <Section icon={<KeyRound />} title={t('Your account')} text={teacher?.username ? t('Signed in as {user}.', { user: teacher.username }) : undefined}>
        <div className="grid gap-6 lg:grid-cols-2">
          <DisplayName />
          <PasswordForm />
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => signOut()}>
          <LogOut /> {t('Sign out')}
        </Button>
      </Section>
    </div>
  );
}

function Section({ icon, title, text, children }: { icon: React.ReactNode; title: string; text?: string; children: React.ReactNode }) {
  return (
    <Panel>
      <div className="mb-3 flex items-start gap-3">
        <Tint tone="blue">{icon}</Tint>
        <div>
          <h2 className="m-0 text-base font-bold">{title}</h2>
          {text && <p className="m-0 text-[13px] text-muted-foreground">{text}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

function Toggle({ id, label, on, onChange }: { id: string; label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Switch id={id} checked={on} onCheckedChange={onChange} />
    </div>
  );
}

function MinuteChoice({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (m: number) => void }) {
  const t = useT();
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="w-36" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* Keep a value set elsewhere visible even if it is not one of the usual choices. */}
          {[...new Set([...options, value])]
            .sort((a, b) => a - b)
            .map((m) => (
              <SelectItem key={m} value={String(m)}>
                {t('{n} minutes', { n: m })}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Saves a moment after the slider stops, so dragging doesn't send many requests.
function Volume({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const t = useT();
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (v: number) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(v), 400);
  };
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <b className="text-sm">{t('Volume')}</b>
        <small className="text-[13px] text-muted-foreground">{local === 0 ? t('Off') : `${local}%`}</small>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <VolumeX size={16} />
        <Slider min={0} max={100} step={10} value={[local]} onValueChange={([v]) => change(v)} aria-label={t('Volume')} />
        <Volume2 size={18} />
      </div>
    </div>
  );
}

function DisplayName() {
  const { teacher, updateTeacher } = useAuth();
  const t = useT();
  const [name, setName] = useState(teacher?.displayName ?? '');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ teacher: PublicTeacher }>('/api/me', { method: 'PATCH', body: { displayName: name } });
      updateTeacher(r.teacher);
      toast.success(t('Name saved.'));
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
  }
  return (
    <form className="grid content-start gap-2" onSubmit={submit}>
      <Label htmlFor="display-name">{t('Your name')}</Label>
      <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      <Button variant="outline" size="sm" className="justify-self-start" disabled={!name.trim() || name.trim() === teacher?.displayName}>
        {t('Save name')}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const t = useT();
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.next !== form.again) return setError(t('The two new passwords are not the same.'));
    try {
      await api('/api/me/password', { method: 'POST', body: { current: form.current, next: form.next } });
      setForm({ current: '', next: '', again: '' });
      toast.success(t('Password changed. Other devices are signed out.'));
    } catch (err) {
      setError(t.error((err as Error).message));
    }
  }
  const fields = [
    ['current', t('Current password'), 'current-password'],
    ['next', t('New password'), 'new-password'],
    ['again', t('New password again'), 'new-password'],
  ] as const;
  return (
    <form className="grid content-start gap-2" onSubmit={submit}>
      <p className="m-0 text-sm font-bold">{t('Change password')}</p>
      {fields.map(([key, label, auto]) => (
        <div key={key} className="grid gap-1">
          <Label htmlFor={`pw-${key}`} className="text-[13px] font-normal text-muted-foreground">
            {label}
          </Label>
          <Input id={`pw-${key}`} type="password" value={form[key]} onChange={(e) => set({ [key]: e.target.value })} autoComplete={auto} minLength={key === 'current' ? undefined : 8} required />
        </div>
      ))}
      <p className="m-0 text-[11px] text-muted-foreground">{t('At least 8 characters.')}</p>
      {error && <ErrorText>{error}</ErrorText>}
      <Button size="sm" className="justify-self-start" disabled={!form.current || !form.next || !form.again}>
        {t('Change password')}
      </Button>
    </form>
  );
}
