import { Archive } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { appStore, useAppStore } from '../../store'
import { ACCOUNT_IDS } from '../../store/defaults'
import type { Account, AccountKind } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { toast } from '../ui/toastStore'

interface WalletSheetProps {
  /** The wallet to edit, `'new'` to add one, or `null` to close the sheet. */
  wallet: Account | 'new' | null
  currency: string
  onClose: () => void
}

/** Add, edit or close a wallet. Saves straight to the store. */
export function WalletSheet({ wallet, currency, onClose }: WalletSheetProps) {
  const copy = t.walletSheet
  const existing = wallet && wallet !== 'new' ? wallet : undefined
  return (
    <BottomSheet open={wallet !== null} onOpenChange={(open) => !open && onClose()} title={existing ? copy.editTitle : copy.newTitle}>
      {wallet && <WalletForm key={existing?.id ?? 'new'} existing={existing} currency={currency} onDone={onClose} />}
    </BottomSheet>
  )
}

function WalletForm({ existing, currency, onDone }: { existing?: Account; currency: string; onDone: () => void }) {
  const id = useId()
  const copy = t.walletSheet
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'bank')
  const [balance, setBalance] = useState<number | null>(existing?.startingBalance ?? null)
  const [walletCurrency, setWalletCurrency] = useState(existing?.currency ?? currency)
  const hasEntries = useAppStore((s) => !!existing && s.transactions.some((tx) => tx.accountId === existing.id || tx.toAccountId === existing.id))
  // The salary has to stay in the main currency.
  const receivesSalary = useAppStore((s) => s.profile.salary.accountId === existing?.id)
  const currencyChoices = [...new Set([currency, ...Object.keys(t.settings.currencies), walletCurrency])]
  const [since, setSince] = useState(existing?.startDate ?? todayISO())
  const [error, setError] = useState<string | null>(null)
  // Cash and bank built-ins keep their kind: other screens count on having one of each by default.
  const builtIn = existing?.id === ACCOUNT_IDS.cash || existing?.id === ACCOUNT_IDS.bank

  function save() {
    const fields = { name: name.trim(), kind, currency: walletCurrency, startingBalance: balance ?? 0, startDate: since }
    const store = appStore.getState()
    try {
      if (existing) {
        store.updateAccount(existing.id, fields)
        toast(copy.saved, { tone: 'good' })
      } else {
        store.addAccount({ ...fields, archived: false })
        toast(copy.added(fields.name), { tone: 'good' })
      }
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function close() {
    if (!existing) return
    const { id: walletId, name: walletName } = existing
    try {
      const result = appStore.getState().closeAccount(walletId)
      onDone()
      toast(result === 'removed' ? copy.removed(walletName) : copy.closed(walletName), {
        action: { label: t.common.undo, onClick: () => appStore.getState().reopenAccount(walletId) },
      })
    } catch (e) {
      setError((e as Error).message)
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
      <Field label={copy.name} htmlFor={`${id}-name`}>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} className={inputClass()} />
      </Field>
      {!builtIn && (
        <Field label={copy.kind}>
          <SegmentedControl
            label={copy.kind}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'cash', label: copy.kinds.cash },
              { value: 'bank', label: copy.kinds.bank },
            ]}
          />
        </Field>
      )}
      {!receivesSalary && (
        <Field label={copy.currency} htmlFor={`${id}-currency`} hint={hasEntries ? copy.currencyLocked : undefined}>
          <Select id={`${id}-currency`} value={walletCurrency} disabled={hasEntries} onChange={(e) => setWalletCurrency(e.target.value)}>
            {currencyChoices.map((code) => (
              <option key={code} value={code}>
                {t.settings.currencies[code] ?? code}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={existing ? copy.startingBalance : copy.balance} htmlFor={`${id}-balance`}>
        <AmountInput id={`${id}-balance`} value={balance} onChange={setBalance} currency={walletCurrency} />
      </Field>
      <Field label={copy.since} htmlFor={`${id}-since`} hint={copy.sinceHint}>
        <input id={`${id}-since`} type="date" value={since} onChange={(e) => e.target.value && setSince(e.target.value)} className={inputClass()} />
      </Field>
      {error && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <Button type="submit" block size="lg">
        {copy.save}
      </Button>
      {existing && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" icon={Archive} onClick={close}>
            {copy.close}
          </Button>
        </div>
      )}
    </form>
  )
}
