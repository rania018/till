import clsx from 'clsx'
import { t } from '../../i18n'
import { direction } from '../../i18n/language'
import type { BudgetSummary } from '../../lib/budget'
import type { DetailPart } from '../../lib/detail'
import { formatMoney } from '../../lib/money'
import { payLabel } from '../budget/budgetText'
import { ChartCard } from './chartParts'
import { FLOW } from './chartTheme'

/** Label and bar side by side. On a phone the amount goes under the bar, with more room on a wider screen beside it. */
const ROW = 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_7.5rem]'
const AMOUNT = 'col-start-2 text-end text-sm font-extrabold tabular-nums sm:col-start-3'
/** In a narrow card: the label and amount on one line, the bar across the card under them. */
const ROW_COMPACT = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1'
const AMOUNT_COMPACT = 'col-start-2 row-start-1 text-end text-sm font-extrabold tabular-nums'
const BAR_COMPACT = 'col-span-2 row-start-2'

interface Step {
  label: string
  amount: number
  /** Money coming in adds to the running total, money going out takes from it. */
  sign: 1 | -1
  color: string
  /** The entries behind this line, where there's a way to list them. */
  part?: DetailPart
}

/**
 * From pay to what's left, each step starting where the last one ended. The same lines as the
 * budget's own sum, so it can never disagree with Home or Plan.
 */
export function PayFlow({ summary, currency, onSelect, compact }: { summary: BudgetSummary; currency: string; onSelect?: (part: DetailPart) => void; compact?: boolean }) {
  const copy = t.stats.flow
  const lines = t.breakdown
  const money = (amount: number) => formatMoney(amount, currency)
  const possible: Step[] = [
    { label: payLabel(summary), amount: summary.salary, sign: 1, color: FLOW.income, part: 'income' },
    { label: lines.otherIncome, amount: summary.otherIncome, sign: 1, color: FLOW.income, part: 'income' },
    { label: lines.debtIn, amount: summary.debtIn, sign: 1, color: FLOW.income },
    { label: lines.exchangedBack, amount: summary.exchangedBack, sign: 1, color: FLOW.income },
    { label: lines.bills, amount: summary.billsReserved, sign: -1, color: FLOW.bills, part: 'bills' },
    { label: lines.debtOut, amount: summary.debtOut, sign: -1, color: FLOW.debts },
    { label: lines.exchangedOut, amount: summary.exchangedOut, sign: -1, color: FLOW.other },
    { label: lines.savings, amount: summary.savingsReserved, sign: -1, color: FLOW.goals, part: 'goals' },
    { label: lines.spent, amount: summary.flexibleSpent, sign: -1, color: FLOW.everyday, part: 'everyday' },
  ]
  const steps = possible.filter((s) => s.amount > 0)

  let running = 0
  const spans = steps.map((step) => {
    const from = running
    running += step.sign * step.amount
    return { ...step, from, to: running }
  })
  const left = summary.leftToSpend
  const edges = [0, left, ...spans.flatMap((s) => [s.from, s.to])]
  const low = Math.min(...edges)
  const high = Math.max(...edges)
  const place = (from: number, to: number) => {
    const size = high - low || 1
    return { insetInlineStart: `${((Math.min(from, to) - low) / size) * 100}%`, width: `${(Math.abs(to - from) / size) * 100}%` }
  }
  const row = compact ? ROW_COMPACT : ROW
  const amount = compact ? AMOUNT_COMPACT : AMOUNT
  const bar = clsx('relative block rounded bg-surface-2', compact ? clsx(BAR_COMPACT, 'h-2.5') : 'h-5')
  const signed = (step: Step) => `${step.sign > 0 ? '+' : '−'} ${money(step.amount)}`
  const incoming = steps.filter((s) => s.sign > 0).reduce((sum, s) => sum + s.amount, 0)

  return (
    <ChartCard
      title={copy.title}
      note={copy.note}
      summary={copy.summary(money(incoming), money(left))}
      table={{
        caption: copy.title,
        columns: [copy.step, copy.amount],
        rows: [...steps.map((s) => [s.label, signed(s)]), [lines.left, money(left)]],
      }}
    >
      {/* Chart cards stay left to right for the chart library. This is plain boxes and text, so in Arabic it mirrors. */}
      <ul dir={direction} className={compact ? 'flex flex-1 flex-col justify-between gap-2' : 'space-y-2.5'}>
        {spans.map((step) => (
          <li key={step.label} className={clsx(row, 'relative rounded-lg has-[button:hover]:bg-surface-2')}>
            {onSelect && step.part ? (
              <button type="button" onClick={() => onSelect(step.part!)} className="min-w-0 text-start text-sm font-semibold text-ink-2 after:absolute after:inset-0 hover:text-ink">
                {step.label}
              </button>
            ) : (
              <span className="min-w-0 text-sm font-semibold text-ink-2">{step.label}</span>
            )}
            <span className={bar}>
              <span className="absolute inset-y-0 min-w-0.5 rounded" style={{ ...place(step.from, step.to), background: step.color }} />
            </span>
            <span className={amount}>{signed(step)}</span>
          </li>
        ))}
        <li className={clsx(row, 'border-t border-line pt-2.5')}>
          <span className="text-sm font-extrabold">{lines.left}</span>
          <span className={bar}>
            <span className="absolute inset-y-0 min-w-0.5 rounded" style={{ ...place(0, left), background: left < 0 ? 'var(--color-crit)' : FLOW.income }} />
          </span>
          <span className={clsx(amount, left < 0 && 'text-crit-ink')}>{money(left)}</span>
        </li>
      </ul>
    </ChartCard>
  )
}
