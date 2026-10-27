import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Droplet, Eye, FileText, FlaskConical, Power, Printer, RotateCw, Wrench, X } from 'lucide-react'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'
import { PROBLEM_NAMES, themeName } from './labels.js'
import { requestStatus, when } from './status.js'
import { Sheet } from '../kiosk/Sheet.jsx'

// Buttons in the hardware simulator panel (server/src/printer.js SIMULATIONS).
const SIMULATIONS = [
  ['jam', 'Paper jam', 'Simulated: paper jam.'],
  ['offline', 'Turn printer off', 'Simulated: printer turned off.'],
  ['low_paper', 'Low paper', 'Simulated: low paper.'],
  ['low_ink', 'Low ink', 'Simulated: low ink.'],
  ['no_ink', 'Out of ink', 'Simulated: out of ink.'],
]

const JOB_NAMES = { child: 'Printing a child’s picture', reprint: 'Printing a reprint', test: 'Printing a test page' }

export default function PrintManagement() {
  const { call, live } = useAuth()
  const t = useT()
  const [view, setView] = useState('all')
  const [data, setData] = useState(null)
  const [preview, setPreview] = useState(null)
  const [notice, setNotice] = useState(null)
  const printer = live.state?.printer

  const load = useCallback(() => call(`/api/print/history?view=${view}`).then(setData).catch((e) => setNotice(t.error(e.message))), [call, view, t])
  // Reload as pages finish printing and new pictures are made.
  useEffect(() => { load() }, [load, printer?.printing?.requestId, printer?.queue.length, printer?.problem, live.state?.mode])

  async function act(path, message, body) {
    try {
      const res = await call(path, { method: 'POST', body })
      setNotice(typeof message === 'function' ? message(res) : message)
    } catch (err) {
      setNotice(t.error(err.message))
    }
  }

  const failed = data?.summary.failed ?? 0
  const items = data?.items ?? []

  return (
    <div className="t-printm">
      <h1 className="t-h1 t-h1--sm">{t('Print Management')}</h1>
      <p className="t-lead">{t('The kiosk printer, its paper and ink, and every picture it has printed.')}</p>

      <PrinterCard printer={printer} printedToday={data?.summary.printedToday} act={act} />

      {failed > 0 && (
        <div className="t-next t-next--warn">
          <span><AlertTriangle size={16} /> {t(failed === 1 ? '1 picture did not print.' : '{n} pictures did not print.', { n: failed })}</span>
          <button
            className="t-link t-link--strong"
            onClick={() => act('/api/print/retry-failed', (r) => t(r.count === 1 ? 'Sending 1 picture to the printer.' : 'Sending {n} pictures to the printer.', { n: r.count }))}
          >
            {t(failed === 1 ? 'Print it now' : 'Print them now')} →
          </button>
        </div>
      )}

      <ol className="t-tabs t-tabs--two">
        {[['all', 'All pictures'], ['failed', 'Did not print', failed]].map(([id, label, count]) => (
          <li key={id}>
            <button className={view === id ? 'is-current' : ''} onClick={() => setView(id)} aria-pressed={view === id}>
              {t(label)}{count > 0 && <span>{count}</span>}
            </button>
          </li>
        ))}
      </ol>

      {data && items.length === 0 && (
        <div className="t-empty">
          <i className="t-tint t-tint--purple t-tint--lg"><Printer size={22} /></i>
          <b>{view === 'failed' ? t('Every picture printed') : t('No pictures yet')}</b>
          <p>{view === 'failed' ? t('Pictures that did not come out of the printer appear here.') : t('Pictures the kiosk makes appear here, ready to reprint.')}</p>
        </div>
      )}

      <ul className="t-feed t-feed--print">
        {items.map((r) => {
          const status = requestStatus(r, t)
          const busy = printer?.printing?.requestId === r.id || printer?.queue.some((j) => j.requestId === r.id)
          return (
            <li key={r.id} className="t-feed__row">
              <button className="t-feed__thumb" onClick={() => setPreview(r)} aria-label={t('Preview the page for {text}', { text: r.recognized_text })}>
                <img src={r.image_url} alt="" /><Eye size={14} />
              </button>
              <span className="t-feed__text">
                <b>“{r.recognized_text}”</b>
                <small>{t('Child #{n}', { n: r.queue_number })} · {themeName(r.theme, t)} · {when(r.created_at, t)}</small>
                <em className={`t-tag t-tag--${busy ? 'blue' : status.tone}`}>{busy ? t('Printing…') : status.text}</em>
              </span>
              <button
                className="t-btn t-btn--ghost t-btn--sm"
                disabled={busy}
                onClick={() => act(`/api/print/${r.id}/reprint`, r.print_status === 'printed' ? t('Reprinting…') : t('Printing…'))}
              >
                <RotateCw size={14} /> {r.print_status === 'printed' ? t('Reprint') : t('Print')}
              </button>
            </li>
          )
        })}
      </ul>

      <section className="t-sim">
        <h2 className="t-panel__title"><FlaskConical size={18} /> {t('Hardware simulator')}</h2>
        <p className="t-panel__lead">{t('There is no real printer yet. Give the pretend printer a problem to practise fixing it.')}</p>
        <div className="t-sim__buttons">
          {SIMULATIONS.map(([id, label, done]) => (
            <button key={id} className="t-btn t-btn--ghost t-btn--sm" onClick={() => act('/api/printer/simulate', t(done), { problem: id })}>{t(label)}</button>
          ))}
        </div>
      </section>

      {preview && <PagePreview r={preview} onClose={() => setPreview(null)} />}
      {notice && <p className="t-toast" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</p>}
    </div>
  )
}

function PrinterCard({ printer, printedToday, act }) {
  const t = useT()
  if (!printer) return null
  const job = printer.printing
  const status = printer.problem
    ? { tone: 'bad', text: t(PROBLEM_NAMES[printer.problem]) }
    : job
      ? { tone: 'busy', text: t(JOB_NAMES[job.kind]) }
      : { tone: 'ok', text: t('Ready') }
  const waiting = printer.queue.length
  return (
    <section className="t-printer">
      <div className="t-printer__top">
        <i className="t-tint t-tint--purple t-tint--lg"><Printer size={22} /></i>
        <div>
          <small>{t('Kiosk printer')}</small>
          <b className={`t-printer__status is-${status.tone}`}><i />{status.text}</b>
        </div>
        <span className="t-printer__today"><b>{printedToday ?? '–'}</b> {t('printed today')}</span>
      </div>
      {waiting > 0 && <p className="t-muted">{t(waiting === 1 ? '1 more page waiting.' : '{n} more pages waiting.', { n: waiting })}</p>}

      <Gauge
        icon={<FileText size={16} />}
        label={t('Paper')}
        value={t('{n} of {max} sheets', { n: printer.paper, max: printer.capacity })}
        percent={(printer.paper / printer.capacity) * 100}
        low={printer.lowPaper || printer.paper === 0}
      />
      <Gauge icon={<Droplet size={16} />} label={t('Ink')} value={`${printer.ink}%`} percent={printer.ink} low={printer.lowInk || printer.ink === 0} />

      <div className="t-printer__actions">
        {printer.problem === 'jam' && <button className="t-btn" onClick={() => act('/api/printer/clear', t('Paper jam cleared.'))}><Wrench size={16} /> {t('Clear paper jam')}</button>}
        {printer.problem === 'offline' && <button className="t-btn" onClick={() => act('/api/printer/clear', t('Printer is on.'))}><Power size={16} /> {t('Turn printer on')}</button>}
        <button className="t-btn t-btn--ghost" onClick={() => act('/api/printer/refill-paper', t('Paper tray filled.'))} disabled={printer.paper === printer.capacity}><FileText size={16} /> {t('Refill paper')}</button>
        <button className="t-btn t-btn--ghost" onClick={() => act('/api/printer/replace-ink', t('New ink cartridge in.'))} disabled={printer.ink === 100}><Droplet size={16} /> {t('Replace ink')}</button>
        <button className="t-btn t-btn--ghost" onClick={() => act('/api/printer/test', t('Printing a test page…'))} disabled={!!printer.problem}><Printer size={16} /> {t('Test page')}</button>
      </div>
    </section>
  )
}

function Gauge({ icon, label, value, percent, low }) {
  const t = useT()
  return (
    <div className={`t-gauge ${low ? 'is-low' : ''}`}>
      <div className="t-gauge__label"><span>{icon} {label}</span><b>{value}{low ? ` · ${t('low')}` : ''}</b></div>
      <div className="t-gauge__bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  )
}

// The printed page, drawn the same way the kiosk shows it.
function PagePreview({ r, onClose }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="t-modal" role="dialog" aria-modal="true" aria-label={t('Printed page')} onClick={onClose}>
      <div className="t-modal__sheet t-page-preview" onClick={(e) => e.stopPropagation()}>
        <div className="t-modal__head">
          <div><h2>“{r.recognized_text}”</h2><p>{t('Child #{n}', { n: r.queue_number })} · {themeName(r.theme, t)}</p></div>
          <button className="t-icon-btn" onClick={onClose} aria-label={t('Close')}><X size={20} /></button>
        </div>
        <div className="t-page-preview__sheet">
          <Sheet
            current={{ imageUrl: r.image_url, sheet: r.sheet, recognizedText: r.recognized_text }}
            session={{ activity_type: r.activity_type, theme: r.theme }}
          />
        </div>
      </div>
    </div>
  )
}
