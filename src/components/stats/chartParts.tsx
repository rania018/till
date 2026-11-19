import clsx from 'clsx'
import { Table2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { t } from '../../i18n'
import { direction } from '../../i18n/language'
import { touchArea } from '../ui/buttonStyles'

export interface LegendItem {
  label: string
  color: string
  /** Bars get a square swatch, lines a short stroke, reference lines a dashed one. */
  mark?: 'rect' | 'line' | 'dash'
}

function LegendMark({ color, mark = 'rect' }: Pick<LegendItem, 'color' | 'mark'>) {
  if (mark === 'rect') return <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
  return (
    <svg aria-hidden width="16" height="4" className="shrink-0">
      <line x1="1" y1="2" x2="15" y2="2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={mark === 'dash' ? '3 3' : undefined} />
    </svg>
  )
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LegendMark color={item.color} mark={item.mark} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export interface ChartTable {
  caption: string
  columns: string[]
  rows: (string | number)[][]
  /** Makes each row's first cell a button: the keyboard's way to what clicking the chart does. */
  onRow?: (index: number) => void
}

interface ChartCardProps {
  title: string
  note?: string
  legend?: LegendItem[]
  /** What the chart shows, for screen readers. */
  summary: string
  /** The same numbers as a table: the chart's accessible twin, one tap away for everyone. */
  table: ChartTable
  children: ReactNode
  className?: string
}

/** A titled chart with its legend, a note under it, and a "Show as table" switch. Inside `data-quiet` the note is on hover over the title, and still read out to screen readers. */
export function ChartCard({ title, note, legend, summary, table, children, className }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()
  return (
    <figure className={clsx('min-w-0 rounded-2xl border border-line bg-surface p-4 desk:flex desk:flex-col desk:p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3 desk:mb-2 desk:min-h-9 desk:items-center">
        <figcaption title={note} className="text-sm font-extrabold desk:text-base">{title}</figcaption>
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable(!showTable)}
          className={clsx('-my-1 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-accent hover:bg-accent-soft', touchArea)}
        >
          <Table2 aria-hidden className="size-3.5" />
          {showTable ? t.stats.table.hide : t.stats.table.show}
        </button>
      </div>
      {legend && legend.length > 1 && (
        <div className="mb-2">
          <Legend items={legend} />
        </div>
      )}
      {showTable ? (
        <div id={tableId} className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{table.caption}</caption>
            <thead>
              <tr className="text-start text-xs text-muted">
                {table.columns.map((column, i) => (
                  <th key={column} scope="col" className={clsx('pb-1.5 font-bold', i > 0 && 'text-end')}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="py-1.5 pe-3 text-start font-semibold">
                        {table.onRow ? (
                          <button type="button" onClick={() => table.onRow?.(r)} className="text-start text-accent underline-offset-2 hover:underline">
                            {cell}
                          </button>
                        ) : (
                          cell
                        )}
                      </th>
                    ) : (
                      <td key={i} className="py-1.5 text-end tabular-nums">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div id={tableId} role="img" aria-label={summary} dir="ltr" className="desk:flex desk:flex-1 desk:flex-col desk:justify-end">
          {children}
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted in-data-quiet:sr-only">{note}</p>}
    </figure>
  )
}

interface TooltipRow {
  label: string
  value: string
  color: string
  mark?: LegendItem['mark']
}

/** The hover readout: the value leads, the series name follows, keyed by a short stroke of its color. */
export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div dir={direction} className="min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs font-bold text-muted">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <LegendMark color={row.color} mark={row.mark ?? 'line'} />
            <span className="font-extrabold tabular-nums">{row.value}</span>
            <span className="text-xs font-semibold text-ink-2">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
