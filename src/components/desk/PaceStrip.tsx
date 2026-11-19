import clsx from 'clsx'
import { t } from '../../i18n'
import { formatMoney } from '../../lib/money'
import type { PacePoint } from '../../lib/stats'
import type { ISODate } from '../../types'

/** The line's height, in px: a glance, not a chart to study (Stats has that, with its table). */
const HEIGHT = 56

interface PaceStripProps {
  points: PacePoint[]
  budget: number
  currency: string
  onSelectDay: (date: ISODate) => void
  className?: string
}

/**
 * Everyday spending so far against an even pace, small enough for the budget card and drawn
 * in its colours: plain SVG, so Home doesn't load the chart library. Each day up to today
 * opens its entries; the sentence on hover says where things stand, and screen readers get it outright.
 */
export function PaceStrip({ points, budget, currency, onSelectDay, className }: PaceStripProps) {
  const copy = t.stats.pace
  const money = (amount: number) => formatMoney(amount, currency)
  const known = points.filter((p): p is PacePoint & { spent: number } => p.spent !== null)
  const last = known.at(-1)
  if (points.length === 0 || !last) return null

  const days = points.length
  const high = Math.max(budget, ...known.map((p) => p.spent)) * 1.06 || 1
  const x = (day: number) => (day / days) * 100
  const y = (amount: number) => 100 - (Math.max(0, amount) / high) * 100
  const line = ['0,100', ...known.map((p) => `${x(p.day)},${y(p.spent)}`)].join(' ')
  const area = `${line} ${x(last.day)},100`
  const summary = copy.summary(t.format.shortDay(last.date), money(last.spent), money(last.pace))

  return (
    <div className={className}>
      <h2 className="text-xs font-bold opacity-85" title={summary}>
        {copy.title}
      </h2>
      <p className="sr-only">{summary}</p>

      {/* Time runs left to right in every language, as in the other charts. */}
      <div dir="ltr" className="relative mt-2" style={{ height: HEIGHT }}>
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <polygon points={area} fill="currentColor" fillOpacity={0.12} />
          <line x1="0" y1="100" x2="100" y2={y(budget)} stroke="currentColor" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Today, as a dot that stays round however wide the card is. */}
        <span aria-hidden className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-accent ring-2 ring-accent" style={{ left: `${x(last.day)}%`, top: `${y(last.spent)}%` }} />
        {/* One target per day: the week above is the keyboard's way in, and Stats has the full chart with its table. */}
        <ol className="absolute inset-0 flex">
          {points.map((p) => (
            <li key={p.date} className="flex-1">
              <button
                type="button"
                tabIndex={-1}
                disabled={p.spent === null}
                title={p.spent === null ? t.format.shortDay(p.date) : copy.summary(t.format.shortDay(p.date), money(p.spent), money(p.pace))}
                aria-label={p.spent === null ? t.format.shortDay(p.date) : copy.summary(t.format.shortDay(p.date), money(p.spent), money(p.pace))}
                onClick={() => onSelectDay(p.date)}
                className={clsx('block size-full rounded-sm transition-colors', p.spent !== null && 'cursor-pointer hover:bg-on-accent/15')}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
