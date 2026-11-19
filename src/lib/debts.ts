import { differenceInCalendarDays } from 'date-fns'
import type { Debt, DebtCharge, DebtRepeat, ID, ISODate, Transaction, TransactionType } from '../types'
import { billDueDates } from './bills'
import { byCurrency, isMainCurrency, type CurrencyAmount } from './currency'
import { fromISODate, isWithin } from './dates'
import { live } from './id'
import { roundMoney, sumAmounts } from './money'

/** Lending and borrowing are mirror images: this says which way a move goes for this debt. */
export function isRepayment(debt: Pick<Debt, 'direction'>, type: TransactionType): boolean {
  return debt.direction === 'lent' ? type === 'debt-in' : type === 'debt-out'
}

/** The transaction type for paying back, or for adding to, a debt. */
export function debtMoveType(debt: Pick<Debt, 'direction'>, repay: boolean): Extract<TransactionType, 'debt-in' | 'debt-out'> {
  return (debt.direction === 'lent') === repay ? 'debt-in' : 'debt-out'
}

/** How much of the debt an entry moved: paying a USD debt in dinars says what it cleared. */
function debtAmountOf(t: Transaction): number {
  return t.debtAmount ?? t.amount
}

function debtMoves(debtId: ID, transactions: Transaction[]): Transaction[] {
  return live(transactions).filter((t) => t.debtId === debtId && (t.type === 'debt-in' || t.type === 'debt-out'))
}

/** What's still owed, up to `upTo` if given. Never below 0: an edit or undo elsewhere can't make it negative. */
export function debtOwed(debt: Debt, transactions: Transaction[], upTo?: ISODate): number {
  let owed = debt.startingAmount
  for (const charge of debt.charges ?? []) {
    if (!upTo || charge.date <= upTo) owed += charge.amount
  }
  for (const t of debtMoves(debt.id, transactions)) {
    if (upTo && t.date > upTo) continue
    owed += isRepayment(debt, t.type) ? -debtAmountOf(t) : debtAmountOf(t)
  }
  return Math.max(0, roundMoney(owed))
}

/** An amount on a debt that never went through a wallet, so it isn't a transaction. Listed beside them in Activity. */
export interface NoMoneyEntry {
  id: string
  debt: Debt
  date: ISODate
  amount: number
  note?: string
  /** Left out for what the debt started with. */
  charge?: DebtCharge
}

/** What every live debt added with no money moved. A deleted debt's go with it: they touch no wallet, and nothing could edit them. */
export function noMoneyEntries(debts: Debt[]): NoMoneyEntry[] {
  return live(debts).flatMap((debt) => [
    ...(debt.charges ?? []).map((charge): NoMoneyEntry => ({ id: charge.id, debt, date: charge.date, amount: charge.amount, note: charge.note, charge })),
    ...(debt.startingAmount > 0 ? [{ id: `${debt.id}-start`, debt, date: debt.date, amount: debt.startingAmount, note: debt.note }] : []),
  ])
}

export type DebtStatus = 'overdue' | 'due-soon' | 'open' | 'settled' | 'closed'

/** This debt's instalments in a pay cycle. All zero without a payment plan. */
export interface DebtPlan {
  /** What should be paid this cycle: never more than what's owed. */
  planned: number
  paid: number
  /** Still to pay this cycle. */
  unpaid: number
  /** When the next unpaid instalment falls due. */
  nextDate?: ISODate
}

const NO_PLAN: DebtPlan = { planned: 0, paid: 0, unpaid: 0 }

type Range = { start: ISODate; end: ISODate }

/** Days before a due date that a debt shows as due soon, the same as bills. */
const DUE_SOON_DAYS = 3

/** Instalments of borrowed money that fall due in this cycle, and how much of them has been paid. */
export function debtPlan(debt: Debt, transactions: Transaction[], cycle: Range): DebtPlan {
  const monthly = debt.monthlyPayment ?? 0
  if (debt.deleted || debt.archived || debt.direction !== 'borrowed' || monthly <= 0 || !debt.firstPaymentDate) return NO_PLAN
  const dates = billDueDates(
    { frequency: 'monthly', active: true, startDate: debt.firstPaymentDate, dueDay: fromISODate(debt.firstPaymentDate).getDate() },
    cycle,
  )
  if (dates.length === 0) return NO_PLAN
  const paid = sumAmounts(debtMoves(debt.id, transactions).filter((t) => isRepayment(debt, t.type) && isWithin(t.date, cycle)).map(debtAmountOf))
  // Payments made this cycle don't lower what was due this cycle.
  const owedThisCycle = roundMoney(debtOwed(debt, transactions, cycle.end) + paid)
  const planned = Math.min(roundMoney(monthly * dates.length), owedThisCycle)
  const unpaid = Math.max(0, roundMoney(planned - paid))
  return { planned, paid, unpaid, nextDate: unpaid > 0 ? dates[Math.min(Math.floor(paid / monthly), dates.length - 1)] : undefined }
}

/** The debt with this person, on this side and in this currency: lending to someone again adds to what they already owe. */
export function findDebtWith(debts: Debt[], person: string, direction: Debt['direction'], currency?: string): Debt | undefined {
  const name = person.trim().toLowerCase()
  return live(debts).find((d) => !d.archived && d.direction === direction && d.currency === currency && d.person.trim().toLowerCase() === name)
}

export interface DueRepeat {
  debt: Debt
  repeat: DebtRepeat
  dueDate: ISODate
}

function repeatDates(repeat: DebtRepeat, today: ISODate): ISODate[] {
  const end = repeat.stoppedAt && repeat.stoppedAt < today ? repeat.stoppedAt : today
  return billDueDates({ frequency: 'monthly', active: true, startDate: repeat.startDate, dueDay: fromISODate(repeat.startDate).getDate() }, { start: repeat.startDate, end })
}

/** Months of repeating charges waiting for the person's OK, oldest first. Nothing is ever added without it. */
export function dueRepeats(debts: Debt[], today: ISODate): DueRepeat[] {
  const due: DueRepeat[] = []
  for (const debt of live(debts).filter((d) => !d.archived)) {
    for (const repeat of debt.repeats ?? []) {
      const done = new Set((debt.charges ?? []).filter((c) => c.repeatId === repeat.id).map((c) => c.dueDate))
      for (const dueDate of repeatDates(repeat, today)) {
        if (!done.has(dueDate) && !repeat.skipped?.includes(dueDate)) due.push({ debt, repeat, dueDate })
      }
    }
  }
  return due.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.repeat.name.localeCompare(b.repeat.name))
}

/** What was added to this debt before, to pick again with one tap: repeating ones first, then past entries by name. */
export function debtItems(debt: Debt): { name: string; amount: number; repeatId?: ID }[] {
  const items: { name: string; amount: number; repeatId?: ID }[] = (debt.repeats ?? []).filter((r) => !r.stoppedAt).map((r) => ({ name: r.name, amount: r.amount, repeatId: r.id }))
  const seen = new Set(items.map((i) => i.name.toLowerCase()))
  for (const charge of [...(debt.charges ?? [])].sort((a, b) => b.date.localeCompare(a.date))) {
    const name = charge.note?.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    items.push({ name, amount: charge.amount })
  }
  return items.slice(0, 5)
}

/** What instalments in the main currency ask for each month: comes off what's free for limits and goals. */
export function monthlyDebtPayments(debts: Debt[], transactions: Transaction[], main?: string): number {
  return sumAmounts(
    live(debts)
      .filter((d) => !d.archived && d.direction === 'borrowed' && isMainCurrency(d, main) && debtOwed(d, transactions) > 0)
      .map((d) => d.monthlyPayment ?? 0),
  )
}

export interface DebtView {
  debt: Debt
  owed: number
  /** Everything that was ever owed: the starting amount plus money lent or borrowed. */
  total: number
  repaid: number
  /** Share paid back, 0 to 1. */
  progress: number
  plan: DebtPlan
  status: DebtStatus
  /** The next date that matters: an unpaid instalment, or else the debt's due date. */
  nextDate?: ISODate
  /** What's due on that date. */
  nextAmount?: number
}

const STATUS_ORDER: Record<DebtStatus, number> = { overdue: 0, 'due-soon': 1, open: 2, settled: 3, closed: 4 }

export function debtView(debt: Debt, transactions: Transaction[], cycle: Range, today: ISODate): DebtView {
  const owed = debtOwed(debt, transactions)
  const moves = debtMoves(debt.id, transactions)
  const repaid = sumAmounts(moves.filter((t) => isRepayment(debt, t.type)).map(debtAmountOf))
  const total = roundMoney(debt.startingAmount + sumAmounts((debt.charges ?? []).map((c) => c.amount)) + sumAmounts(moves.filter((t) => !isRepayment(debt, t.type)).map(debtAmountOf)))
  const plan = debtPlan(debt, transactions, cycle)

  const open = !debt.archived && owed > 0
  const nextDate = !open ? undefined : (plan.nextDate ?? debt.dueDate)
  const nextAmount = !open || !nextDate ? undefined : plan.nextDate ? plan.unpaid : owed
  const daysUntil = nextDate ? differenceInCalendarDays(fromISODate(nextDate), fromISODate(today)) : null
  const status: DebtStatus = debt.archived
    ? 'closed'
    : owed <= 0
      ? 'settled'
      : daysUntil === null
        ? 'open'
        : daysUntil < 0
          ? 'overdue'
          : daysUntil <= DUE_SOON_DAYS
            ? 'due-soon'
            : 'open'

  return { debt, owed, total, repaid, progress: total > 0 ? Math.min(1, repaid / total) : 1, plan, status, nextDate, nextAmount }
}

/** Every debt, the ones that need attention first. */
export function debtViews(debts: Debt[], transactions: Transaction[], cycle: Range, today: ISODate): DebtView[] {
  return live(debts)
    .map((debt) => debtView(debt, transactions, cycle, today))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999') ||
        a.debt.person.localeCompare(b.debt.person),
    )
}

/** Each side per currency, since amounts in different currencies can't be added. */
export function debtTotals(views: DebtView[], main: string): { iOwe: CurrencyAmount[]; owedToMe: CurrencyAmount[] } {
  const sum = (direction: Debt['direction']) =>
    byCurrency(
      views.filter((v) => !v.debt.archived && v.debt.direction === direction).map((v) => ({ currency: v.debt.currency ?? main, amount: v.owed })),
      main,
    )
  return { iOwe: sum('borrowed'), owedToMe: sum('lent') }
}

