import { t } from '../../i18n'
import type { DebtView } from '../../lib/debts'
import type { ISODate } from '../../types'

/** The line that says what's next for a debt: a payment, a due date, or that there's none. */
export function debtNextLine(view: DebtView, money: (amount: number) => string, today: ISODate): string {
  const copy = t.debts
  const { plan, nextDate, nextAmount, status } = view
  if (!nextDate) return copy.noDate
  const when = t.format.nearDay(nextDate, today)
  if (plan.nextDate && nextAmount !== undefined) return (status === 'overdue' ? copy.paymentLate : copy.nextPayment)(money(nextAmount), when)
  return (status === 'overdue' ? copy.wasDue : copy.dueOn)(when)
}
