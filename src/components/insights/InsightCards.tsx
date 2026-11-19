import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { t } from '../../i18n'
import { categoryColor } from '../../lib/categoryTree'
import { recentCycles, type Cycle } from '../../lib/dates'
import { formatCompact, formatMoney, formatQuantity, roundMoney } from '../../lib/money'
import { comparePeriods, niceTicks, type TopItem } from '../../lib/stats'
import { walletBalance } from '../../lib/wallets'
import type { Account, Category, ID, ISODate, PaySchedule, Transaction } from '../../types'
import { ChartCard, TooltipBox, type LegendItem } from '../stats/chartParts'
import { AXIS_TICK, FLOW, GRID_STROKE, SERIES } from '../stats/chartTheme'
import { CardHeader } from '../home/HomeCards'
import { CategoryBadge } from '../ui/CategoryBadge'
import { inputClass } from '../ui/formStyles'

const CARD = 'min-w-0 rounded-2xl border border-line bg-surface p-4 desk:p-5'
/** Level with the title of `CardHeader` on a computer, so a row of mixed cards lines up. */
const TITLE = 'text-sm font-extrabold desk:flex desk:min-h-9 desk:items-center desk:text-base'
const ROW = 'flex w-full items-center gap-3 rounded-xl px-2 text-start transition-colors hover:bg-surface-2'
const ROW_BUTTON = `${ROW} py-2`

/** What's bought most, from the notes: how often, how much in all, and about how much each time. `compact` is for a row of cards on a computer: it fills the row's height, and the explaining goes to hover and screen readers. */
export function TopItemsCard({ items, categories, currency, onSelect, limit = 8, compact }: { items: TopItem[]; categories: Category[]; currency: string; onSelect: (item: TopItem) => void; limit?: number; compact?: boolean }) {
  const copy = t.insights.top
  const money = (amount: number) => formatMoney(amount, currency)
  const shown = items.slice(0, limit)
  const max = shown[0]?.total ?? 0
  const each = (item: TopItem) => (item.units ? t.transactions.quantityEach(money(roundMoney(item.unitSpent! / item.units))) : copy.each(money(Math.round(item.total / item.count))))
  const several = (item: TopItem) => (item.units ?? item.count) > 1
  return (
    <section className={compact ? 'flex h-full flex-col rounded-2xl border border-line bg-surface p-5' : CARD}>
      {compact ? (
        <>
          <CardHeader title={copy.title} />
          <p className="sr-only">{copy.note}</p>
        </>
      ) : (
        <>
          <h2 className="text-sm font-extrabold">{copy.title}</h2>
          <p className="mt-0.5 text-xs text-muted">{copy.note}</p>
        </>
      )}
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">{copy.none}</p>
      ) : (
        <ul className={compact ? '-mx-2 grid flex-1 content-around' : '-mx-2 mt-2'}>
          {shown.map((item) => (
            <li key={item.name}>
              <button type="button" onClick={() => onSelect(item)} title={compact && several(item) ? each(item) : undefined} className={compact ? `${ROW} py-1` : ROW_BUTTON}>
                <CategoryBadge categories={categories} id={item.categoryId} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold">{item.name}</span>
                    <span className="shrink-0 text-xs font-bold text-muted">{item.units ? `${formatQuantity(item.units)}×` : copy.times(item.count)}</span>
                    <span className="shrink-0 font-extrabold tabular-nums">{money(item.total)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="block h-1.5 flex-1 rounded-full bg-surface-2">
                      <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (item.total / max) * 100 : 0}%`, background: categoryColor(categories, item.categoryId) }} />
                    </span>
                    {several(item) && <span className={compact ? 'sr-only' : 'shrink-0 text-xs text-muted'}>{each(item)}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Where money came from, per income category, as ranked bars. */
export function IncomeCard({ rows, categories, currency, onSelect }: { rows: { categoryId: ID; received: number; share: number }[]; categories: Category[]; currency: string; onSelect: (id: ID) => void }) {
  const copy = t.insights.income
  const max = rows[0]?.received ?? 0
  return (
    <section className={CARD}>
      <h2 className={TITLE}>{copy.title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">{copy.none}</p>
      ) : (
        <ul className="-mx-2 mt-2">
          {rows.map((row) => (
            <li key={row.categoryId}>
              <button type="button" onClick={() => onSelect(row.categoryId)} className={ROW_BUTTON}>
                <CategoryBadge categories={categories} id={row.categoryId} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold">{categories.find((c) => c.id === row.categoryId)?.name}</span>
                    <span className="shrink-0 text-xs font-bold text-muted">{Math.round(row.share * 100)}%</span>
                    <span className="shrink-0 font-extrabold tabular-nums">{formatMoney(row.received, currency)}</span>
                  </span>
                  <span className="mt-1 block h-1.5 rounded-full bg-surface-2">
                    <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (row.received / max) * 100 : 0}%`, background: FLOW.income }} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface WalletCardProps {
  accounts: Account[]
  flows: { accountId: ID; spent: number; received: number }[]
  transactions: Transaction[]
  cycles: Cycle[]
  today: ISODate
  currency: string
  onSelect: (accountId: ID) => void
  /** Just one of its two cards, for a page that lays them out apart. */
  only?: 'flows' | 'balances'
}

/** Each wallet's spending and income in the dates shown, and its balance at the end of each pay cycle. */
export function WalletCard({ accounts, flows, transactions, cycles, today, currency, onSelect, only }: WalletCardProps) {
  const copy = t.insights.wallets
  const money = (amount: number) => formatMoney(amount, currency)
  // Balances can only be drawn on one scale in one currency: wallets in others are listed, not drawn.
  const drawn = accounts.filter((a) => !a.archived && (!a.currency || a.currency === currency)).slice(0, SERIES.length)
  const rows = useMemo(
    () =>
      cycles.map((cycle) => {
        const upTo = cycle.end < today ? cycle.end : today
        return { label: t.format.month(cycle.start), range: t.format.range(cycle.start, cycle.end), ...Object.fromEntries(drawn.map((a) => [a.id, a.startDate <= upTo ? walletBalance(a, transactions, upTo) : null])) }
      }),
    [cycles, today, drawn, transactions],
  )
  const values = rows.flatMap((r) => drawn.map((a) => (r as Record<string, unknown>)[a.id] as number | null)).filter((v): v is number => v !== null)
  const yTicks = niceTicks(Math.min(0, ...values), Math.max(0, ...values))
  const max = Math.max(...yTicks.map(Math.abs))
  const legend: LegendItem[] = drawn.map((a, i) => ({ label: a.name, color: SERIES[i], mark: 'line' }))
  const name = (id: ID) => accounts.find((a) => a.id === id)?.name ?? ''

  const flowsCard = (
      <section className={CARD}>
        <h2 className={TITLE}>{copy.title}</h2>
        <ul className="-mx-2 mt-2">
          {flows.map((row) => (
            <li key={row.accountId}>
              <button type="button" onClick={() => onSelect(row.accountId)} className={clsx(ROW_BUTTON, 'justify-between')}>
                <span className="min-w-0 flex-1 truncate font-bold">{name(row.accountId)}</span>
                <span className="text-end text-sm tabular-nums">
                  <span className="block font-extrabold">− {money(row.spent)}</span>
                  {row.received > 0 && <span className="block text-xs font-semibold text-good-ink">+ {money(row.received)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted in-data-quiet:sr-only">{copy.note}</p>
      </section>
  )
  const balancesCard = drawn.length > 0 && rows.length > 1 && (
        <ChartCard
          className="h-full"
          title={copy.balances}
          legend={legend}
          summary={drawn.map((a) => `${a.name}: ${money(((rows.at(-1) as Record<string, unknown>)[a.id] as number | null) ?? 0)}`).join('. ')}
          table={{ caption: copy.balances, columns: [t.stats.table.cycle, ...drawn.map((a) => a.name)], rows: rows.map((r) => [r.range, ...drawn.map((a) => { const v = (r as Record<string, unknown>)[a.id] as number | null; return v === null ? '–' : money(v) })]) }}
        >
          <ResponsiveContainer width="100%" height={only ? 230 : 200}>
            <LineChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={rows.length > 6 ? 1 : 0} padding={{ left: 12, right: 4 }} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[yTicks[0], yTicks[yTicks.length - 1]]} tickFormatter={(v: number) => formatCompact(v, max)} />
              <Tooltip
                cursor={{ stroke: GRID_STROKE }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as (typeof rows)[number] | undefined
                  if (!active || !row) return null
                  return <TooltipBox title={row.range} rows={drawn.map((a, i) => { const v = (row as Record<string, unknown>)[a.id] as number | null; return { label: a.name, value: v === null ? '–' : money(v), color: SERIES[i], mark: 'line' as const } })} />
                }}
              />
              {drawn.map((a, i) => (
                <Line key={a.id} dataKey={a.id} name={a.name} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 3.5, fill: SERIES[i], stroke: 'var(--color-surface)', strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
  )

  if (only === 'flows') return flowsCard
  if (only === 'balances') return balancesCard
  return (
    <div className="space-y-4">
      {flowsCard}
      {balancesCard}
    </div>
  )
}

interface CompareCardProps {
  transactions: Transaction[]
  categories: Category[]
  salary: PaySchedule
  today: ISODate
  currency: string
  onSelect: (id: ID, cycle: Cycle) => void
  /** Across two columns of a page: the pay cycles beside the title, the rows side by side. */
  wide?: boolean
  className?: string
}

/** Two pay cycles side by side, per main category: the earlier as a pale bar, the later in its colour, and the difference. */
export function CompareCard({ transactions, categories, salary, today, currency, onSelect, wide, className }: CompareCardProps) {
  const copy = t.insights.compare
  const money = (amount: number) => formatMoney(amount, currency)
  const cycles = useMemo(() => recentCycles(today, salary, 12).reverse(), [today, salary])
  const [first, setFirst] = useState(cycles[1]?.start ?? cycles[0].start)
  const [second, setSecond] = useState(cycles[0].start)
  const a = cycles.find((c) => c.start === first) ?? cycles[0]
  const b = cycles.find((c) => c.start === second) ?? cycles[0]
  const rows = useMemo(() => comparePeriods(transactions, a, b, categories), [transactions, a, b, categories])
  const max = Math.max(0, ...rows.flatMap((r) => [r.a, r.b]))
  const label = (c: Cycle) => (today <= c.end ? copy.soFar(t.format.range(c.start, c.end)) : t.format.range(c.start, c.end))
  const select = (value: string, onChange: (v: string) => void, aria: string) => (
    <select aria-label={aria} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass({ className: wide ? 'min-h-10 w-0 min-w-0 flex-1 py-1.5 text-sm' : 'min-h-10 w-auto py-1.5 text-sm' })}>
      {cycles.map((c) => (
        <option key={c.start} value={c.start}>
          {label(c)}
        </option>
      ))}
    </select>
  )

  const pickers = (
    <div className={clsx('flex items-center gap-2 text-sm font-semibold text-ink-2', wide ? 'min-w-0 flex-1' : 'mt-3 flex-wrap')}>
      {/* Beside the card's title, this word would only repeat it. */}
      <span className={wide ? 'sr-only' : undefined}>{copy.first}</span>
      {select(first, setFirst, copy.first)}
      <span>{copy.second}</span>
      {select(second, setSecond, copy.second)}
    </div>
  )

  return (
    <section className={clsx(CARD, className)}>
      {wide ? (
        <div className="flex items-center gap-6">
          <h2 className={clsx(TITLE, 'shrink-0')}>{copy.title}</h2>
          {pickers}
        </div>
      ) : (
        <>
          <h2 className={TITLE}>{copy.title}</h2>
          {pickers}
        </>
      )}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">{copy.none}</p>
      ) : (
        <ul className={clsx('-mx-2 mt-3', wide && 'grid grid-cols-2 gap-x-6')}>
          {rows.map((row) => {
            const diff = row.b - row.a
            const color = categoryColor(categories, row.categoryId)
            return (
              <li key={row.categoryId}>
                <button type="button" onClick={() => onSelect(row.categoryId, b)} className={ROW_BUTTON}>
                  <CategoryBadge categories={categories} id={row.categoryId} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-bold">{categories.find((c) => c.id === row.categoryId)?.name}</span>
                      <span className={clsx('inline-flex shrink-0 items-center gap-0.5 text-xs font-bold', Math.round(diff) === 0 ? 'text-muted' : diff > 0 ? 'text-crit-ink' : 'text-good-ink')}>
                        {Math.round(diff) !== 0 && (diff > 0 ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />)}
                        {Math.round(diff) === 0 ? copy.same : diff > 0 ? copy.more(money(diff)) : copy.less(money(-diff))}
                      </span>
                    </span>
                    <span className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted">
                      <span className="block h-1.5 rounded-full bg-surface-2">
                        <span className="block h-full rounded-full opacity-45" style={{ width: `${max > 0 ? (row.a / max) * 100 : 0}%`, background: color }} />
                      </span>
                      <span>{money(row.a)}</span>
                      <span className="block h-1.5 rounded-full bg-surface-2">
                        <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (row.b / max) * 100 : 0}%`, background: color }} />
                      </span>
                      <span className="font-bold text-ink">{money(row.b)}</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted in-data-quiet:sr-only">{copy.note}</p>
    </section>
  )
}

/** The last pay cycles of something as small bars, the one shown picked out: click one to see it. */
export function CycleBars({ points, selected, currency, color, onSelect, fill }: { points: { cycle: Cycle; amount: number }[]; selected: string; currency: string; color: string; onSelect: (cycle: Cycle) => void; /** Grow to the height of what holds it, beside a taller card. */ fill?: boolean }) {
  const highest = Math.max(0, ...points.map((p) => p.amount))
  return (
    <div className={clsx('grid items-end gap-1.5', fill ? 'h-full min-h-32' : 'h-32')} style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map(({ cycle, amount }) => {
        const on = cycle.start === selected
        const range = t.format.range(cycle.start, cycle.end)
        return (
          <button
            key={cycle.start}
            type="button"
            aria-pressed={on}
            aria-label={t.insights.lastCyclesLabel(range, formatMoney(amount, currency))}
            title={`${range}: ${formatMoney(amount, currency)}`}
            onClick={() => onSelect(cycle)}
            className="group flex h-full flex-col justify-end gap-1 rounded-lg px-0.5 pt-1 transition-colors hover:bg-surface-2"
          >
            <span aria-hidden className="text-center text-[0.6875rem] font-bold tabular-nums text-muted">
              {amount > 0 ? formatCompact(amount, highest) : ''}
            </span>
            <span aria-hidden className={clsx('block min-h-0.5 rounded-t-[4px] transition-opacity', !on && 'opacity-45 group-hover:opacity-75')} style={{ height: `${highest > 0 ? (amount / highest) * 62 : 0}%`, background: color }} />
            <span aria-hidden className={clsx('truncate text-center text-[0.8125rem] font-semibold', on ? 'text-ink' : 'text-muted')}>
              {t.format.month(cycle.start)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
