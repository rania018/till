import { useId, useState } from 'react'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { cashCountAdjustment } from '../../lib/wallets'
import { appStore } from '../../store'
import type { Account } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { StatusChip } from '../ui/StatusChip'
import { toast } from '../ui/toastStore'

interface CashCountSheetProps {
  account: Account | null
  /** What the app thinks is in the wallet today. */
  expected: number
  currency: string
  onClose: () => void
}

/** Count the cash in your wallet; a difference is logged so the app matches reality. */
export function CashCountSheet({ account, expected, currency, onClose }: CashCountSheetProps) {
  return (
    <BottomSheet open={account !== null} onOpenChange={(open) => !open && onClose()} title={t.cashCount.title} description={t.cashCount.description}>
      {account && <CountForm key={account.id} account={account} expected={expected} currency={currency} onDone={onClose} />}
    </BottomSheet>
  )
}

function CountForm({ account, expected, currency: main, onDone }: { account: Account; expected: number; currency: string; onDone: () => void }) {
  const currency = account.currency ?? main
  const id = useId()
  const [counted, setCounted] = useState<number | null>(null)
  const copy = t.cashCount
  const money = (amount: number) => formatMoney(amount, currency)
  const adjustment = counted === null ? null : cashCountAdjustment(expected, counted)

  function save() {
    if (counted === null) return
    appStore.getState().recordCashCount(account.id, counted, todayISO())
    onDone()
    toast(
      !adjustment ? copy.savedMatch : adjustment.type === 'expense' ? copy.savedMissing(money(adjustment.amount)) : copy.savedExtra(money(adjustment.amount)),
      { tone: 'good' },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between rounded-2xl bg-surface-2 px-4 py-3">
        <span className="text-sm font-semibold text-ink-2">{copy.expected}</span>
        <span className="text-xl font-extrabold tabular-nums">{money(expected)}</span>
      </div>
      <Field
        label={copy.counted}
        htmlFor={`${id}-counted`}
        hint={adjustment ? (adjustment.type === 'expense' ? copy.missingHint : copy.extraHint) : undefined}
      >
        <AmountInput id={`${id}-counted`} size="lg" value={counted} onChange={setCounted} currency={currency} autoFocus />
      </Field>
      {counted !== null && (
        <div>
          {!adjustment ? (
            <StatusChip tone="good">{copy.matches}</StatusChip>
          ) : adjustment.type === 'expense' ? (
            <StatusChip tone="warn">{copy.missing(money(adjustment.amount))}</StatusChip>
          ) : (
            <StatusChip tone="info">{copy.extra(money(adjustment.amount))}</StatusChip>
          )}
        </div>
      )}
      <Button block size="lg" onClick={save} disabled={counted === null}>
        {copy.save}
      </Button>
    </div>
  )
}
