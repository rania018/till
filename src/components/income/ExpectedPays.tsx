import { Banknote } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { expectedPays, type ExpectedPay } from '../../lib/income'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import type { ISODate } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { toast } from '../ui/toastStore'
import { WalletPicker } from '../wallets/WalletPicker'

/** Enough to answer this month's, without a long absence filling the screen. */
const SHOWN = 3

function payName(pay: Pick<ExpectedPay, 'name'>): string {
  return pay.name ?? t.income.salary
}

/** Pay that's due and waiting for an answer. Nothing counts in the budget until it has one. */
export function ExpectedPays({ today }: { today: ISODate }) {
  const transactions = useAppStore((s) => s.transactions)
  const profile = useAppStore((s) => s.profile)
  const incomes = useAppStore((s) => s.incomes)
  const [showAll, setShowAll] = useState(false)
  const [changing, setChanging] = useState<ExpectedPay | null>(null)
  const pays = expectedPays({ profile, transactions, incomes }, today)
  const copy = t.income

  // The sheet stays mounted when its pay gets answered, so it can close with its animation.
  if (pays.length === 0 && !changing) return null
  const moneyOf = (pay: ExpectedPay) => formatMoney(pay.amount, pay.currency ?? profile.currency)
  const shown = showAll ? pays : pays.slice(0, SHOWN)

  function answered(message: string, undo: () => void, tone?: 'good') {
    toast(message, { tone, action: { label: t.common.undo, onClick: undo } })
  }

  return (
    <>
      {pays.length > 0 && (
        <section aria-label={copy.expectedTitle} className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold">
            <Banknote aria-hidden className="size-4 text-accent" />
            {copy.expectedTitle}
          </h2>
          <ul className="divide-y divide-line">
            {shown.map((pay) => {
              const name = payName(pay)
              return (
                <li key={pay.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
                  <p className="min-w-0 flex-1 basis-56 text-sm font-semibold">{copy.expected(name, moneyOf(pay), t.format.nearDay(pay.payDate, today))}</p>
                  <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                    <button
                      type="button"
                      aria-label={copy.notReceivedFor(name)}
                      onClick={() => answered(copy.skipped(name), appStore.getState().skipPay(pay))}
                      className="min-h-9 flex-1 whitespace-nowrap rounded-lg border border-line px-3 text-sm font-bold text-ink-2 transition hover:bg-surface-2 sm:flex-none"
                    >
                      {copy.notReceived}
                    </button>
                    <button
                      type="button"
                      aria-label={copy.otherAmountFor(name)}
                      onClick={() => setChanging(pay)}
                      className="min-h-9 flex-1 whitespace-nowrap rounded-lg border border-line px-3 text-sm font-bold text-ink-2 transition hover:bg-surface-2 sm:flex-none"
                    >
                      {copy.otherAmount}
                    </button>
                    <button
                      type="button"
                      aria-label={copy.receivedFor(name)}
                      onClick={() => answered(copy.confirmed(name, moneyOf(pay)), appStore.getState().confirmPay(pay), 'good')}
                      className="min-h-9 flex-1 whitespace-nowrap rounded-lg bg-accent px-3 text-sm font-bold text-on-accent transition hover:brightness-110 sm:flex-none"
                    >
                      {copy.received}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {pays.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-2 min-h-9 text-sm font-bold text-accent">
              {copy.showMore(pays.length - shown.length)}
            </button>
          )}
        </section>
      )}
      <BottomSheet open={changing !== null} onOpenChange={(open) => !open && setChanging(null)} title={copy.sheetTitle}>
        {changing && (
          <PayForm
            key={changing.id}
            pay={changing}
            today={today}
            onDone={(message, undo) => {
              setChanging(null)
              answered(message, undo, 'good')
            }}
          />
        )}
      </BottomSheet>
    </>
  )
}

/** The amount, day and wallet can all differ from what was expected. */
function PayForm({ pay, today, onDone }: { pay: ExpectedPay; today: ISODate; onDone: (message: string, undo: () => void) => void }) {
  const id = useId()
  const accounts = useAppStore((s) => s.accounts)
  const main = useAppStore((s) => s.profile.currency)
  const currency = pay.currency ?? main
  const [amount, setAmount] = useState<number | null>(pay.amount)
  const [date, setDate] = useState(pay.payDate)
  const [accountId, setAccountId] = useState(pay.accountId)
  const [error, setError] = useState<string | null>(null)
  const copy = t.income
  // An entry's currency is its wallet's, so only wallets in the expected currency are on offer.
  const wallets = live(accounts).filter((a) => !a.archived && (a.currency ?? main) === currency)

  function save() {
    if (!amount || amount <= 0) return setError(copy.amountError)
    try {
      const undo = appStore.getState().confirmPay(pay, { amount, date, accountId })
      onDone(copy.confirmed(payName(pay), formatMoney(amount, currency)), undo)
    } catch (problem) {
      setError((problem as Error).message)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-sm text-muted">{copy.expected(payName(pay), formatMoney(pay.amount, currency), t.format.nearDay(pay.payDate, today))}</p>
      <Field label={copy.amount} htmlFor={`${id}-amount`} error={error}>
        <AmountInput
          id={`${id}-amount`}
          size="lg"
          value={amount}
          invalid={!!error}
          currency={currency}
          onChange={(value) => {
            setAmount(value)
            setError(null)
          }}
        />
      </Field>
      <Field label={copy.date} htmlFor={`${id}-date`}>
        <input id={`${id}-date`} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass()} />
      </Field>
      <Field label={copy.wallet}>
        <WalletPicker label={copy.wallet} value={accountId} onChange={setAccountId} wallets={wallets} />
      </Field>
      <Button type="submit" block>
        {copy.save}
      </Button>
    </form>
  )
}
