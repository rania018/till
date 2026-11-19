import clsx from 'clsx'
import { Pencil, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { ForecastLine } from '../budget/ForecastLine'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import type { CycleBill, CycleBills } from '../../lib/bills'
import { leftShown, type BudgetSummary } from '../../lib/budget'
import type { DebtView } from '../../lib/debts'
import type { GoalView } from '../../lib/goals'
import { progressPercent } from '../../lib/goals'
import type { Bill, Category, ID, ISODate, Transaction } from '../../types'
import { budgetNote, payLabel } from '../budget/budgetText'
import { DebtStatusChip } from '../debts/DebtStatusChip'
import { GoalStatusChip } from '../goals/GoalStatusChip'
import { CardHeader } from '../home/HomeCards'
import { Button, IconButton } from '../ui/Button'
import { CategoryBadge } from '../ui/CategoryBadge'
import { Icon } from '../ui/Icon'
import { ProgressBar } from '../ui/ProgressBar'
import { FLOW } from '../stats/chartTheme'
import { StatusChip } from '../ui/StatusChip'
import { AmountOf, Panel } from './Panel'
import { fromWide, fromXl, nameGivesWay, rowButtonClass, rowClass, stretchedClass, tableClass, tdClass, thClass } from './tableStyles'

const TONES = { ok: 'accent', warning: 'warn', over: 'crit' } as const

interface BudgetTerm {
  label: string
  amount: number
  sign?: '+' | '−'
  /** Money going out gets a color, matching its slice of the bar. */
  color?: string
}

interface BudgetOverviewProps {
  summary: BudgetSummary
  money: (amount: number) => string
  /** How to read the thin mark on the bar. */
  note: string
  showPace: boolean
}

/** What's left to spend on one card; beside it, a bar of where the pay has gone and the sum behind it. */
export function BudgetOverview({ summary, money, note, showPace }: BudgetOverviewProps) {
  const copy = t.breakdown
  const optional = (show: boolean, term: BudgetTerm): BudgetTerm[] => (show ? [term] : [])
  const terms: BudgetTerm[] = [
    { label: payLabel(summary), amount: summary.salary },
    ...optional(summary.otherIncome > 0, { label: copy.otherIncome, amount: summary.otherIncome, sign: '+' }),
    ...optional(summary.waitingFor > 0, { label: copy.notHereYet, amount: summary.waitingFor, sign: '+' }),
    ...optional(summary.debtIn > 0, { label: copy.debtIn, amount: summary.debtIn, sign: '+' }),
    ...optional(summary.exchangedBack > 0, { label: copy.exchangedBack, amount: summary.exchangedBack, sign: '+' }),
    { label: copy.bills, amount: summary.billsReserved, sign: '−', color: FLOW.bills },
    ...optional(summary.debtOut > 0, { label: copy.debtOut, amount: summary.debtOut, sign: '−', color: FLOW.debts }),
    ...optional(summary.exchangedOut > 0, { label: copy.exchangedOut, amount: summary.exchangedOut, sign: '−', color: 'var(--color-series-other)' }),
    { label: copy.savings, amount: summary.savingsReserved, sign: '−', color: FLOW.goals },
    { label: copy.spent, amount: summary.flexibleSpent, sign: '−', color: FLOW.everyday },
  ]
  const slices = terms.filter((term) => term.color && term.amount > 0)
  const gone = slices.reduce((all, term) => all + term.amount, 0)
  const unused = Math.max(0, summary.leftToSpend)
  // With nothing to spend, a share of it means nothing: the bar is simply full. It's empty while pay is on its way.
  const waiting = summary.waitingFor > 0
  const hasBudget = summary.flexibleBudget > 0 && !waiting
  const used = waiting ? 0 : hasBudget ? summary.usedRatio : 1
  return (
    <div className="@container">
    <div className="grid gap-6 @min-[66rem]:grid-cols-3">
      <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-muted">{copy.left}</p>
        <p className={clsx('mt-1 whitespace-nowrap text-4xl font-extrabold tabular-nums tracking-tight', leftShown(summary) < 0 ? 'text-crit-ink' : 'text-accent')}>{money(leftShown(summary))}</p>
        <p className="mt-1 text-sm text-muted">{budgetNote(summary, money)}</p>
        {/* Any height the card beside it adds goes here, keeping the bar and what explains it together at the bottom. */}
        <div aria-hidden className="min-h-4 grow" />
        <div title={note}>
          <ProgressBar value={used} tone={used >= 1 ? 'crit' : showPace && summary.spendingTooFast ? 'warn' : 'accent'} marker={showPace ? summary.progress.elapsedRatio : undefined} label={t.budgetTab.totalLabel} />
          <p className="sr-only">{note}</p>
        </div>
        {hasBudget && <p className="mt-2 text-sm text-muted">{t.budgetTab.usedPercent(Math.round(summary.usedRatio * 100))}</p>}
        {showPace && <ForecastLine summary={summary} money={money} className="mt-1" />}
        {summary.stillExpected > 0 && <p className="mt-1 text-sm text-muted">{copy.stillExpected(money(summary.stillExpected))}</p>}
        {summary.share < 1 && <p className="mt-1 text-sm text-muted">{copy.cycleShare}</p>}
      </section>

      <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 @min-[66rem]:col-span-2">
        <CardHeader title={t.stats.flow.title} />
        {/* The numbers below say the same thing, so the bar is only a picture of them. */}
        <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {slices.map((slice) => (
            <span key={slice.label} title={`${slice.label}: ${money(slice.amount)}`} className="min-w-1" style={{ flexGrow: slice.amount, flexBasis: 0, background: slice.color }} />
          ))}
          {(unused > 0 || gone === 0) && <span title={`${copy.left}: ${money(summary.leftToSpend)}`} className="min-w-1 bg-surface-2" style={{ flexGrow: unused || 1, flexBasis: 0 }} />}
        </div>
        {/* A running sum, read down the columns and ending on what's left. */}
        <dl className="mt-3 flex-1 columns-2 gap-x-10">
          {terms.map((term) => (
            <div key={term.label} className="flex break-inside-avoid items-baseline justify-between gap-4 py-1.5">
              <dt className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-muted">
                <span aria-hidden className="size-2.5 shrink-0 translate-y-px rounded-[3px]" style={{ background: term.color ?? 'transparent' }} />
                {term.label}
              </dt>
              <dd className={clsx('whitespace-nowrap font-extrabold tabular-nums', term.amount === 0 && 'font-semibold text-muted')}>
                {term.sign && <span className="me-1 font-semibold text-muted">{term.sign}</span>}
                {money(term.amount)}
              </dd>
            </div>
          ))}
          <div className="flex break-inside-avoid items-baseline justify-between gap-4 border-t border-line py-1.5">
            <dt className="flex items-baseline gap-2 text-sm font-extrabold">
              <span aria-hidden className="size-2.5 shrink-0 translate-y-px rounded-[3px] bg-surface-2" />
              {copy.left}
            </dt>
            <dd className={clsx('whitespace-nowrap font-extrabold tabular-nums', leftShown(summary) < 0 ? 'text-crit-ink' : 'text-accent')}>{money(leftShown(summary))}</dd>
          </div>
        </dl>
      </section>
    </div>
    </div>
  )
}

interface LimitsTableProps {
  summary: BudgetSummary
  byId: Map<ID, Category>
  unlimited: { categoryId: ID; spent: number }[]
  money: (amount: number) => string
  linkFor: (categoryId: ID) => string
  showPace: boolean
  aside: ReactNode
}

/** One line per category: how much of its limit is used, and what's left. */
export function LimitsTable({ summary, byId, unlimited, money, linkFor, showPace, aside }: LimitsTableProps) {
  const copy = t.desk.table
  const budget = t.budgetTab
  const name = (id: ID) => byId.get(id)?.name ?? ''
  const categories = [...byId.values()]
  const nameCell = (id: ID) => (
    <Link to={linkFor(id)} className={clsx(stretchedClass, 'flex min-w-0 items-center gap-3')}>
      <CategoryBadge categories={categories} id={id} size="sm" />
      <span className="truncate">{name(id)}</span>
      <span className="sr-only">. {budget.seeExpenses(name(id))}</span>
    </Link>
  )
  return (
    <Panel title={budget.limitsTitle} aside={aside}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th scope="col" className={clsx(thClass(), 'xl:w-64')}>
              {copy.category}
            </th>
            <th scope="col" className={thClass()}>
              {copy.used}
            </th>
            <th scope="col" className={thClass({ right: true })}>
              {copy.spent}
            </th>
            <th scope="col" className={clsx(thClass({ right: true }), fromXl)}>
              {copy.limit}
            </th>
            <th scope="col" className={thClass({ right: true })}>
              {copy.left}
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.categories.map((row) => (
            <tr key={row.categoryId} className={rowClass}>
              <td className={clsx(tdClass(), nameGivesWay)}>{nameCell(row.categoryId)}</td>
              <td className={clsx(tdClass(), 'w-[45%]')}>
                <div className="flex items-center gap-4">
                  <ProgressBar value={row.ratio} tone={TONES[row.level]} marker={showPace ? summary.progress.elapsedRatio : undefined} label={budget.barLabel(name(row.categoryId))} className="min-w-16 flex-1" />
                  <span className="w-12 shrink-0 text-end text-sm font-semibold tabular-nums text-muted">{Math.round(row.ratio * 100)}%</span>
                  <span className="w-28 shrink-0">
                    {row.level === 'warning' && <StatusChip tone="warn">{budget.nearLimit}</StatusChip>}
                    {row.level === 'over' && <StatusChip tone="crit">{copy.over}</StatusChip>}
                  </span>
                </div>
              </td>
              <td className={tdClass({ right: true, strong: true })}>{money(row.spent)}</td>
              <td className={clsx(tdClass({ right: true, muted: true }), fromXl)}>{money(row.budget)}</td>
              <td className={clsx(tdClass({ right: true }), row.remaining < 0 ? 'font-bold text-crit-ink' : 'text-ink-2')}>{money(row.remaining)}</td>
            </tr>
          ))}
          {unlimited.length > 0 && (
            <tr>
              <th colSpan={5} scope="colgroup" className="border-b border-line bg-bg px-5 py-2.5 text-start text-sm font-semibold text-muted">
                {budget.noLimitTitle}
              </th>
            </tr>
          )}
          {unlimited.map(({ categoryId, spent }) => (
            <tr key={categoryId} className={rowClass}>
              <td className={clsx(tdClass(), nameGivesWay)}>{nameCell(categoryId)}</td>
              <td className={tdClass()} />
              <td className={tdClass({ right: true, strong: true })}>{money(spent)}</td>
              <td className={clsx(tdClass({ right: true, muted: true }), fromXl)}>–</td>
              <td className={tdClass({ right: true, muted: true })}>–</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

/** Every row the same height, with or without a button in it. */
const EVEN_ROW = '[&>td]:h-14'

interface BillsTableProps {
  result: CycleBills
  transactions: Map<ID, Transaction>
  iconFor: (bill: Bill) => string
  walletName: (id: ID) => string
  money: (amount: number) => string
  onOpen: (bill: Bill) => void
  onOpenPayment: (payment: Transaction) => void
  onMarkPaid: (bill: Bill) => void
  aside: ReactNode
  /** What the bill's fund holds, for a bill that has one. */
  fundLine?: (bill: Bill) => string | undefined
}

/** This cycle's bills, then the ones not due until later. */
export function BillsTable({ result, transactions, iconFor, walletName, money, onOpen, onOpenPayment, onMarkPaid, aside, fundLine }: BillsTableProps) {
  const copy = t.desk.table
  const bills = t.billsTab
  const billCell = (bill: Bill, quiet?: boolean) => {
    const fund = fundLine?.(bill)
    return (
      <button type="button" onClick={() => onOpen(bill)} className={clsx(stretchedClass, 'flex min-w-0 items-center gap-3')}>
        <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', quiet ? 'bg-surface-2 text-ink-2' : 'bg-accent-soft text-accent')}>
          <Icon name={iconFor(bill)} className="size-4" />
        </span>
        <span className="truncate">{bill.name}</span>
        {/* Only where the table has room for it: the name column has to give way below that. */}
        {fund && <span className="hidden min-w-0 truncate text-sm font-normal text-muted min-[1500px]:inline">{fund}</span>}
      </button>
    )
  }
  const row = ({ bill, occurrence }: CycleBill) => {
    const payment = occurrence.paymentId ? transactions.get(occurrence.paymentId) : undefined
    const paid = occurrence.status === 'paid'
    return (
      <tr key={`${bill.id}-${occurrence.dueDate}`} className={clsx(rowClass, EVEN_ROW)}>
        <td className={clsx(tdClass(), nameGivesWay)}>{billCell(bill)}</td>
        <td className={clsx(tdClass({ muted: !(occurrence.status === 'overdue') }), 'whitespace-nowrap', occurrence.status === 'overdue' && 'font-semibold text-crit-ink')}>
          {t.format.shortDay(paid && payment ? payment.date : occurrence.dueDate)}
        </td>
        <td className={clsx(tdClass({ muted: true }), fromWide)}>{t.format.frequency[bill.frequency]}</td>
        <td className={clsx(tdClass({ muted: true }), fromXl)}>{walletName(payment?.accountId ?? bill.accountId)}</td>
        <td className={tdClass({ right: true, strong: true })}>{money(payment?.amount ?? bill.amount)}</td>
        <td className={clsx(tdClass(), 'relative z-[1] w-40 whitespace-nowrap text-end')}>
          {paid && payment ? (
            <button type="button" onClick={() => onOpenPayment(payment)} aria-label={bills.editPayment(bill.name)} className="rounded-full">
              <StatusChip tone="good">{bills.status.paid}</StatusChip>
            </button>
          ) : (
            <div className="flex items-center justify-end gap-2">
              {occurrence.status === 'overdue' && <StatusChip tone="crit">{bills.status.overdue}</StatusChip>}
              {occurrence.status === 'due-soon' && <StatusChip tone="warn">{bills.status['due-soon']}</StatusChip>}
              <button
                type="button"
                onClick={() => onMarkPaid(bill)}
                aria-label={bills.markPaidLabel(bill.name)}
                className={occurrence.status === 'upcoming' ? rowButtonClass : 'inline-flex min-h-9 items-center rounded-xl bg-accent px-3 text-sm font-bold text-on-accent transition hover:brightness-110'}
              >
                {bills.markPaid}
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }
  return (
    <Panel title={t.plan.bills} aside={aside}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th scope="col" className={thClass()}>
              {copy.bill}
            </th>
            <th scope="col" className={thClass()}>
              {copy.due}
            </th>
            <th scope="col" className={clsx(thClass(), fromWide)}>
              {copy.repeats}
            </th>
            <th scope="col" className={clsx(thClass(), fromXl)}>
              {copy.wallet}
            </th>
            <th scope="col" className={thClass({ right: true })}>
              {copy.amount}
            </th>
            <th scope="col" className={thClass({ right: true })}>
              {copy.status}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.due.map(row)}
          {result.notDue.length > 0 && (
            <tr>
              <th colSpan={6} scope="colgroup" className="border-b border-line bg-bg px-5 py-2.5 text-start text-sm font-semibold text-muted">
                {bills.notDueTitle}
              </th>
            </tr>
          )}
          {result.notDue.map(({ bill, nextDue }) => (
            <tr key={bill.id} className={clsx(rowClass, EVEN_ROW)}>
              <td className={clsx(tdClass(), nameGivesWay)}>{billCell(bill, true)}</td>
              <td className={clsx(tdClass({ muted: true }), 'whitespace-nowrap')}>{nextDue ? t.format.shortDayOrDate(nextDue, todayISO()) : bills.noNextDue}</td>
              <td className={clsx(tdClass({ muted: true }), fromWide)}>{t.format.frequency[bill.frequency]}</td>
              <td className={clsx(tdClass({ muted: true }), fromXl)}>{walletName(bill.accountId)}</td>
              <td className={tdClass({ right: true, muted: true })}>{money(bill.amount)}</td>
              <td className={tdClass()} />
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

const CARD_GRID = 'grid gap-6 @min-[48rem]:grid-cols-2 @min-[66rem]:grid-cols-3'
const FILLS = ['', '@min-[66rem]:col-span-1', '@min-[66rem]:col-span-2', '@min-[66rem]:col-span-3']
const TILE = 'relative flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/40'

/** A section of cards with its "add" button as the last one, taking whatever's left of the last row so no row has a hole in it. */
function CardGrid({ title, count, addLabel, onAdd, children }: { title: string; count: number; addLabel: string; onAdd: () => void; children: ReactNode }) {
  return (
    <section className="@container">
      <h2 className="mb-3 text-base font-extrabold">{title}</h2>
      <ul className={CARD_GRID}>
        {children}
        <li className={clsx('min-w-0', FILLS[3 - (count % 3)], count % 2 === 0 && '@min-[48rem]:@max-[66rem]:col-span-2')}>
          <button type="button" onClick={onAdd} className="flex size-full min-h-16 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm font-bold text-ink-2 transition-colors hover:border-accent/40 hover:bg-surface hover:text-ink">
            <Plus aria-hidden className="size-4" />
            {addLabel}
          </button>
        </li>
      </ul>
    </section>
  )
}

interface DebtsGridProps {
  views: DebtView[]
  /** Each debt is shown in its own currency. */
  moneyFor: (view: DebtView) => (amount: number) => string
  today: ISODate
  /** What's next: a payment, a due date, or that there's none. */
  lineFor: (view: DebtView, money: (amount: number) => string, today: ISODate) => string
  onLogPayment: (view: DebtView) => void
  onEdit: (view: DebtView) => void
  addLabel: string
  onAdd: () => void
}

/** Every open debt as a card: who, what's still owed, how far along it is, and what's next. */
export function DebtsGrid({ views, moneyFor, today, lineFor, onLogPayment, onEdit, addLabel, onAdd }: DebtsGridProps) {
  return (
    <CardGrid title={t.plan.debts} count={views.length} addLabel={addLabel} onAdd={onAdd}>
      {views.map((view) => {
        const { debt, owed, progress, repaid, total, status } = view
        const money = moneyFor(view)
        return (
          <li key={debt.id} className="min-w-0">
            <div className={TILE}>
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft font-extrabold uppercase text-accent">
                  {debt.person.trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/plan/debts/${debt.id}`} className={clsx(stretchedClass, 'block truncate font-bold')}>
                    {debt.person}
                  </Link>
                  {debt.note && <p className="truncate text-sm text-muted">{debt.note}</p>}
                </div>
                <DebtStatusChip status={status} direction={debt.direction} />
              </div>
              <p className={clsx('mt-4 whitespace-nowrap text-xl font-extrabold tabular-nums tracking-tight', debt.direction === 'lent' && 'text-good-ink')}>{t.debts.owedLine[debt.direction](money(owed))}</p>
              <ProgressBar value={progress} tone="good" label={t.debts.progressLabel(debt.person)} className="mt-3" />
              <p className="mt-2 truncate text-sm text-muted">{t.debts.paidOf(money(repaid), money(total))}</p>
              <p className="mb-4 mt-0.5 flex-1 text-sm text-muted">{lineFor(view, money, today)}</p>
              <div className="relative z-[1] flex items-center gap-2 border-t border-line pt-3">
                <Button size="sm" variant="secondary" onClick={() => onLogPayment(view)} aria-label={t.debts.logPaymentFor(debt.person)} className="flex-1 whitespace-nowrap">
                  {t.debts.logPayment}
                </Button>
                <IconButton icon={Pencil} label={t.debts.edit(debt.person)} onClick={() => onEdit(view)} />
              </div>
            </div>
          </li>
        )
      })}
    </CardGrid>
  )
}

interface GoalsGridProps {
  title: string
  views: GoalView[]
  money: (amount: number) => string
  /** What's the plan: when the money gets there, or what the deadline needs. */
  lineFor: (view: GoalView) => string
  onPutAside: (goalId: ID) => void
  addLabel: string
  onAdd: () => void
}

/** Every goal or fund as a card: how far along it is, what the plan is, and a way to add to it. */
export function GoalsGrid({ title, views, money, lineFor, onPutAside, addLabel, onAdd }: GoalsGridProps) {
  return (
    <CardGrid title={title} count={views.length} addLabel={addLabel} onAdd={onAdd}>
      {views.map((view) => {
        const { goal, forecast, status, savedThisCycle } = view
        return (
          <li key={goal.id} className="min-w-0">
            <div className={TILE}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={goal.icon} className="size-[1.125rem]" />
                </span>
                <Link to={`/plan/goals/${goal.id}`} className={clsx(stretchedClass, 'min-w-0 flex-1 truncate font-bold')}>
                  {goal.name}
                </Link>
                <GoalStatusChip status={status} fund={!!goal.fund} />
              </div>
              <p className="mt-4 text-xl font-extrabold tabular-nums tracking-tight">
                <AmountOf amount={money(forecast.saved)} of={t.desk.ofAmount(money(goal.target))} />
              </p>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar value={forecast.progress} tone={status === 'behind' ? 'warn' : status === 'overdue' ? 'crit' : 'good'} label={t.goals.progressLabel(goal.name)} className="min-w-16 flex-1" />
                <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">{progressPercent(forecast)}%</span>
              </div>
              <p className="mb-4 mt-2 flex-1 text-sm text-muted">{lineFor(view)}</p>
              {status !== 'reached' && (
                <div className="relative z-[1] flex items-center justify-between gap-3 border-t border-line pt-3">
                  <span className="min-w-0 truncate text-sm text-muted">{savedThisCycle !== 0 && t.goals.cycleSoFar(money(savedThisCycle))}</span>
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => onPutAside(goal.id)} aria-label={t.goals.putAsideFor(goal.name)} className="shrink-0 whitespace-nowrap">
                    {t.goals.putAside}
                  </Button>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </CardGrid>
  )
}
