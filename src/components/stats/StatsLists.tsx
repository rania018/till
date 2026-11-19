import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '../../i18n'
import { formatMoney } from '../../lib/money'
import type { CategorySpend } from '../../lib/stats'
import { formatWorkTime, workTimeFor } from '../../lib/workHours'
import type { Category, ID } from '../../types'
import { Panel } from '../desk/Panel'
import { rowClass, stretchedClass, tableClass, tdClass, thClass } from '../desk/tableStyles'
import { Icon } from '../ui/Icon'

/** Beside the charts there's no room for the last column until the screen is wider. */
const TIGHT_HIDDEN = '@max-[80rem]:hidden'

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`

interface CategoryRankingProps {
  rows: CategorySpend[]
  categories: Category[]
  currency: string
  /** Hourly rate to show each category in hours of work; `null` hides it. */
  rate: number | null
  hoursPerDay: number
  /** e.g. "vs the same point last cycle" */
  compareLabel: string
  /** Opens the category's details. */
  onSelect: (categoryId: ID) => void
  /** One line per category, for computers. */
  dense?: boolean
  /** The category pointed at, here or in the share ring beside it. */
  active?: ID | null
  onActive?: (id: ID | null) => void
  /** Each category's spending over the last pay cycles, oldest first, drawn as a small line in its row. */
  history?: Map<ID, number[]>
  /** Beside the table on a computer, e.g. the share ring; above the list on a phone. */
  lead?: ReactNode
  /** Each row's colour: main categories wear their pastel. The brand colour when left out. */
  colorOf?: (id: ID) => string
}

/** A category's last pay cycles as a small line, the latest marked: which way it's going, at a glance. */
function Sparkline({ values, color = 'var(--color-accent)' }: { values: number[]; color?: string }) {
  const width = 72
  const height = 24
  const top = Math.max(...values)
  const x = (i: number) => (values.length > 1 ? 2 + (i * (width - 4)) / (values.length - 1) : width / 2)
  const y = (v: number) => (top > 0 ? height - 3 - (v / top) * (height - 6) : height - 3)
  const last = values.length - 1
  return (
    <svg aria-hidden width={width} height={height} className="ms-auto block overflow-visible">
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3} fill={color} stroke="var(--color-surface)" strokeWidth={1.5} />
    </svg>
  )
}

/**
 * Where the money went, as ranked bars in one color: bars on one baseline compare
 * more exactly than slices of a donut, and one color means a category never changes
 * color when the period does.
 */
export function CategoryRanking({ rows, categories, currency, rate, hoursPerDay, compareLabel, onSelect, dense, active, onActive, history, lead, colorOf }: CategoryRankingProps) {
  const colour = (id: ID) => (colorOf ? colorOf(id) : 'var(--color-accent)')
  const copy = t.stats.categories
  const max = rows[0]?.spent ?? 0
  const byId = new Map(categories.map((c) => [c.id, c]))

  if (dense) {
    return (
      <Panel title={copy.title} aside={<p className="text-sm text-muted">{compareLabel}</p>}>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">{copy.empty}</p>
        ) : (
          <div className={clsx(lead && '@min-[52rem]:flex')}>
          {/* The divider runs the table's full height, with the ring in the middle of it. */}
          {lead && (
            <div className="flex items-center justify-center border-b border-line p-6 @min-[52rem]:border-b-0 @min-[52rem]:border-e">
              <div className="@min-[52rem]:sticky @min-[52rem]:top-20">{lead}</div>
            </div>
          )}
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass()}>
                  {t.desk.table.category}
                </th>
                {history && (
                  <th scope="col" className={clsx(thClass({ right: true }), '@max-[64rem]:hidden')}>
                    {t.stats.history.heading}
                  </th>
                )}
                <th scope="col" className={thClass({ right: true })}>
                  {t.desk.table.spent}
                </th>
                <th scope="col" className={thClass({ right: true })}>
                  {copy.shareHeading}
                </th>
                <th scope="col" className={thClass({ right: true })}>
                  {copy.changeHeading}
                </th>
                {rate && (
                  <th scope="col" className={clsx(thClass({ right: true }), TIGHT_HIDDEN)}>
                    {copy.workHeading}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const category = byId.get(row.categoryId)
                const up = row.change !== null && row.change > 0
                const flat = row.change !== null && Math.round(row.change * 100) === 0
                return (
                  <tr key={row.categoryId} className={clsx(rowClass, active === row.categoryId && 'bg-surface-2')} onMouseEnter={() => onActive?.(row.categoryId)} onMouseLeave={() => onActive?.(null)}>
                    <td className={clsx(tdClass(), 'w-full max-w-0 py-3')}>
                      <button type="button" onClick={() => onSelect(row.categoryId)} onFocus={() => onActive?.(row.categoryId)} onBlur={() => onActive?.(null)} className={clsx(stretchedClass, 'flex w-full min-w-0 items-center gap-2.5 text-start')}>
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg text-ink" style={{ background: `color-mix(in oklab, ${colour(row.categoryId)} 55%, transparent)` }}>
                          <Icon name={category?.icon ?? 'package'} className="size-4" />
                        </span>
                        <span className="truncate">{category?.name}</span>
                        <span className="sr-only">. {copy.seeExpenses}</span>
                      </button>
                      <span aria-hidden className="mt-2 block h-1.5 rounded-full bg-surface-2">
                        <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (row.spent / max) * 100 : 0}%`, background: colour(row.categoryId) }} />
                      </span>
                    </td>
                    {history && (
                      <td className={clsx(tdClass({ right: true }), 'py-3 @max-[64rem]:hidden')} title={t.stats.history.label(category?.name ?? '')}>
                        <Sparkline values={history.get(row.categoryId) ?? [0]} color={colour(row.categoryId)} />
                      </td>
                    )}
                    <td className={clsx(tdClass({ right: true, strong: true }), 'py-3')}>{formatMoney(row.spent, currency)}</td>
                    <td className={clsx(tdClass({ right: true, muted: true }), 'py-3')}>{percent(row.share)}</td>
                    <td className={clsx(tdClass({ right: true }), 'py-3 font-semibold', row.change === null || flat ? 'text-muted' : up ? 'text-crit-ink' : 'text-good-ink')}>
                      {row.change === null ? (row.previous === 0 ? copy.isNew : '–') : flat ? copy.same : <span className="inline-flex items-center gap-0.5">{up ? <ArrowUpRight aria-hidden className="size-3" /> : <ArrowDownRight aria-hidden className="size-3" />}{percent(Math.abs(row.change))}</span>}
                    </td>
                    {rate && <td className={clsx(tdClass({ right: true, muted: true }), 'py-3', TIGHT_HIDDEN)}>{formatWorkTime(workTimeFor(row.spent, rate, hoursPerDay))}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </Panel>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-extrabold">{copy.title}</h2>
        <p className="text-xs text-muted">{compareLabel}</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[0.9375rem] text-ink-2">{copy.empty}</p>
      ) : (
        <>
        {lead && <div className="flex justify-center py-3">{lead}</div>}
        <ul className="-mx-2">
          {rows.map((row) => {
            const category = byId.get(row.categoryId)
            const name = category?.name ?? ''
            const up = row.change !== null && row.change > 0
            return (
              <li key={row.categoryId}>
                <button type="button" onClick={() => onSelect(row.categoryId)} className="block w-full rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-surface-2">
                  <span className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl text-ink" style={{ background: `color-mix(in oklab, ${colour(row.categoryId)} 55%, transparent)` }}>
                      <Icon name={category?.icon ?? 'package'} className="size-[1.125rem]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
                    <span className="shrink-0 font-extrabold tabular-nums">{formatMoney(row.spent, currency)}</span>
                  </span>
                  <span className="ms-12 mt-1.5 block h-2 rounded-full bg-surface-2">
                    <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (row.spent / max) * 100 : 0}%`, background: colour(row.categoryId) }} />
                  </span>
                  <span className="ms-12 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-semibold text-muted">
                    <span>{copy.share(percent(row.share))}</span>
                    {row.change === null ? (
                      row.previous === 0 && <span>{copy.isNew}</span>
                    ) : Math.round(row.change * 100) === 0 ? (
                      <span>{copy.same}</span>
                    ) : (
                      <span className={clsx('inline-flex items-center gap-0.5', up ? 'text-crit-ink' : 'text-good-ink')}>
                        {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
                        {up ? copy.more(percent(row.change)) : copy.less(percent(-row.change))}
                      </span>
                    )}
                    {rate && <span>{copy.workHours(formatWorkTime(workTimeFor(row.spent, rate, hoursPerDay)))}</span>}
                  </span>
                  <span className="sr-only">. {copy.seeExpenses}</span>
                </button>
              </li>
            )
          })}
        </ul>
        </>
      )}
    </section>
  )
}

interface SplitPart {
  label: string
  amount: number
  color: string
  /** Opens the entries behind this part. */
  onSelect?: () => void
}

/** One whole in two or more parts: a thin bar with the figures listed beside it. */
export function SplitCard({ title, parts, currency, note, bare }: { title: string; parts: SplitPart[]; currency: string; note?: string; /** Inside another panel, without a frame of its own. */ bare?: boolean }) {
  const whole = parts.reduce((sum, p) => sum + p.amount, 0)
  const shown = parts.filter((p) => p.amount > 0)
  return (
    <section className={clsx(bare ? 'px-3.5 py-2.5' : 'rounded-2xl border border-line bg-surface p-4')}>
      <h2 className={clsx('text-sm font-extrabold', bare ? 'mb-2 font-semibold text-muted' : 'mb-3')}>{title}</h2>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${formatMoney(p.amount, currency)}`).join(', ')}
        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2"
      >
        {shown.map((p) => (
          <span key={p.label} className="h-full first:rounded-s-full last:rounded-e-full" style={{ flexGrow: p.amount, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="relative flex items-center gap-2 rounded-lg text-sm has-[button:hover]:bg-surface-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            {p.onSelect ? (
              <button type="button" onClick={p.onSelect} className={clsx(stretchedClass, 'flex-1 text-start font-semibold text-ink-2')}>
                {p.label}
              </button>
            ) : (
              <span className="flex-1 font-semibold text-ink-2">{p.label}</span>
            )}
            <span className="whitespace-nowrap font-extrabold tabular-nums">{formatMoney(p.amount, currency)}</span>
            <span className="w-10 text-end text-xs font-bold tabular-nums text-muted">{whole > 0 ? percent(p.amount / whole) : '–'}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </section>
  )
}
