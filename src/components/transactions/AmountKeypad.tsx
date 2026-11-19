import { ChevronDown, Delete } from 'lucide-react'
import type { ReactNode } from 'react'
import { groupAmountText, type KeypadKey } from '../../lib/amountText'
import { currencySymbol } from '../../lib/money'
import { t } from '../../i18n'
import { numberLocale } from '../../i18n/language'

/** The language's own decimal mark on the key; the typed text always keeps ".". */
const decimalMark = new Intl.NumberFormat(numberLocale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.'

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back']

/** The amount as it's typed. `picker` replaces the plain currency symbol when the currency can be changed. */
export function AmountDisplay({ digits, currency, picker }: { digits: string; currency: string; picker?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-center gap-2">
      <p aria-live="polite" className="text-4xl font-extrabold tracking-tight tabular-nums">
        <span className={digits ? '' : 'text-muted'}>{digits ? groupAmountText(digits) : '0'}</span>
      </p>
      {picker ?? <span className="text-lg font-extrabold text-muted">{currencySymbol(currency)}</span>}
    </div>
  )
}

interface CurrencyPillProps {
  value: string
  choices: string[]
  onChange: (currency: string) => void
}

/** Sits beside the amount, so choosing a currency takes no room from the form. The phone's own picker opens on tap. */
export function CurrencyPill({ value, choices, onChange }: CurrencyPillProps) {
  return (
    <span className="relative inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-surface-2 px-2.5 text-sm font-extrabold text-ink-2">
      {currencySymbol(value)}
      <ChevronDown aria-hidden className="size-3.5 text-muted" />
      <select aria-label={t.transactions.currency} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full cursor-pointer opacity-0">
        {choices.map((code) => (
          <option key={code} value={code}>
            {t.settings.currencies[code] ?? code}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Big keys for typing an amount with one thumb. A physical keyboard works too (see TransactionSheet). With `cents`, a decimal key replaces 000. */
export function AmountKeypad({ onKey, cents }: { onKey: (key: KeypadKey) => void; cents?: boolean }) {
  return (
    <div role="group" aria-label={t.transactions.keypad} dir="ltr" className="grid grid-cols-3 gap-1.5">
      {(cents ? KEYS.map((key) => (key === '000' ? ('.' as const) : key)) : KEYS).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key)}
          aria-label={key === 'back' ? t.transactions.backspace : undefined}
          className="grid h-11 place-items-center rounded-xl bg-surface-2 text-xl font-bold tabular-nums transition-colors hover:bg-line active:bg-line"
        >
          {key === 'back' ? <Delete aria-hidden className="size-5" /> : key === '.' ? decimalMark : key}
        </button>
      ))}
    </div>
  )
}
