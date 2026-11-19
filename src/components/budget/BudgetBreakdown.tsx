import clsx from 'clsx'
import { t } from '../../i18n'
import type { BudgetSummary } from '../../lib/budget'
import { payLabel } from './budgetText'
import { formatMoney } from '../../lib/money'

interface BudgetBreakdownProps {
  summary: Pick<BudgetSummary, 'salary' | 'otherIncome' | 'billsReserved' | 'savingsReserved' | 'fromSavings' | 'fromFunds' | 'debtIn' | 'debtOut' | 'exchangedOut' | 'exchangedBack' | 'flexibleBudget' | 'flexibleSpent' | 'leftToSpend' | 'waitingFor' | 'stillExpected' | 'share' | 'irregular' | 'onEstimate' | 'received'>
  currency: string
  /** On the accent card. */
  inverse?: boolean
  className?: string
}

/** Where "left to spend" comes from: salary, less bills, savings and spending, one line each. */
export function BudgetBreakdown({ summary, currency, inverse, className }: BudgetBreakdownProps) {
  const copy = t.breakdown
  const money = (amount: number) => formatMoney(amount, currency)
  const muted = inverse ? 'opacity-85' : 'text-muted'
  const leftOnceArrived = summary.leftToSpend + summary.waitingFor
  // With no money at all, the sentence under the amount already says so.
  const nothingArrived = summary.salary + summary.otherIncome + summary.waitingFor <= 0
  const rows: { label: string; amount: string; strong?: boolean }[] = [
    { label: payLabel(summary), amount: money(summary.salary) },
    ...(summary.otherIncome > 0 ? [{ label: copy.otherIncome, amount: `+ ${money(summary.otherIncome)}` }] : []),
    ...(summary.waitingFor > 0 ? [{ label: copy.notHereYet, amount: `+ ${money(summary.waitingFor)}` }] : []),
    ...(summary.debtIn > 0 ? [{ label: copy.debtIn, amount: `+ ${money(summary.debtIn)}` }] : []),
    ...(summary.exchangedBack > 0 ? [{ label: copy.exchangedBack, amount: `+ ${money(summary.exchangedBack)}` }] : []),
    { label: copy.bills, amount: `− ${money(summary.billsReserved)}` },
    ...(summary.debtOut > 0 ? [{ label: copy.debtOut, amount: `− ${money(summary.debtOut)}` }] : []),
    ...(summary.exchangedOut > 0 ? [{ label: copy.exchangedOut, amount: `− ${money(summary.exchangedOut)}` }] : []),
    { label: copy.savings, amount: `− ${money(summary.savingsReserved)}` },
    { label: copy.spent, amount: `− ${money(summary.flexibleSpent)}` },
    // While pay is on its way the sum says what it will be, so the lines above still add up.
    { label: summary.waitingFor > 0 ? copy.leftOnceArrived : copy.left, amount: money(leftOnceArrived), strong: true },
  ]

  return (
    <div className={className}>
      <dl className="text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className={clsx('flex items-baseline justify-between gap-3 py-1', row.strong && clsx('mt-1 border-t pt-2 font-extrabold', inverse ? 'border-on-accent/25' : 'border-line'))}
          >
            <dt className={clsx(!row.strong && 'font-semibold', !row.strong && muted)}>{row.label}</dt>
            <dd className="whitespace-nowrap tabular-nums">{row.amount}</dd>
          </div>
        ))}
      </dl>
      {summary.fromSavings > 0 && <p className={clsx('mt-1 text-xs', muted)}>{copy.fromSavings(money(summary.fromSavings))}</p>}
      {summary.fromFunds > 0 && <p className={clsx('mt-1 text-xs', muted)}>{t.funds.breakdownNote(money(summary.fromFunds))}</p>}
      {summary.onEstimate && summary.received < summary.salary && <p className={clsx('mt-1 text-xs', muted)}>{copy.receivedOfEstimate(money(summary.received))}</p>}
      {summary.stillExpected > 0 && <p className={clsx('mt-1 text-xs', muted)}>{copy.stillExpected(money(summary.stillExpected))}</p>}
      {summary.share < 1 && <p className={clsx('mt-1 text-xs', muted)}>{copy.cycleShare}</p>}
      {leftOnceArrived + summary.flexibleSpent <= 0 && !nothingArrived && <p className={clsx('mt-1 text-xs font-semibold', inverse ? '' : 'text-warn-ink')}>{copy.overCommitted}</p>}
    </div>
  )
}
