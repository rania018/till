import { CalendarClock, Coins, HandCoins, Pencil } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ExportButton } from '../../components/ExportButton'
import { debtNextLine } from '../../components/debts/debtLine'
import { ChargeSheet } from '../../components/debts/ChargeSheet'
import { DebtSheet } from '../../components/debts/DebtSheet'
import { RepeatApprovals } from '../../components/debts/RepeatApprovals'
import { DebtStatusChip } from '../../components/debts/DebtStatusChip'
import { openTransactionSheet } from '../../components/transactions/sheetStore'
import { TransactionRow } from '../../components/transactions/TransactionRow'
import { Button, IconButton } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SummarySplit } from '../../components/ui/SummarySplit'
import { toast } from '../../components/ui/toastStore'
import { t } from '../../i18n'
import { fromISODate, planMonth, todayISO } from '../../lib/dates'
import { debtView } from '../../lib/debts'
import { debtWorkbook } from '../../lib/export/pages'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { newestFirst } from '../../lib/transactions'
import { appStore, useAppStore } from '../../store'
import type { Debt, DebtCharge } from '../../types'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm font-semibold text-ink-2">{label}</dt>
      <dd className="text-end font-bold tabular-nums">{children}</dd>
    </div>
  )
}

export function DebtDetailPage() {
  const { debtId } = useParams()
  const navigate = useNavigate()
  const { debts, goals, transactions, categories, accounts, profile } = useAppStore(
    useShallow((s) => ({ debts: s.debts, goals: s.goals, transactions: s.transactions, categories: s.categories, accounts: s.accounts, profile: s.profile })),
  )
  const [editing, setEditing] = useState<Debt | null>(null)
  const [editingCharge, setEditingCharge] = useState<DebtCharge | null>(null)
  const names = useMemo(() => ({ categories, accounts, goals, debts }), [categories, accounts, goals, debts])
  const history = useMemo(() => live(transactions).filter((tx) => tx.debtId === debtId).sort(newestFirst), [transactions, debtId])
  const debt = live(debts).find((d) => d.id === debtId)
  const copy = t.debtPage
  const sheet = <DebtSheet debt={editing} onClose={() => setEditing(null)} onDeleted={() => navigate('/plan/debts', { replace: true })} />

  if (!debt) {
    return (
      <div className="max-w-xl">
        <PageHeader title={copy.notFoundTitle} backTo="/plan/debts" showSettings={false} />
        <EmptyState
          icon={HandCoins}
          title={copy.notFoundTitle}
          body={copy.notFoundBody}
          action={
            <Link to="/plan/debts" className={buttonClass()}>
              {copy.back}
            </Link>
          }
        />
        {sheet}
      </div>
    )
  }

  const today = todayISO()
  const money = (amount: number) => formatMoney(amount, debt.currency ?? profile.currency)
  const view = debtView(debt, transactions, planMonth(today, profile.salary), today)
  const active = !debt.archived

  // Moves and amounts added with no money moved, newest first.
  const entries = [
    ...history.map((tx) => ({ date: tx.date, tx, charge: undefined })),
    ...(debt.charges ?? []).map((charge) => ({ date: charge.date, tx: undefined, charge })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const repeats = (debt.repeats ?? []).filter((r) => !r.stoppedAt)

  function stopRepeat(repeatId: string, name: string) {
    if (!debt) return
    const undo = appStore.getState().stopRepeat(debt.id, repeatId)
    toast(t.debts.repeatStopped(name), { action: { label: t.common.undo, onClick: undo } })
  }

  function reopen() {
    if (!debt) return
    appStore.getState().updateDebt(debt.id, { archived: false })
    toast(copy.restored(debt.person), { tone: 'good' })
  }

  return (
    <div className="max-w-xl lg:max-w-none">
      <PageHeader
        title={debt.person}
        subtitle={t.plan.debts}
        backTo="/plan/debts"
        showSettings={false}
        actions={
          <>
            <ExportButton workbook={() => debtWorkbook(appStore.getState(), today, debt)} />
            <IconButton icon={Pencil} label={copy.edit} onClick={() => setEditing(debt)} />
          </>
        }
      />

      <SummarySplit
        summary={
          <>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <HandCoins aria-hidden className="size-6" />
                </span>
                <DebtStatusChip status={view.status} direction={debt.direction} />
              </div>
              <p className="mt-3 text-sm font-semibold text-muted">{copy.owes[debt.direction](debt.person)}</p>
              <p className="text-3xl font-extrabold tracking-tight tabular-nums">{money(view.owed)}</p>
              <ProgressBar value={view.progress} tone="good" label={t.debts.progressLabel(debt.person)} className="mt-3" />
              <p className="mt-1.5 text-sm text-muted">{t.debts.paidOf(money(view.repaid), money(view.total))}</p>
              {active ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button disabled={view.owed <= 0} onClick={() => openTransactionSheet('debt', { debtId: debt.id, amount: view.plan.unpaid || undefined })}>
                    {t.debts.logPayment}
                  </Button>
                  <Button variant="secondary" onClick={() => openTransactionSheet('debt', { debtId: debt.id, grow: true })}>
                    {copy.more[debt.direction]}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-[0.9375rem] text-ink-2">{copy.closedNote}</p>
                  <Button variant="secondary" className="mt-3" onClick={reopen}>
                    {copy.restore}
                  </Button>
                </>
              )}
            </Card>

            <div className="mt-3">
              <RepeatApprovals debtId={debt.id} />
            </div>

            {repeats.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-sm font-extrabold">{t.debts.repeatsTitle}</h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                  {repeats.map((repeat) => (
                    <li key={repeat.id} className="flex items-center gap-3 py-2.5">
                      <CalendarClock aria-hidden className="size-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{repeat.name}</span>
                        <span className="block truncate text-sm text-muted">{t.debts.repeatLine(money(repeat.amount), fromISODate(repeat.startDate).getDate())}</span>
                      </span>
                      <Button variant="ghost" size="sm" aria-label={t.debts.stopFor(repeat.name)} onClick={() => stopRepeat(repeat.id, repeat.name)}>
                        {t.debts.stop}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6">
              <h2 className="mb-2 text-sm font-extrabold">{copy.details}</h2>
              <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                {debt.note && <Row label={copy.forWhat}>{debt.note}</Row>}
                <Row label={copy.since}>{t.format.date(debt.date)}</Row>
                <Row label={copy.dueDate}>{debt.dueDate ? t.format.date(debt.dueDate) : copy.noDueDate}</Row>
                {!!debt.monthlyPayment && <Row label={copy.monthly}>{money(debt.monthlyPayment)}</Row>}
                {!!debt.monthlyPayment && debt.firstPaymentDate && <Row label={copy.firstPayment}>{t.format.date(debt.firstPaymentDate)}</Row>}
                {!!debt.monthlyPayment && <Row label={copy.thisCycle}>{money(view.plan.paid)}</Row>}
              </dl>
              {view.nextDate && <p className="mt-2 text-sm text-muted">{debtNextLine(view, money, today)}</p>}
            </section>
          </>
        }
      >
        <section className="mt-6 lg:mt-0">
          <h2 className="mb-2 text-sm font-extrabold">{copy.history}</h2>
          {entries.length > 0 || debt.startingAmount > 0 ? (
            <ul className="rounded-2xl border border-line bg-surface p-1">
              {entries.map(({ tx, charge }) =>
                tx ? (
                  <li key={tx.id}>
                    <TransactionRow transaction={tx} names={names} currency={profile.currency} dated />
                  </li>
                ) : (
                  charge && (
                    <li key={charge.id}>
                      <button type="button" onClick={() => setEditingCharge(charge)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-surface-2">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                          <Coins aria-hidden className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{charge.note || t.debts.addedNoMoney}</span>
                          <span className="block truncate text-sm text-muted">{charge.note ? `${t.format.date(charge.date)} · ${t.debts.addedNoMoney}` : t.format.date(charge.date)}</span>
                        </span>
                        <span className="shrink-0 font-extrabold tabular-nums text-muted">{money(charge.amount)}</span>
                      </button>
                    </li>
                  )
                ),
              )}
              {debt.startingAmount > 0 && (
                <li className="flex items-center gap-3 px-2 py-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    <Coins aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{debt.note || copy.startedWith}</span>
                    <span className="block truncate text-sm text-muted">{copy.beforeTracking}</span>
                  </span>
                  <span className="shrink-0 font-extrabold tabular-nums text-muted">{money(debt.startingAmount)}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.9375rem] text-ink-2">{copy.noHistory}</p>
          )}
        </section>
      </SummarySplit>

      <ChargeSheet debt={debt} charge={editingCharge} currency={debt.currency ?? profile.currency} onClose={() => setEditingCharge(null)} />
      {sheet}
    </div>
  )
}
