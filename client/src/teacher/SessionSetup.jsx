import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, Cloud, Globe, Heart, Layers, Lock, Palette, Pencil, Plus, Settings, Shapes,
  ShieldCheck, Smile, Sparkles, Stethoscope, X, Zap, Paintbrush, Play,
} from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { ACTIVITY_NAMES, SAFETY_NAMES, themeName } from './labels.js'

const STEPS = ['Activity', 'Theme', 'Safety', 'Start']

const ACTIVITY_LOOK = {
  color_create: { icon: Palette, tone: 'blue' },
  trace_learn: { icon: Pencil, tone: 'purple' },
  free_play: { icon: Sparkles, tone: 'green' },
}

const THEME_LOOK = {
  animals: { icon: Smile, tone: 'gray' },
  transportation: { icon: Zap, tone: 'orange' },
  fruits: { icon: Heart, tone: 'red' },
  community_helpers: { icon: Stethoscope, tone: 'green' },
  shapes: { icon: Shapes, tone: 'blue' },
  colors: { icon: Paintbrush, tone: 'amber' },
  nature: { icon: Cloud, tone: 'pink' },
}

const SAFETY_LEVELS = [
  { id: 'strict', icon: Lock, tag: 'Maximum filtering', text: 'Only clearly child-friendly requests pass. Best for the youngest groups.' },
  { id: 'standard', icon: ShieldCheck, tag: 'Recommended', text: 'Blocks violence, adult content and unsafe phrases while allowing everyday play.' },
  { id: 'custom', icon: Settings, tag: 'Teacher-defined', text: 'Start from Standard and add your own blocked and allowed words.' },
]

// Saved in English (the kiosk and reports use them); shown with t().
const LANGUAGES = ['English', 'Filipino', 'Taglish']

export default function SessionSetup() {
  const { call, live } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState(null)
  const [step, setStep] = useState(0)
  const [picking, setPicking] = useState(null) // activity whose sub-types are open
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [form, setForm] = useState({
    activityType: null,
    activitySubtype: null,
    theme: null,
    customTheme: '',
    safetyLevel: 'standard',
    blockedWords: [],
    allowedWords: [],
    languages: ['English', 'Filipino'],
  })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => { call('/api/catalog').then(setCatalog).catch((e) => setError(e.message)) }, [call])

  const activity = catalog?.activities.find((a) => a.id === form.activityType)
  const subtype = activity?.subtypes.find((s) => s.id === form.activitySubtype)
  const theme = form.theme === 'custom' ? form.customTheme.trim() : form.theme
  const canContinue = [!!subtype, !!theme, form.languages.length > 0, true][step]

  async function start() {
    setStarting(true)
    setError(null)
    try {
      await call('/api/sessions', {
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
      })
      navigate('/teacher/dashboard')
    } catch (err) {
      setError(t.error(err.message))
      setStarting(false)
    }
  }

  const summary = (
    <Summary
      activity={activity && subtype ? [t(ACTIVITY_NAMES[activity.id]), t(subtype.name)] : null}
      theme={themeName(theme, t)}
      safety={t(SAFETY_NAMES[form.safetyLevel])}
      languages={form.languages.map((l) => t(l))}
      kioskName={live.state?.kioskName}
      kioskOnline={live.state?.kioskOnline}
    />
  )

  return (
    <div className="t-setup">
      <div className="t-setup__head">
        <div>
          <h1 className="t-h1 t-h1--sm">{t('Session Setup')}</h1>
          <p className="t-lead">{t('Choose activity, theme and safety, then start.')}</p>
        </div>
        <span className="t-badge">{t('Step {n} of 4', { n: step + 1 })}</span>
      </div>

      <ol className="t-tabs">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button className={i === step ? 'is-current' : i < step ? 'is-done' : ''} onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span>{i < step ? <Check size={12} strokeWidth={3} /> : i + 1}</span>{t(s)}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="t-panel">
          <h2 className="t-panel__title">{t('Activity Setup')}</h2>
          <p className="t-panel__lead">{t('Choose how children will use the kiosk.')}</p>
          <div className="t-options">
            {catalog?.activities.map((a) => {
              const { icon: Icon, tone } = ACTIVITY_LOOK[a.id]
              const selected = a.id === form.activityType
              return (
                <button key={a.id} className={`t-option ${selected ? 'is-selected' : ''}`} onClick={() => setPicking(a)}>
                  <i className={`t-tint t-tint--${tone} t-tint--lg`}><Icon size={22} /></i>
                  <span>
                    <b>{t(a.name)}</b>
                    <small>{selected && subtype ? t(subtype.name) : t(a.description)}</small>
                  </span>
                  <em className="t-radio">{selected && <Check size={14} strokeWidth={3} />}</em>
                </button>
              )
            })}
          </div>
          {activity && <button className="t-link t-link--strong" onClick={() => setPicking(activity)}>{t('Change activity type')}</button>}
        </section>
      )}

      {step === 1 && (
        <section className="t-panel">
          <h2 className="t-panel__title t-panel__title--blue">{t('Theme Setup')}</h2>
          <p className="t-panel__lead">{t('Pick the learning topic. It is pushed to the kiosk when you start.')}</p>
          <div className="t-themes">
            {catalog?.themes.map((th) => {
              const { icon: Icon, tone } = THEME_LOOK[th.id] ?? { icon: Layers, tone: 'gray' }
              return (
                <button key={th.id} className={`t-theme ${form.theme === th.name ? 'is-selected' : ''}`} onClick={() => set({ theme: th.name })}>
                  <span className="t-theme__name"><i className={`t-tint t-tint--${tone}`}><Icon size={16} /></i>{t(th.name)}</span>
                  <span className="t-theme__tags">{th.examples.map((e) => <em key={e}>{t(e)}</em>)}</span>
                </button>
              )
            })}
            <div className={`t-theme t-theme--custom ${form.theme === 'custom' ? 'is-selected' : ''}`}>
              <span className="t-theme__name"><i className="t-tint t-tint--green"><Plus size={16} /></i>{t('Custom Theme')}</span>
              <input
                value={form.customTheme}
                onChange={(e) => set({ customTheme: e.target.value, theme: 'custom' })}
                onFocus={() => set({ theme: 'custom' })}
                placeholder={t('e.g. My Family')}
                maxLength={40}
                aria-label={t('Custom Theme')}
              />
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="t-panel">
          <h2 className="t-panel__title">{t('Safety Setup')}</h2>
          <p className="t-panel__lead">{t('Child Safe Mode decides what the kiosk will accept.')}</p>
          <div className="t-safety">
            {SAFETY_LEVELS.map(({ id, icon: Icon, tag, text }) => (
              <button key={id} className={`t-level ${form.safetyLevel === id ? 'is-selected' : ''}`} onClick={() => set({ safetyLevel: id })}>
                <i className="t-level__icon"><Icon size={20} /></i>
                <b>{t(SAFETY_NAMES[id])}</b>
                <em>{t(tag)}</em>
                <small>{t(text)}</small>
                {form.safetyLevel === id && <span className="t-level__check"><Check size={12} strokeWidth={3} /></span>}
              </button>
            ))}
          </div>

          <div className="t-finetune">
            <p className="t-finetune__title"><b>{t('Optional')}</b> {t('Fine-tune the rules')}</p>
            {form.safetyLevel === 'custom' ? (
              <>
                <WordList label={t('Custom Blocked Words')} hint={t('Always rejected')} words={form.blockedWords} onChange={(w) => set({ blockedWords: w })} />
                <WordList label={t('Custom Allowed Words')} hint={t('Always accepted')} words={form.allowedWords} onChange={(w) => set({ allowedWords: w })} />
              </>
            ) : (
              <p className="t-muted">{t('Choose CUSTOM to add your own blocked and allowed words.')}</p>
            )}
            <p className="t-field-label">{t('Language Restrictions')}</p>
            <p className="t-field-hint">{t('Languages the kiosk will listen for')}</p>
            <div className="t-langs">
              {LANGUAGES.map((l) => {
                const on = form.languages.includes(l)
                return (
                  <button key={l} className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => set({ languages: on ? form.languages.filter((x) => x !== l) : [...form.languages, l] })}>
                    {on && <Check size={14} strokeWidth={3} />} {t(l)}
                  </button>
                )
              })}
            </div>
            {form.languages.length === 0 && <p className="t-error">{t('Choose at least one language.')}</p>}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="t-panel">
          <h2 className="t-panel__title t-panel__title--blue">{t('Start Session')}</h2>
          <p className="t-panel__lead">{t('Review what will be sent to the kiosk.')}</p>
          <div className="t-review">
            <Review icon={<Palette size={18} />} tone="blue" label={t('Activity Type')} value={`${t(activity?.name)} - ${t(subtype?.name)}`} onEdit={() => setStep(0)} />
            <Review icon={<Smile size={18} />} tone="gray" label={t('Theme')} value={themeName(theme, t)} onEdit={() => setStep(1)} />
            <Review icon={<ShieldCheck size={18} />} tone="navy" label={t('Safety Rules')} value={t(SAFETY_NAMES[form.safetyLevel])} onEdit={() => setStep(2)} />
          </div>
          {!live.state?.kioskOnline && <p className="t-warn">{t('The kiosk is offline. You can start now; children can join once the kiosk screen is open.')}</p>}
          {live.state?.session && <p className="t-warn">{t('Starting will end the current session ({theme}).', { theme: themeName(live.state.session.theme, t) })}</p>}
        </section>
      )}

      {error && <p className="t-error" role="alert">{error}</p>}
      {summary}

      <div className="t-setup__bar">
        <button className="t-btn t-btn--ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft size={16} /> {t('Back')}</button>
        {step < 3 ? (
          <button className="t-btn" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            {step === 2 ? t('Save Settings') : t('Continue')} <ArrowRight size={16} />
          </button>
        ) : (
          <button className="t-btn t-btn--navy" onClick={start} disabled={starting}><Play size={16} fill="currentColor" /> {starting ? t('Starting…') : t('Start Session')}</button>
        )}
      </div>

      {picking && (
        <SubtypePicker
          activity={picking}
          selected={form.activityType === picking.id ? form.activitySubtype : null}
          onPick={(id) => { set({ activityType: picking.id, activitySubtype: id }); setPicking(null) }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

function SubtypePicker({ activity, selected, onPick, onClose }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const { icon: Icon, tone } = ACTIVITY_LOOK[activity.id]
  return (
    <div className="t-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={onClose}>
      <div className="t-modal__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="t-modal__head">
          <i className={`t-tint t-tint--${tone} t-tint--lg`}><Icon size={22} /></i>
          <div>
            <h2 id="picker-title">{t(activity.name)}</h2>
            <p>{t('Select Activity')}</p>
          </div>
          <button className="t-icon-btn" onClick={onClose} aria-label={t('Close')}><X size={20} /></button>
        </div>
        <div className="t-modal__list">
          {activity.subtypes.map((s) => (
            <button key={s.id} className={`t-option t-option--flat ${selected === s.id ? 'is-selected' : ''}`} onClick={() => onPick(s.id)}>
              <span><b>{t(s.name)}</b><small>{t(s.description)}</small></span>
              <em className="t-radio">{selected === s.id && <Check size={14} strokeWidth={3} />}</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function WordList({ label, hint, words, onChange }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const add = () => {
    const w = draft.trim().toLowerCase()
    if (w && !words.includes(w)) onChange([...words, w])
    setDraft('')
  }
  return (
    <div className="t-words">
      <p className="t-field-label">{label}</p>
      <p className="t-field-hint">{hint}</p>
      <div className="t-words__input">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder={t('Type a word, press Enter')} aria-label={label} maxLength={30} />
        <button onClick={add} aria-label={t('Add to {list}', { list: label })}><Plus size={18} /></button>
      </div>
      {words.length > 0 && (
        <div className="t-words__list">
          {words.map((w) => (
            <span key={w}>{w}<button onClick={() => onChange(words.filter((x) => x !== w))} aria-label={t('Remove {word}', { word: w })}><X size={12} /></button></span>
          ))}
        </div>
      )}
    </div>
  )
}

function Review({ icon, tone, label, value, onEdit }) {
  const t = useT()
  return (
    <div className="t-review__row">
      <i className={`t-tint t-tint--${tone} t-tint--lg`}>{icon}</i>
      <span><small>{label}</small><b>{value}</b></span>
      <button className="t-link t-link--strong" onClick={onEdit}>{t('Edit')}</button>
    </div>
  )
}

function Summary({ activity, theme, safety, languages, kioskName, kioskOnline }) {
  const t = useT()
  return (
    <section className="t-summary">
      <h2>{t('Session Summary')}</h2>
      <p className="t-panel__lead">{t('Sent to kiosk on start')}</p>
      <dl>
        <div><dt><Palette size={16} /> {t('Activity Type')}</dt><dd>{activity ? <>{activity[0]} - <small>{activity[1]}</small></> : t('Not selected')}</dd></div>
        <div><dt><Layers size={16} /> {t('Theme')}</dt><dd>{theme || t('Not selected')}</dd></div>
        <div><dt><ShieldCheck size={16} /> {t('Safety Rules')}</dt><dd>{safety}</dd></div>
        <div><dt><Globe size={16} /> {t('Languages')}</dt><dd>{languages.length ? languages.join(', ') : t('None')}</dd></div>
      </dl>
      <p className={`t-summary__kiosk ${kioskOnline ? '' : 'is-off'}`}>
        <i />{kioskOnline ? t('{name} kiosk is online', { name: kioskName ?? t('Kiosk') }) : t('{name} kiosk is offline', { name: kioskName ?? t('Kiosk') })}
      </p>
    </section>
  )
}
