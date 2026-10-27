import { useState } from 'react'
import { useT } from '../i18n/index.jsx'
import { SERIES_COLORS } from './chartColors.js'

// Small, dependency-free charts for Analytics and Reports, following the
// WishPix data-viz rules: thin bars (max 24px) with 4px rounded ends, 2px
// gaps between stacked parts, hairline grid, a legend for 2+ series, a
// tooltip on hover/focus, and a table view so no value needs color or hover.

// The card around a chart, with a chart/table switch.
export function ChartCard({ title, subtitle, legend, table, children, empty }) {
  const t = useT()
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="t-chart">
      <div className="t-chart__head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && !empty && (
          <button className="t-link" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? t('Show chart') : t('Show table')}
          </button>
        )}
      </div>
      {empty ? <p className="t-chart__empty">{t('No data for this period yet.')}</p> : asTable ? table : (
        <>
          {legend && (
            <ul className="t-legend">
              {legend.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.label}</li>)}
            </ul>
          )}
          {children}
        </>
      )}
    </section>
  )
}

// A clean axis maximum: 1, 2, 5, 10, 20, 50…
function niceMax(n) {
  if (n <= 4) return Math.max(n, 1)
  const p = 10 ** Math.floor(Math.log10(n))
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= n)
}

// Vertical columns, stacked when there is more than one series.
// rows: [{ label, tip, values: { [series.key]: number } }]
export function ColumnChart({ rows, series, labelEvery = 1, height = 180 }) {
  const t = useT()
  const [hover, setHover] = useState(null)
  const totals = rows.map((r) => series.reduce((sum, s) => sum + (r.values[s.key] ?? 0), 0))
  const max = niceMax(Math.max(0, ...totals))
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max]

  return (
    <div className="t-cols" style={{ '--h': `${height}px` }}>
      <div className="t-cols__plot">
        {ticks.map((v) => (
          <span key={v} className="t-cols__grid" style={{ bottom: `${(v / max) * 100}%` }}><em>{v}</em></span>
        ))}
        <div className="t-cols__bars">
          {rows.map((r, i) => (
            <button
              key={r.label + i}
              className={`t-cols__col ${hover === i ? 'is-hover' : ''}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${r.tip ?? r.label}: ${series.map((s) => `${s.label} ${r.values[s.key] ?? 0}`).join(', ')}`}
            >
              <span className="t-cols__stack" style={{ height: `${(totals[i] / max) * 100}%` }}>
                {series.map((s) => (r.values[s.key] ? (
                  <i key={s.key} style={{ flexGrow: r.values[s.key], background: s.color }} />
                ) : null))}
              </span>
              {hover === i && (
                <span className={`t-tip ${i > rows.length / 2 ? 't-tip--left' : ''}`} role="presentation">
                  <b>{r.tip ?? r.label}</b>
                  {series.map((s) => (
                    <span key={s.key}><i style={{ background: s.color }} /><strong>{r.values[s.key] ?? 0}</strong> {s.label}</span>
                  ))}
                  {series.length > 1 && <span className="t-tip__total">{t('Total {n}', { n: totals[i] })}</span>}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="t-cols__labels" aria-hidden="true">
        {rows.map((r, i) => <span key={r.label + i}>{i % labelEvery === 0 ? r.label : ''}</span>)}
      </div>
    </div>
  )
}

// Horizontal bars with the value at the tip. rows: [{ label, value }]
export function BarList({ rows, format = (v) => v }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="t-bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <span className="t-bars__label">{r.label}</span>
          <span className="t-bars__track">
            <i style={{ width: `${(r.value / max) * 100}%`, background: SERIES_COLORS[0] }} />
            <b>{format(r.value)}</b>
          </span>
        </li>
      ))}
    </ul>
  )
}

// The same numbers as a plain table, for the "Show table" switch and print.
export function DataTable({ head, rows }) {
  return (
    <div className="t-table-wrap">
      <table className="t-table">
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </div>
  )
}
