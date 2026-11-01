'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { SERIES_COLORS } from '@/lib/report-info';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Small, dependency-free charts for Analytics and Reports: thin bars (max
// 24px) with rounded ends, 2px gaps between stacked parts, hairline grid, a
// legend for 2+ series, a tooltip on hover/focus, and a table view so no
// value needs color or hover.

export type Series = { key: string; label: string; color: string };

// The card around a chart, with a chart/table switch.
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  legend?: Series[];
  table?: React.ReactNode;
  children: React.ReactNode;
  empty?: boolean;
}) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="min-w-0 rounded-[14px] border bg-card p-4 shadow-card break-inside-avoid">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[15px] font-bold">{title}</h3>
          {subtitle && <p className="m-0 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {table && !empty && (
          <button className="no-print shrink-0 border-0 bg-transparent p-0 text-[13px] font-semibold text-blue-accent" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? t('Show chart') : t('Show table')}
          </button>
        )}
      </div>
      {empty ? (
        <p className="m-0 py-6 text-center text-[13px] text-muted-foreground">{t('No data for this period yet.')}</p>
      ) : asTable ? (
        table
      ) : (
        <>
          {legend && (
            <ul className="m-0 mb-3 flex list-none flex-wrap gap-3 p-0 text-xs text-slate-600">
              {legend.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          {children}
        </>
      )}
    </section>
  );
}

// A clean axis maximum: 1, 2, 5, 10, 20, 50…
function niceMax(n: number) {
  if (n <= 4) return Math.max(n, 1);
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= n)!;
}

export type ColumnRow = { label: string; tip?: string; values: Record<string, number | undefined> };

// Vertical columns, stacked when there is more than one series.
export function ColumnChart({ rows, series, labelEvery = 1, height = 180 }: { rows: ColumnRow[]; series: Series[]; labelEvery?: number; height?: number }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const totals = rows.map((r) => series.reduce((sum, s) => sum + (r.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];

  return (
    <div>
      <div className="relative ml-7" style={{ height }}>
        {ticks.map((v) => (
          <span key={v} className="absolute inset-x-0 border-t border-[#eef1f5]" style={{ bottom: `${(v / max) * 100}%` }}>
            <em className="absolute -top-2 -left-7 w-6 text-right text-[10px] text-muted-foreground not-italic">{v}</em>
          </span>
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5">
          {rows.map((r, i) => (
            <button
              key={r.label + i}
              className="relative flex h-full flex-1 items-end justify-center border-0 bg-transparent p-0"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${r.tip ?? r.label}: ${series.map((s) => `${s.label} ${r.values[s.key] ?? 0}`).join(', ')}`}
            >
              <span className={cn('flex w-full max-w-6 flex-col-reverse gap-0.5 overflow-hidden rounded-t transition-opacity', hover !== null && hover !== i && 'opacity-60')} style={{ height: `${(totals[i] / max) * 100}%` }}>
                {series.map((s) => (r.values[s.key] ? <i key={s.key} className="block min-h-0.5" style={{ flexGrow: r.values[s.key], background: s.color }} /> : null))}
              </span>
              {hover === i && (
                <span
                  className={cn(
                    'pointer-events-none absolute bottom-full z-10 mb-1 flex min-w-32 flex-col gap-0.5 rounded-lg bg-navy-900 px-2.5 py-2 text-left text-xs whitespace-nowrap text-white shadow-lg',
                    i > rows.length / 2 ? 'right-0' : 'left-0'
                  )}
                  role="presentation"
                >
                  <b>{r.tip ?? r.label}</b>
                  {series.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <i className="size-2 rounded-sm" style={{ background: s.color }} />
                      <strong>{r.values[s.key] ?? 0}</strong> {s.label}
                    </span>
                  ))}
                  {series.length > 1 && <span className="mt-0.5 border-t border-white/20 pt-0.5">{t('Total {n}', { n: totals[i] })}</span>}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 ml-7 flex gap-0.5 text-[10px] text-muted-foreground" aria-hidden="true">
        {rows.map((r, i) => (
          <span key={r.label + i} className="flex-1 overflow-visible text-center whitespace-nowrap">
            {i % labelEvery === 0 ? r.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// Horizontal bars with the value at the tip.
export function BarList({ rows, format = (v) => String(v) }: { rows: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`} className="grid gap-1">
          <span className="truncate text-[13px] text-slate-700">{r.label}</span>
          <span className="flex items-center gap-2">
            <i className="block h-3 min-w-1 rounded" style={{ width: `${(r.value / max) * 85}%`, background: SERIES_COLORS[0] }} />
            <b className="text-xs">{format(r.value)}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}

// The same numbers as a plain table, for the "Show table" switch and print.
export function DataTable({ head, rows }: { head: string[]; rows: (string | number | null | undefined)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h) => (
              <TableHead key={h} scope="col" className="text-xs">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <TableHead key={j} scope="row" className="text-[13px] font-medium text-foreground">
                    {c}
                  </TableHead>
                ) : (
                  <TableCell key={j} className="text-[13px]">
                    {c}
                  </TableCell>
                )
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
