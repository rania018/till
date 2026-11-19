import clsx from 'clsx'
import { Banknote, CreditCard, Plus, Target } from 'lucide-react'
import { ChevronRight } from '../ui/directionalIcons'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import type { CycleBills } from '../../lib/bills'
import { formatAmounts } from '../../lib/currency'
import { debtTotals, type DebtView } from '../../lib/debts'
import type { GoalView } from '../../lib/goals'
import { formatMoney } from '../../lib/money'
import type { Account, ID, ISODate } from '../../types'
import { buttonClass, touchArea } from '../ui/buttonStyles'
import { Icon } from '../ui/Icon'
import { ProgressBar } from '../ui/ProgressBar'

const card = 'rounded-2xl border border-line bg-surface p-4 desk:p-5'

/** A card title with an optional link or button on the right. */
export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
      <h2 className="text-sm font-extrabold desk:text-base">{title}</h2>
      {action}
    </div>
  )
}

export function SeeAll({ to, label = t.home.seeAll }: { to: string; label?: string }) {
  return (
    <Link to={to} className={clsx('flex min-h-9 items-center gap-0.5 rounded-lg text-xs font-bold text-accent', touchArea)}>
      {label}
      <ChevronRight aria-hidden className="size-4" />
    </Link>
  )
}

interface WalletsCardProps {
  wallets: { account: Account; balance: number }[]
  salaryAccountId: ID
  currency: string
  onCountCash: (account: Account) => void
}

export function WalletsCard({ wallets, salaryAccountId, currency, onCountCash }: WalletsCardProps) {
  const cash = wallets.find((w) => w.account.kind === 'cash')
  return (
    <section className={clsx(card, 'flex h-full flex-col')}>
      <CardHeader
        title={t.home.wallets}
        action={
          cash && (
            <button type="button" onClick={() => onCountCash(cash.account)} className={clsx('min-h-9 rounded-lg text-xs font-bold text-accent', touchArea)}>
              {t.home.countCash}
            </button>
          )
        }
      />
      {/* Beside the budget on a computer the card can be taller than its rows: they spread out rather than leave a gap at the bottom. */}
      <ul className="grid flex-1 content-around">
        {wallets.map(({ account, balance }) => {
          const WalletIcon = account.kind === 'cash' ? Banknote : CreditCard
          const detail =
            account.kind === 'cash'
              ? account.lastCountedAt
                ? t.home.counted(t.format.relative(account.lastCountedAt))
                : t.home.notCounted
              : account.id === salaryAccountId
                ? t.home.salaryLands
                : undefined
          return (
            <li key={account.id}>
              <Link to="/wallets" className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <WalletIcon aria-hidden className="size-[1.125rem]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{account.name}</span>
                  {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
                </span>
                <span className={clsx('shrink-0 font-extrabold tabular-nums', balance < 0 && 'text-crit-ink')}>{formatMoney(balance, account.currency ?? currency)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function BillsCard({ bills, currency, today }: { bills: CycleBills; currency: string; today: ISODate }) {
  if (bills.due.length === 0) return null
  const money = (amount: number) => formatMoney(amount, currency)
  const next = bills.due.find((d) => d.occurrence.status !== 'paid')
  return (
    <section className={card}>
      <CardHeader title={t.home.bills} action={<SeeAll to="/plan/bills" />} />
      <p className="font-extrabold tabular-nums">{t.home.billsPaid(money(bills.paid), money(bills.planned))}</p>
      {bills.planned > 0 && <ProgressBar value={bills.paid / bills.planned} tone="good" label={t.home.billsLabel} className="mt-2" />}
      <p className={clsx('mt-2 text-sm', next?.occurrence.status === 'overdue' ? 'font-semibold text-crit-ink' : 'text-muted')}>
        {next
          ? (next.occurrence.status === 'overdue' ? t.home.lateBill : t.home.nextBill)(next.bill.name, money(next.bill.amount), t.format.nearDay(next.occurrence.dueDate, today))
          : t.home.allPaid}
      </p>
    </section>
  )
}

/** What you owe and what's owed to you. Hidden while there's nothing open. */
export function DebtsCard({ debts, currency }: { debts: DebtView[]; currency: string }) {
  const { iOwe, owedToMe } = debtTotals(debts, currency)
  if (iOwe.length === 0 && owedToMe.length === 0) return null
  const rows = [
    { label: t.debts.iOwe, amounts: iOwe },
    { label: t.debts.owedToMe, amounts: owedToMe },
  ]
  return (
    <section className={card}>
      <CardHeader title={t.debts.homeTitle} action={<SeeAll to="/plan/debts" />} />
      <dl className="grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-semibold text-muted">{row.label}</dt>
            <dd className="font-extrabold tabular-nums">{formatAmounts(row.amounts, currency)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function GoalsCard({ goals, currency }: { goals: GoalView[]; currency: string }) {
  const money = (amount: number) => formatMoney(amount, currency)
  if (goals.length === 0) {
    return (
      <section className={clsx(card, 'flex items-center gap-3')}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Target aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t.home.noGoalsTitle}</span>
          <span className="block text-sm text-muted">{t.home.noGoalsBody}</span>
        </span>
        <Link to="/plan/goals?add=1" aria-label={t.home.addGoal} title={t.home.addGoal} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <Plus aria-hidden className="size-4" />
        </Link>
      </section>
    )
  }
  return (
    <section className={card}>
      <CardHeader title={t.home.goals} action={<SeeAll to="/plan/goals" />} />
      <ul className="space-y-1">
        {goals.slice(0, 3).map(({ goal, forecast, status }) => (
          <li key={goal.id}>
            <Link to={`/plan/goals/${goal.id}`} className="-mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
              <span className="flex items-center gap-2.5">
                <Icon name={goal.icon} className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{goal.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{t.home.goalAmounts(money(forecast.saved), money(goal.target))}</span>
              </span>
              <ProgressBar
                value={forecast.progress}
                tone={status === 'behind' ? 'warn' : status === 'overdue' ? 'crit' : 'good'}
                label={t.goals.progressLabel(goal.name)}
                className="mt-2"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
