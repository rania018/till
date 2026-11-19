import clsx from 'clsx'
import { t } from '../../i18n'
import { direction } from '../../i18n/language'
import { fromISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { DaySpend } from '../../lib/stats'
import { CardHeader } from '../home/HomeCards'

/** Up to about two months, days are laid out as a calendar; longer, as a strip of weeks. */
const CALENDAR_DAYS = 62

/** Five steps of one hue: nothing spent, then four shares of the busiest day. */
const STEPS = ['bg-surface-2', 'bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'bg-accent']

function stepOf(spent: number, highest: number): number {
  if (spent <= 0 || highest <= 0) return 0
  return Math.min(4, Math.ceil((spent / highest) * 4))
}

interface DayHeatmapProps {
  days: DaySpend[]
  currency: string
  onSelect: (date: string) => void
  /** The one hue the steps are drawn in: a category's pastel on its own page, the brand colour elsewhere. */
  color?: string
  /** In a row of cards on a computer: the days fill the row's height, and the explaining goes to hover and screen readers. */
  compact?: boolean
}

/** How much of the hue each step shows, over the card. */
const SHARES = [0, 28, 48, 72, 100]

/**
 * Every day of the period, darker for the days more was spent: a calendar for a pay cycle or two,
 * a strip of weeks for longer. Each day is a button, so it reads and clicks the same with a keyboard.
 */
export function DayHeatmap({ days, currency, onSelect, color = 'var(--color-accent)', compact }: DayHeatmapProps) {
  const fill = (step: number) => (step === 0 ? undefined : { background: `color-mix(in oklab, ${color} ${SHARES[step]}%, var(--color-surface))` })
  const copy = t.stats.heatmap
  const money = (amount: number) => formatMoney(amount, currency)
  const highest = Math.max(0, ...days.map((d) => d.spent ?? 0))
  const busiest = days.find((d) => d.spent === highest && highest > 0)
  const calendar = days.length <= CALENDAR_DAYS
  const weekStart = t.format.weekStartsOn
  // Blank days before the first, so each column is one weekday.
  const lead = days.length > 0 ? (fromISODate(days[0].date).getDay() - weekStart + 7) % 7 : 0
  const cells: (DaySpend | null)[] = [...Array<null>(lead).fill(null), ...days]
  const weekdays = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7)

  const cell = (day: DaySpend | null, index: number) => {
    if (!day) return <span key={`lead-${index}`} aria-hidden />
    const future = day.spent === null
    const step = future ? -1 : stepOf(day.spent ?? 0, highest)
    const label = future ? copy.toCome(t.format.shortDay(day.date)) : copy.day(t.format.shortDay(day.date), money(day.spent ?? 0))
    return (
      <button
        key={day.date}
        type="button"
        disabled={future}
        aria-label={label}
        title={label}
        onClick={() => onSelect(day.date)}
        className={clsx(
          'rounded-[4px] transition-shadow focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent enabled:hover:ring-2 enabled:hover:ring-ink-2',
          calendar ? clsx('grid place-items-center text-[0.8125rem] font-semibold tabular-nums', !compact && 'aspect-[4/3] min-h-9') : compact ? 'aspect-square' : 'size-3.5',
          future ? clsx('bg-transparent text-muted', !compact && 'border border-dashed border-line') : step === 0 ? STEPS[0] : '',
          !future && (step >= 3 ? 'text-[#1a1222]' : 'text-ink-2'),
        )}
        style={future ? undefined : fill(step)}
      >
        {calendar && fromISODate(day.date).getDate()}
      </button>
    )
  }

  return (
    <section className={clsx('rounded-2xl border border-line bg-surface', compact ? 'flex h-full flex-col p-5' : 'p-4 desk:p-6')}>
      {compact ? (
        <>
          <CardHeader title={copy.title} />
          {busiest && <p className="sr-only">{copy.summary(money(highest), t.format.dayMonth(busiest.date))}</p>}
        </>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-extrabold">{copy.title}</h2>
          {busiest && <p className="text-sm text-muted">{copy.summary(money(highest), t.format.dayMonth(busiest.date))}</p>}
        </div>
      )}

      {highest === 0 && <p className="mt-2 text-sm text-ink-2">{copy.nothing}</p>}

      <div dir={direction} className={compact ? 'flex flex-1 flex-col' : 'mt-4'}>
        {calendar ? (
          <div className={clsx('grid grid-cols-7 gap-1.5', compact && 'flex-1')} style={compact ? { gridTemplateRows: `auto repeat(${Math.ceil(cells.length / 7)}, minmax(2.25rem, 1fr))` } : undefined}>
            {weekdays.map((d) => (
              <span key={d} aria-hidden className="pb-0.5 text-center text-xs font-bold text-muted">
                {t.format.weekdaysShort[d]}
              </span>
            ))}
            {cells.map(cell)}
          </div>
        ) : (
          compact ? (
            // Three weeks to a line, so a whole year fits a narrow card without scrolling and each column is still one weekday.
            <div className="m-auto grid w-full max-w-[22rem] grid-cols-[repeat(21,minmax(0,1fr))] gap-0.5">{cells.map(cell)}</div>
          ) : (
            <div className="overflow-x-auto pb-1">
              <div className="grid w-max grid-flow-col grid-rows-7 gap-1">{cells.map(cell)}</div>
            </div>
          )
        )}
      </div>

      <div className={clsx('mt-3 flex flex-wrap items-center gap-x-4 gap-y-2', compact ? 'justify-end' : 'justify-between')}>
        {compact ? <p className="sr-only">{copy.note}</p> : <p className="max-w-prose text-xs text-muted">{copy.note}</p>}
        <div aria-hidden className="flex items-center gap-1 text-xs font-semibold text-muted">
          {copy.less}
          {STEPS.map((step, i) => (
            <span key={step} className={clsx('size-3 rounded-[3px]', i === 0 && step)} style={fill(i)} />
          ))}
          {copy.more}
        </div>
      </div>
    </section>
  )
}
