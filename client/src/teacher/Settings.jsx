import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Globe, Info, KeyRound, LogOut, Moon, Palette, ShieldCheck, Volume2, VolumeX } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'

// Teacher App accent colors; the first is the WishPix default.
const THEMES = [
  ['deep_blue', 'Deep blue', '#0a84c6'],
  ['teal', 'Teal', '#0d9488'],
  ['purple', 'Purple', '#7c3aed'],
  ['green', 'Green', '#16a34a'],
  ['orange', 'Orange', '#ea580c'],
]
const SLEEP_MINUTES = [5, 10, 15, 30, 60]
const LOGOUT_MINUTES = [15, 30, 60, 120]

export default function Settings() {
  const { call, teacher, signOut } = useAuth()
  const t = useT()
  const [settings, setSettings] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => { call('/api/settings').then((r) => setSettings(r.settings)).catch((e) => setNotice(t.error(e.message))) }, [call, t])

  // Saves one change right away; the whole app follows through the live state.
  const save = useCallback(async (patch, message) => {
    setSettings((s) => ({ ...s, ...patch }))
    try {
      const r = await call('/api/settings', { method: 'PATCH', body: patch })
      setSettings(r.settings)
      setNotice(message)
    } catch (err) {
      setNotice(t.error(err.message))
    }
  }, [call, t])

  if (!settings) return <p className="t-muted">{t('Loading…')}</p>

  return (
    <div className="t-settings">
      <h1 className="t-h1 t-h1--sm">{t('Settings')}</h1>
      <p className="t-lead">{t('Changes are saved right away.')}</p>

      <Section icon={<Globe size={18} />} title={t('Language')} text={t('Used by the Teacher App, the kiosk screen and the children’s phones.')}>
        <div className="t-chips" role="radiogroup" aria-label={t('Language')}>
          {[['en', 'English'], ['fil', 'Filipino']].map(([id, label]) => (
            <button key={id} role="radio" aria-checked={settings.language === id} className={settings.language === id ? 'is-on' : ''} onClick={() => save({ language: id }, id === 'fil' ? 'Naka-Filipino na.' : 'Now in English.')}>
              {settings.language === id && <Check size={14} strokeWidth={3} />} {label}
            </button>
          ))}
        </div>
      </Section>

      <Section icon={<Palette size={18} />} title={t('Theme color')} text={t('The main color of the Teacher App.')}>
        <div className="t-swatches" role="radiogroup" aria-label={t('Theme color')}>
          {THEMES.map(([id, label, color]) => (
            <button key={id} role="radio" aria-checked={settings.theme_color === id} className={settings.theme_color === id ? 'is-on' : ''} onClick={() => save({ theme_color: id }, t('Theme color saved.'))}>
              <i style={{ background: color }}>{settings.theme_color === id && <Check size={16} strokeWidth={3} />}</i>
              {t(label)}
            </button>
          ))}
        </div>
      </Section>

      <Section icon={<Volume2 size={18} />} title={t('Kiosk sounds')} text={t('Small chimes when a child talks, a picture is ready and a page prints.')}>
        <Volume value={settings.volume} onSave={(v) => save({ volume: v }, t('Volume saved.'))} />
        <button className="t-btn t-btn--ghost t-btn--sm" onClick={() => call('/api/settings/test-sound', { method: 'POST' }).then(() => setNotice(t('Playing a test sound on the kiosk.'))).catch((e) => setNotice(t.error(e.message)))}>
          <Volume2 size={14} /> {t('Test sound')}
        </button>
        <p className="t-field-hint">{t('The kiosk screen must be touched once after it opens before the browser lets it play sounds.')}</p>
      </Section>

      <Section icon={<Moon size={18} />} title={t('Kiosk auto-sleep')} text={t('Rests the kiosk screen when nobody is using it.')}>
        <Toggle label={t('Sleep when not in use')} on={settings.auto_sleep} onChange={(on) => save({ auto_sleep: on }, on ? t('Auto-sleep is on.') : t('Auto-sleep is off.'))} />
        {settings.auto_sleep && (
          <MinuteChoice label={t('Sleep after')} value={settings.auto_sleep_minutes} options={SLEEP_MINUTES} onChange={(m) => save({ auto_sleep_minutes: m }, t('Saved.'))} />
        )}
      </Section>

      <Section icon={<ShieldCheck size={18} />} title={t('Auto sign-out')} text={t('Signs the teacher out of this device after a time without activity.')}>
        <Toggle label={t('Sign out when not in use')} on={settings.auto_logout} onChange={(on) => save({ auto_logout: on }, on ? t('Auto sign-out is on.') : t('Auto sign-out is off.'))} />
        {settings.auto_logout && (
          <MinuteChoice label={t('Sign out after')} value={settings.auto_logout_minutes} options={LOGOUT_MINUTES} onChange={(m) => save({ auto_logout_minutes: m }, t('Saved.'))} />
        )}
      </Section>

      <Section icon={<KeyRound size={18} />} title={t('Your account')} text={teacher?.username ? t('Signed in as {user}.', { user: teacher.username }) : null}>
        <DisplayName onDone={setNotice} />
        <PasswordForm onDone={setNotice} />
        <button className="t-btn t-btn--ghost t-btn--sm" onClick={signOut}><LogOut size={14} /> {t('Sign out')}</button>
      </Section>

      <Section icon={<Info size={18} />} title={t('About WishPix')}>
        <ul className="t-about">
          <li>{t('Version {v}', { v: '2.4.1' })}</li>
          <li>{t('Everything is saved on this laptop only. Pictures are made by a free online image service.')}</li>
          <li>{t('No child names are ever saved.')}</li>
        </ul>
      </Section>

      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}
    </div>
  )
}

function Section({ icon, title, text, children }) {
  return (
    <section className="t-panel-card t-set">
      <div className="t-set__head">
        <i className="t-tint t-tint--blue">{icon}</i>
        <div><h2>{title}</h2>{text && <p>{text}</p>}</div>
      </div>
      {children}
    </section>
  )
}

function Toggle({ label, on, onChange }) {
  return (
    <button className="t-toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span><i />
    </button>
  )
}

function MinuteChoice({ label, value, options, onChange }) {
  const t = useT()
  return (
    <label className="t-field t-field--row">
      {label}
      <select className="t-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {/* Keep a value set elsewhere visible even if it is not one of the usual choices. */}
        {[...new Set([...options, value])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{t('{n} minutes', { n: m })}</option>)}
      </select>
    </label>
  )
}

// Saves a moment after the slider stops, so dragging doesn't send many requests.
function Volume({ value, onSave }) {
  const t = useT()
  const [local, setLocal] = useState(value)
  const timer = useRef(null)
  const change = (v) => {
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSave(v), 400)
  }
  return (
    <label className="t-slider">
      <span className="t-row__text"><b>{t('Volume')}</b><small>{local === 0 ? t('Off') : `${local}%`}</small></span>
      <span className="t-slider__track">
        <VolumeX size={16} />
        <input type="range" min={0} max={100} step={10} value={local} onChange={(e) => change(Number(e.target.value))} />
        <Volume2 size={18} />
      </span>
    </label>
  )
}

function DisplayName({ onDone }) {
  const { call, teacher, updateTeacher } = useAuth()
  const t = useT()
  const [name, setName] = useState(teacher?.displayName ?? '')
  async function submit(e) {
    e.preventDefault()
    try {
      const r = await call('/api/me', { method: 'PATCH', body: { displayName: name } })
      updateTeacher(r.teacher)
      onDone(t('Name saved.'))
    } catch (err) {
      onDone(t.error(err.message))
    }
  }
  return (
    <form className="t-inline-form" onSubmit={submit}>
      <label className="t-field">{t('Your name')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required /></label>
      <button className="t-btn t-btn--ghost t-btn--sm" disabled={!name.trim() || name.trim() === teacher?.displayName}>{t('Save name')}</button>
    </form>
  )
}

function PasswordForm({ onDone }) {
  const { call } = useAuth()
  const t = useT()
  const [form, setForm] = useState({ current: '', next: '', again: '' })
  const [error, setError] = useState(null)
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(null) }
  async function submit(e) {
    e.preventDefault()
    if (form.next !== form.again) return setError(t('The two new passwords are not the same.'))
    try {
      await call('/api/me/password', { method: 'POST', body: { current: form.current, next: form.next } })
      setForm({ current: '', next: '', again: '' })
      onDone(t('Password changed.'))
    } catch (err) {
      setError(t.error(err.message))
    }
  }
  return (
    <form className="t-password" onSubmit={submit}>
      <p className="t-field-label">{t('Change password')}</p>
      <label className="t-field">{t('Current password')}<input type="password" value={form.current} onChange={(e) => set({ current: e.target.value })} autoComplete="current-password" required /></label>
      <label className="t-field">{t('New password')}<input type="password" value={form.next} onChange={(e) => set({ next: e.target.value })} autoComplete="new-password" minLength={8} required /></label>
      <label className="t-field">{t('New password again')}<input type="password" value={form.again} onChange={(e) => set({ again: e.target.value })} autoComplete="new-password" minLength={8} required /></label>
      <p className="t-field-hint">{t('At least 8 characters.')}</p>
      {error && <p className="t-error" role="alert">{error}</p>}
      <button className="t-btn t-btn--sm" disabled={!form.current || !form.next || !form.again}>{t('Change password')}</button>
    </form>
  )
}
