import { Plus, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { billToDraft, newBillDraft, type BillDraft } from '../../components/billDraft'
import { BillSheet } from '../../components/BillSheet'
import { SumBand, SumBar, SumCell } from '../../components/desk/Panel'
import { BillsTable } from '../../components/desk/PlanTables'
import { editTransaction } from '../../components/transactions/sheetStore'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatusChip } from '../../components/ui/StatusChip'
import { SummarySplit } from '../../components/ui/SummarySplit'
import { toast } from '../../components/ui/toastStore'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { cycleBills, totalMonthlyBills, type CycleBill } from '../../lib/bills'
import { planMonth, todayISO } from '../../lib/dates'
import { fundForBill } from '../../lib/funds'
import { goalSaved } from '../../lib/goals'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { nameOf } from '../../lib/transactions'
import { appStore, useAppStore } from '../../store'
import type { Bill } from '../../types'

export function BillsPage() {
  const { bills, transactions, categories, accounts, profile, goals } = useAppStore(
    useShallow((s) => ({ bills: s.bills, transactions: s.transactions, categories: s.categories, accounts: s.accounts, profile: s.profile, goals: s.goals })),
  )
  const desktop = useIsDesktop()
  const [draft, setDraft] = useState<BillDraft | null>(null)
  const today = todayISO()
  const result = useMemo(
    () => cycleBills(bills, planMonth(today, profile.salary), transactions, today),
    [bills, profile.salary, transactions, today],
  )
  const txById = useMemo(() => new Map(transactions.map((tx) => [tx.id, tx])), [transactions])
  const iconFor = (bill: Bill) => categories.find((c) => c.id === bill.categoryId)?.icon ?? 'receipt'
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const copy = t.billsTab
  const activeBills = live(bills).filter((b) => b.active)
  /** "Fund: 18,000 DA of 24,000 DA", for a bill with a fund. */
  const fundLine = (bill: Bill) => {
    const fund = fundForBill(goals, bill.id)
    return fund ? t.funds.billLine(money(Math.max(0, goalSaved(fund, transactions))), money(fund.target)) : undefined
  }

  function markPaid(bill: Bill) {
    try {
      const payment = appStore.getState().markBillPaid(bill.id, { date: today })
      const fromFund = payment.fundAmount ? ` · ${t.funds.fromLine(money(payment.fundAmount), nameOf(goals, payment.goalId))}` : ''
      toast(`${copy.markedPaid(bill.name, money(payment.amount))}${fromFund}`, {
        tone: 'good',
        action: { label: t.common.undo, onClick: () => appStore.getState().deleteTransaction(payment.id) },
      })
    } catch (error) {
      toast((error as Error).message, { tone: 'crit' })
    }
  }

  const addButton = (
    <Button variant="secondary" icon={Plus} onClick={() => setDraft(newBillDraft({}, today))}>
      {copy.add}
    </Button>
  )

  if (activeBills.length === 0) {
    return (
      <>
        <EmptyState icon={Receipt} title={copy.emptyTitle} body={copy.emptyBody} action={addButton} />
        <BillSheet draft={draft} onClose={() => setDraft(null)} />
      </>
    )
  }

  if (desktop) {
    const next = result.due.find((d) => d.occurrence.status !== 'paid')
    const nextLine = next ? (next.occurrence.status === 'overdue' ? t.home.lateBill : t.home.nextBill)(next.bill.name, money(next.bill.amount), t.format.nearDay(next.occurrence.dueDate, today)) : t.home.allPaid
    return (
      <div className="space-y-6">
        <SumBand label={copy.summaryLabel} bar={result.planned > 0 && <SumBar share={result.paid / result.planned} fill="bg-good" rest="bg-surface-2" />}>
          <SumCell label={copy.summaryLabel} value={money(result.planned)} note={copy.monthly(money(Math.round(totalMonthlyBills(bills))))} />
          <SumCell sign="−" label={copy.status.paid} value={money(result.paid)} tone="good" note={result.planned > 0 ? copy.paidShare(`${Math.round((result.paid / result.planned) * 100)}%`) : undefined} />
          <SumCell sign="=" label={t.desk.stillToPay} value={money(Math.max(0, result.planned - result.paid))} tone="accent" note={nextLine} />
        </SumBand>
        <BillsTable
          result={result}
          transactions={txById}
          iconFor={iconFor}
          walletName={(id) => nameOf(accounts, id)}
          money={money}
          onOpen={(bill) => setDraft(billToDraft(bill, today))}
          onOpenPayment={editTransaction}
          onMarkPaid={markPaid}
          aside={addButton}
          fundLine={fundLine}
        />
        <BillSheet draft={draft} onClose={() => setDraft(null)} />
      </div>
    )
  }

  const row = ({ bill, occurrence }: CycleBill) => {
    const payment = occurrence.paymentId ? txById.get(occurrence.paymentId) : undefined
    const when =
      occurrence.status === 'paid' && payment
        ? copy.paidOn(t.format.shortDay(payment.date))
        : occurrence.status === 'overdue'
          ? copy.wasDue(t.format.shortDay(occurrence.dueDate))
          : copy.dueOn(t.format.shortDay(occurrence.dueDate))
    return (
      <li key={`${bill.id}-${occurrence.dueDate}`} className="flex items-center gap-2 px-2 py-2">
        <button type="button" onClick={() => setDraft(billToDraft(bill, today))} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-start">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon name={iconFor(bill)} className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-bold">{bill.name}</span>
              {occurrence.status === 'overdue' && <StatusChip tone="crit">{copy.status.overdue}</StatusChip>}
              {occurrence.status === 'due-soon' && <StatusChip tone="warn">{copy.status['due-soon']}</StatusChip>}
            </span>
            <span className="block text-sm text-muted">
              {money(payment?.amount ?? bill.amount)} · {when}
            </span>
            {fundLine(bill) && <span className="block text-sm text-muted">{fundLine(bill)}</span>}
          </span>
        </button>
        {occurrence.status === 'paid' && payment ? (
          <button type="button" onClick={() => editTransaction(payment)} aria-label={copy.editPayment(bill.name)} className="shrink-0 rounded-full">
            <StatusChip tone="good">{copy.status.paid}</StatusChip>
          </button>
        ) : (
          <Button
            size="sm"
            variant={occurrence.status === 'upcoming' ? 'secondary' : 'primary'}
            onClick={() => markPaid(bill)}
            aria-label={copy.markPaidLabel(bill.name)}
            className="shrink-0"
          >
            {copy.markPaid}
          </Button>
        )}
      </li>
    )
  }

  return (
    <>
      <SummarySplit
        summary={
          <Card>
            <p className="text-sm font-semibold text-muted">{copy.summaryLabel}</p>
            <p className="text-2xl font-extrabold tracking-tight">{copy.summary(money(result.paid), money(result.planned))}</p>
            {result.planned > 0 && <ProgressBar value={result.paid / result.planned} tone="good" label={copy.summaryLabel} className="mt-3" />}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{copy.monthly(money(Math.round(totalMonthlyBills(bills))))}</p>
              {addButton}
            </div>
          </Card>
        }
      >
        {result.due.length > 0 && <ul className="mt-3 rounded-2xl border border-line bg-surface p-1">{result.due.map(row)}</ul>}
        {result.due.some((d) => d.occurrence.status === 'paid') && <p className="mt-2 text-sm text-muted">{copy.differentAmount}</p>}

        {result.notDue.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-extrabold">{copy.notDueTitle}</h2>
            <ul className="rounded-2xl border border-line bg-surface p-1">
              {result.notDue.map(({ bill, nextDue }) => (
                <li key={bill.id}>
                  <button
                    type="button"
                    onClick={() => setDraft(billToDraft(bill, today))}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-surface-2"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                      <Icon name={iconFor(bill)} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{bill.name}</span>
                      <span className="block text-sm text-muted">
                        {money(bill.amount)} · {t.format.frequency[bill.frequency]}
                      </span>
                      {fundLine(bill) && <span className="block text-sm text-muted">{fundLine(bill)}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-muted">{nextDue ? copy.nextDue(t.format.shortDayOrDate(nextDue, todayISO())) : copy.noNextDue}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </SummarySplit>

      <BillSheet draft={draft} onClose={() => setDraft(null)} />
    </>
  )
}
