import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check, Cpu, Database, ExternalLink, HardDrive, Monitor, Moon, Pencil, Printer, RotateCw, Sun, SunDim, Wifi, X,
} from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { api } from '../lib/live.js'
import { PROBLEM_NAMES } from './labels.js'
import { duration, kioskStatus, useNow, when } from './status.js'

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`

export default function KioskManagement() {
  const { call, live } = useAuth()
  const t = useT()
  const [info, setInfo] = useState(null)
  const [health, setHealth] = useState(null)
  const [notice, setNotice] = useState(null)
  const state = live.state
  const status = kioskStatus(state, t)

  const load = useCallback(() => call('/api/kiosk/info').then(setInfo).catch((e) => setNotice(t.error(e.message))), [call, t])
  const checkHealth = useCallback(() => api('/api/health').then(setHealth).catch(() => setHealth({})), [])
  const now = useNow()
  useEffect(() => { load() }, [load, state?.kioskOnline, state?.kioskName])
  useEffect(() => { checkHealth() }, [checkHealth])

  async function act(path, message, opts = { method: 'POST' }) {
    try {
      await call(path, opts)
      setNotice(message)
      load()
    } catch (err) {
      setNotice(t.error(err.message))
    }
  }

  const sleeping = state?.screen?.sleeping
  const printer = state?.printer
  const printerText = printer?.problem ? t(PROBLEM_NAMES[printer.problem]) : printer?.lowPaper ? t('Paper is low') : printer?.lowInk ? t('Ink is low') : t('Ready')
  const pictures = info?.storage.files ?? 0

  return (
    <div className="t-kioskm">
      <h1 className="t-h1 t-h1--sm">{t('Kiosk Management')}</h1>
      <p className="t-lead">{t('The kiosk screen, its health and its controls.')}</p>

      <section className="t-hero">
        <div className="t-hero__top">
          <span className="t-hero__eyebrow"><Monitor size={18} /> {t('Kiosk')}</span>
          <span className={`t-pill ${state?.kioskOnline ? 'is-on' : 'is-off'}`}><i />{state?.kioskOnline ? t('Online') : t('Offline')}</span>
        </div>
        <KioskName name={state?.kioskName ?? info?.name} onSave={(name) => act('/api/kiosk', t('Kiosk renamed.'), { method: 'PATCH', body: { name } })} />
        <p>{status.text}</p>
        <dl className="t-hero__facts">
          <div>
            <dt>{info?.online ? t('Connected for') : t('Last seen')}</dt>
            <dd>{info ? (info.online ? duration(now - new Date(info.connectedAt), t) : when(info.lastSeen, t) || t('Never')) : '–'}</dd>
          </div>
          <div><dt>{t('Screen')}</dt><dd>{state?.kioskOnline ? (sleeping ? t('Sleeping') : t('Awake')) : '–'}</dd></div>
          <div><dt>{t('Firmware')}</dt><dd>{info?.firmware ?? '–'}</dd></div>
        </dl>
      </section>

      <div className="t-section-head"><h3>{t('Health check')}</h3><button className="t-link" onClick={() => { setHealth(null); checkHealth() }}>{t('Check again')}</button></div>
      <ul className="t-health">
        <Health icon={<Monitor size={18} />} label={t('Kiosk screen')} ok={state?.kioskOnline} text={state?.kioskOnline ? t('Connected') : t('Not connected. Open the kiosk screen on the laptop.')} />
        <Health
          icon={<Printer size={18} />}
          label={t('Printer')}
          ok={printer && !printer.problem}
          warn={printer && !printer.problem && (printer.lowPaper || printer.lowInk)}
          text={printerText}
          link={printer?.problem || printer?.lowPaper || printer?.lowInk ? '/teacher/print' : null}
        />
        <Health icon={<Wifi size={18} />} label={t('Internet (image service)')} ok={health?.internet} pending={!health} text={!health ? t('Checking…') : health.internet ? t('Reachable') : t('Not reachable. Pictures cannot be made.')} />
        <Health icon={<Database size={18} />} label={t('Database')} ok={health?.database} pending={!health} text={!health ? t('Checking…') : health.database ? t('Working') : t('Not working')} />
        <Health
          icon={<HardDrive size={18} />}
          label={t('Saved pictures')}
          ok
          text={info ? `${t(pictures === 1 ? '1 picture' : '{n} pictures', { n: pictures })} · ${mb(info.storage.bytes)}` : '…'}
        />
      </ul>

      <div className="t-section-head"><h3>{t('Screen')}</h3></div>
      <section className="t-panel-card">
        <div className="t-row">
          <span className="t-row__text">
            <b>{sleeping ? t('The screen is asleep') : t('The screen is awake')}</b>
            <small>
              {info?.autoSleep ? t('Sleeps by itself after {n} min with nobody using it.', { n: info.autoSleepMinutes }) : t('Auto-sleep is off.')}{' '}
              <Link to="/teacher/settings">{t('Change this in Settings.')}</Link>
            </small>
          </span>
          {sleeping ? (
            <button className="t-btn" onClick={() => act('/api/kiosk/wake', t('Kiosk is awake.'))} disabled={!state?.kioskOnline}><Sun size={16} /> {t('Wake')}</button>
          ) : (
            <button className="t-btn t-btn--ghost" onClick={() => act('/api/kiosk/sleep', t('Kiosk is sleeping.'))} disabled={!state?.kioskOnline}><Moon size={16} /> {t('Sleep')}</button>
          )}
        </div>
        <Brightness value={state?.screen?.brightness ?? 100} onSave={(b) => call('/api/kiosk', { method: 'PATCH', body: { brightness: b } }).catch((e) => setNotice(t.error(e.message)))} />
      </section>

      <div className="t-section-head"><h3>{t('Controls')}</h3></div>
      <div className="t-actions">
        <button className="t-action" onClick={() => { if (window.confirm(t('Restart the kiosk screen?'))) act('/api/kiosk/restart', t('Kiosk is restarting…')) }} disabled={!state?.kioskOnline}>
          <i className="t-tint t-tint--amber"><RotateCw size={18} /></i>
          <span><b>{t('Restart Kiosk')}</b><small>{t('Reloads the kiosk screen. The session keeps running.')}</small></span>
        </button>
        <a className="t-action" href="/kiosk" target="_blank" rel="noreferrer">
          <i className="t-tint t-tint--blue"><ExternalLink size={18} /></i>
          <span><b>{t('Open kiosk screen')}</b><small>{t('Opens the kiosk display in a new tab on this computer.')}</small></span>
        </a>
        <div className="t-action t-action--static">
          <i className="t-tint t-tint--gray"><Cpu size={18} /></i>
          <span><b>{t('Firmware {v}', { v: info?.firmware ?? '' })}</b><small>{t('Up to date. This is a simulated kiosk.')}</small></span>
        </div>
      </div>

      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}
    </div>
  )
}

function KioskName({ name, onSave }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!editing) {
    return (
      <h2 className="t-hero__name">
        {name ?? t('Kiosk')}
        <button className="t-icon-btn t-icon-btn--light" onClick={() => { setDraft(name ?? ''); setEditing(true) }} aria-label={t('Rename kiosk')}><Pencil size={16} /></button>
      </h2>
    )
  }
  const save = (e) => {
    e.preventDefault()
    if (draft.trim()) onSave(draft.trim())
    setEditing(false)
  }
  return (
    <form className="t-hero__rename" onSubmit={save}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} aria-label={t('Kiosk name')} autoFocus />
      <button className="t-icon-btn t-icon-btn--light" aria-label={t('Save name')}><Check size={18} /></button>
      <button type="button" className="t-icon-btn t-icon-btn--light" onClick={() => setEditing(false)} aria-label={t('Cancel')}><X size={18} /></button>
    </form>
  )
}

// Saves a moment after the slider stops moving, so dragging doesn't send dozens of requests.
function Brightness({ value, onSave }) {
  const t = useT()
  const [local, setLocal] = useState(value)
  const timer = useRef(null)
  const dragging = useRef(false)
  useEffect(() => { if (!dragging.current) setLocal(value) }, [value])
  const change = (v) => {
    dragging.current = true
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { dragging.current = false; onSave(v) }, 350)
  }
  return (
    <label className="t-slider">
      <span className="t-row__text"><b>{t('Brightness')}</b><small>{local}%</small></span>
      <span className="t-slider__track">
        <SunDim size={16} />
        <input type="range" min={30} max={100} step={5} value={local} onChange={(e) => change(Number(e.target.value))} />
        <Sun size={18} />
      </span>
    </label>
  )
}

function Health({ icon, label, ok, warn, pending, text, link }) {
  const t = useT()
  const tone = pending ? 'wait' : !ok ? 'bad' : warn ? 'warn' : 'ok'
  return (
    <li className={`t-health__row is-${tone}`}>
      <i className="t-tint t-tint--gray">{icon}</i>
      <span className="t-row__text"><b>{label}</b><small>{text}</small></span>
      {link ? <Link className="t-link t-link--strong" to={link}>{t('Fix')} →</Link> : <em aria-hidden="true" />}
    </li>
  )
}
