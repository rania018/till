import clsx from 'clsx'
import { Ellipsis } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n'
import { categoryColor } from '../../lib/categoryTree'
import { inMainCurrency } from '../../lib/currency'
import { previousCycle, type Cycle } from '../../lib/dates'
import { formatCompact, formatMoney } from '../../lib/money'
import { mainCategoryBreakdown } from '../../lib/stats'
import { useAppStore } from '../../store'
import type { Category, ID, Transaction } from '../../types'
import { categoryStatsLink } from '../insights/period'
import { CategoryBadge } from '../ui/CategoryBadge'
import { CardHeader, SeeAll } from './HomeCards'

/** The slice for every main category past the ones listed: neutral, since "Other" is a main category with its own colour. */
const REST = 'rest'
const REST_COLOR = 'color-mix(in oklab, var(--muted) 45%, transparent)'
/** The gap between slices, in px along the ring. */
const GAP = 2.5

interface Slice {
  id: ID
  spent: number
  share: number
  color: string
}

interface WhereItWentCardProps {
  transactions: Transaction[]
  categories: Category[]
  cycle: Cycle
  currency: string
  /** How many main categories get their own row; the rest share one. */
  rows?: number
  size?: number
  /** The ring above the rows, for a narrow, tall spot. */
  stacked?: boolean
  className?: string
}

/**
 * This pay cycle's spending by main category at a glance: a small ring and the biggest few,
 * each opening its own stats. A drawn SVG, so Home doesn't load the chart library for it.
 * Nothing shows until something has been spent.
 */
export function WhereItWentCard({ transactions, categories, cycle, currency, rows = 4, size = 112, stacked = false, className }: WhereItWentCardProps) {
  const copy = t.home.whereItWent
  const navigate = useNavigate()
  const salary = useAppStore((s) => s.profile.salary)
  const [active, setActive] = useState<ID | null>(null)

  const { slices, restCount } = useMemo(() => {
    const mains = mainCategoryBreakdown(inMainCurrency(transactions, currency), cycle, previousCycle(cycle, salary), categories)
    // One more row than asked is shown as itself, not as "1 more".
    const listed = mains.length > rows + 1 ? mains.slice(0, rows) : mains
    const rest = mains.slice(listed.length)
    const out: Slice[] = listed.map((r) => ({ id: r.categoryId, spent: r.spent, share: r.share, color: categoryColor(categories, r.categoryId) }))
    if (rest.length > 0) {
      out.push({ id: REST, spent: rest.reduce((sum, r) => sum + r.spent, 0), share: rest.reduce((sum, r) => sum + r.share, 0), color: REST_COLOR })
    }
    return { slices: out, restCount: rest.length }
  }, [transactions, currency, cycle, salary, categories, rows])

  if (slices.length === 0) return null

  const total = slices.reduce((sum, s) => sum + s.spent, 0)
  const name = (id: ID) => (id === REST ? copy.more(restCount) : (categories.find((c) => c.id === id)?.name ?? ''))
  const percent = (share: number) => `${Math.round(share * 100)}%`
  const open = (id: ID) => navigate(id === REST ? '/activity' : categoryStatsLink(id, cycle, salary))
  const shown = slices.find((s) => s.id === active)

  // The ring: one circle per slice, each drawn as a dash along it, starting at the top and going clockwise.
  const stroke = size * 0.15
  const radius = (size - stroke) / 2
  const around = 2 * Math.PI * radius
  const gap = slices.length > 1 ? GAP : 0
  let offset = 0
  const arcs = slices.map((slice) => {
    const length = slice.share * around
    const arc = { slice, dash: Math.max(length - gap, 0.75), offset }
    offset += length
    return arc
  })

  return (
    <section className={clsx('rounded-2xl border border-line bg-surface p-4 desk:p-5', stacked && 'flex flex-col', className)}>
      <CardHeader title={copy.title} action={<SeeAll to="/activity" label={copy.seeAll} />} />
      <div className={clsx('flex items-center', stacked ? 'flex-1 flex-col justify-center gap-5' : 'gap-4 desk:gap-6')}>
        <figure className="relative shrink-0" style={{ width: size, height: size }} onMouseLeave={() => setActive(null)}>
          <svg
            role="img"
            aria-label={`${copy.label}. ${slices.map((s) => t.stats.ring.label(name(s.id), percent(s.share), formatMoney(s.spent, currency))).join('. ')}`}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
          >
            {arcs.map(({ slice, dash, offset }) => (
              <circle
                key={slice.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${around}`}
                strokeDashoffset={-offset}
                opacity={active === null || active === slice.id ? 1 : 0.28}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setActive(slice.id)}
                onClick={() => open(slice.id)}
              />
            ))}
          </svg>
          <figcaption aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <span>
              <span className="block text-[0.6875rem] font-semibold text-muted">{shown ? percent(shown.share) : t.home.spent}</span>
              <span className="block text-base font-extrabold leading-tight tabular-nums">{formatCompact(shown ? shown.spent : total)}</span>
            </span>
          </figcaption>
        </figure>

        <ul className={clsx('min-w-0', stacked ? 'w-full' : 'flex-1')}>
          {slices.map((slice) => (
            <li key={slice.id}>
              <button
                type="button"
                onClick={() => open(slice.id)}
                onMouseEnter={() => setActive(slice.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(slice.id)}
                onBlur={() => setActive(null)}
                className={clsx('-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-xl px-2 py-1 text-start transition-colors hover:bg-surface-2', active === slice.id && 'bg-surface-2')}
              >
                {slice.id === REST ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg text-ink" style={{ background: REST_COLOR }}>
                    <Ellipsis aria-hidden className="size-4" />
                  </span>
                ) : (
                  <CategoryBadge categories={categories} id={slice.id} size="sm" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-5">{name(slice.id)}</span>
                  <span className="block text-xs leading-4 text-muted tabular-nums">{percent(slice.share)}</span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(slice.spent, currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
