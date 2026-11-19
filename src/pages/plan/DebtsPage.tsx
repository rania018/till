import { HandCoins, Pencil, Plus } from 'lucide-react'
import { ChevronRight } from '../../components/ui/directionalIcons'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { debtNextLine } from '../../components/debts/debtLine'
import { DebtSheet } from '../../components/debts/DebtSheet'
import { DebtStatusChip } from '../../components/debts/DebtStatusChip'
import { RepeatApprovals } from '../../components/debts/RepeatApprovals'
import { DebtsGrid } from '../../components/desk/PlanTables'
import { AmountList, AmountOf, SumBand, SumCell } from '../../components/desk/Panel'
import { openTransactionSheet } from '../../components/transactions/sheetStore'
import { Button, IconButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SummarySplit } from '../../components/ui/SummarySplit'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { planMonth, todayISO } from '../../lib/dates'
import { formatAmounts, isMainCurrency } from '../../lib/currency'
import { debtTotals, debtViews, type DebtView } from '../../lib/debts'
import { formatMoney, sumAmounts } from '../../lib/money'
import { useAppStore } from '../../store'
import type { Debt, ISODate } from '../../types'

export function DebtsPage() {
  const { debts, transactions, profile } = useAppStore(useShallow((s) => ({ debts: s.debts, transactions: s.transactions, profile: s.profile })))
    const [editing, setEditing] = useState<Debt | null>(null)
  const desktop = useIsDesktop()
  const today = todayISO()
  const { start, end } = planMonth(today, profile.salary)
  const views = useMemo(() => debtViews(debts, transactions, { start, end }, today), [debts, transactions, start, end, today])
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const copy = t.debts

  const addButton = (
    <Button variant="secondary" icon={Plus} onClick={() => openTransactionSheet('debt')}>
      {copy.add}
    </Button>
  )

  if (views.length === 0) {
    return (
      <>
        <EmptyState icon={HandCoins} title={copy.emptyTitle} body={copy.emptyBody} action={addButton} />
      </>
    )
  }

  const open = views.filter((v) => v.status !== 'settled' && v.status !== 'closed')
  const settled = views.filter((v) => v.status === 'settled' || v.status === 'closed')
  const { iOwe, owedToMe } = debtTotals(views, profile.currency)
  // A planned amount can only be added up within one currency.
  const mainViews = views.filter((v) => isMainCurrency(v.debt, profile.currency))
  const planned = sumAmounts(mainViews.map((v) => v.plan.planned))
  const paid = sumAmounts(mainViews.map((v) => Math.min(v.plan.paid, v.plan.planned)))
  const moneyFor = (view: DebtView) => (amount: number) => formatMoney(amount, view.debt.currency ?? profile.currency)
  const sheet = <DebtSheet debt={editing} onClose={() => setEditing(null)} />
  const logPayment = (view: DebtView) => openTransactionSheet('debt', { debtId: view.debt.id, amount: view.plan.unpaid || undefined })

  const settledList = settled.length > 0 && (
    <section className="mt-6 desk:mt-0">
      <h2 className="mb-2 text-sm font-extrabold desk:mb-3 desk:text-base">{copy.settledTitle}</h2>
      <ul className="rounded-2xl border border-line bg-surface p-1 desk:grid desk:gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(3, settled.length)}, minmax(0, 1fr))` }}>
        {settled.map((view) => (
          <li key={view.debt.id}>
            <Link to={`/plan/debts/${view.debt.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{view.debt.person}</span>
                <span className="block truncate text-sm text-muted">{view.debt.note ?? copy.paidOf(moneyFor(view)(view.repaid), moneyFor(view)(view.total))}</span>
              </span>
              <DebtStatusChip status={view.status} direction={view.debt.direction} />
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )

  if (desktop) {
    return (
      <div className="space-y-6">
        <SumBand label={t.plan.debts} columns={planned > 0 ? 3 : 2}>
          <SumCell label={copy.iOwe} value={<AmountList amounts={iOwe} main={profile.currency} />} note={copy.openCount(open.filter((v) => v.debt.direction === 'borrowed').length)} />
          <SumCell sign="" label={copy.owedToMe} value={<AmountList amounts={owedToMe} main={profile.currency} />} tone={owedToMe.length > 0 ? 'good' : undefined} note={copy.openCount(open.filter((v) => v.debt.direction === 'lent').length)} />
          {planned > 0 && (
            <SumCell sign="" label={t.desk.instalments} value={<AmountOf amount={money(paid)} of={t.desk.ofAmount(money(planned))} />}>
              <ProgressBar value={paid / planned} tone="good" label={copy.instalmentsThisCycle(money(paid), money(planned))} className="mt-2.5" />
            </SumCell>
          )}
        </SumBand>
        <RepeatApprovals />
        <DebtsGrid views={open} moneyFor={moneyFor} today={today} lineFor={debtNextLine} onLogPayment={logPayment} onEdit={(view) => setEditing(view.debt)} addLabel={copy.add} onAdd={() => openTransactionSheet('debt')} />
        {settledList}
        {sheet}
      </div>
    )
  }

  return (
    <>
      <SummarySplit
        summary={
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-muted">{copy.iOwe}</p>
                <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatAmounts(iOwe, profile.currency)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-muted">{copy.owedToMe}</p>
                <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatAmounts(owedToMe, profile.currency)}</p>
              </div>
            </div>
            {planned > 0 && (
              <>
                <ProgressBar value={paid / planned} tone="good" label={copy.instalmentsThisCycle(money(paid), money(planned))} className="mt-3" />
                <p className="mt-1.5 text-sm text-muted">{copy.instalmentsThisCycle(money(paid), money(planned))}</p>
              </>
            )}
            <div className="mt-3 flex justify-end">{addButton}</div>
          </Card>
        }
      >
        <div className="mt-3">
          <RepeatApprovals />
        </div>
        <ul className="mt-3 grid gap-3 xl:grid-cols-2">
          {open.map((view) => (
            <li key={view.debt.id}>
              <DebtCard view={view} money={moneyFor(view)} today={today} onLogPayment={() => logPayment(view)} onEdit={() => setEditing(view.debt)} />
            </li>
          ))}
        </ul>
        {settledList}
      </SummarySplit>
      {sheet}
    </>
  )
}

function DebtCard({ view, money, today, onLogPayment, onEdit }: { view: DebtView; money: (amount: number) => string; today: ISODate; onLogPayment: () => void; onEdit: () => void }) {
  const { debt, owed, progress, repaid, total, status } = view
  const copy = t.debts
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <Link to={`/plan/debts/${debt.id}`} className="-m-2 block rounded-xl p-2 transition-colors hover:bg-surface-2">
        <span className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{debt.person}</span>
            <span className="block truncate text-sm font-semibold tabular-nums text-ink-2">{copy.owedLine[debt.direction](money(owed))}</span>
          </span>
          <DebtStatusChip status={status} direction={debt.direction} />
        </span>
        {debt.note && <span className="mt-1 block truncate text-sm text-muted">{debt.note}</span>}
        <ProgressBar value={progress} tone="good" label={copy.progressLabel(debt.person)} className="mt-3" />
        <span className="mt-1.5 block text-sm text-muted">{copy.paidOf(money(repaid), money(total))}</span>
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="min-w-0 flex-1 text-sm text-muted">{debtNextLine(view, money, today)}</span>
        <IconButton icon={Pencil} label={copy.edit(debt.person)} onClick={onEdit} />
        <Button size="sm" onClick={onLogPayment} aria-label={copy.logPaymentFor(debt.person)} className="shrink-0 whitespace-nowrap">
          {copy.logPayment}
        </Button>
      </div>
    </div>
  )
}
