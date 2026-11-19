import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../i18n'
import { amountToText, cleanAmountText, groupAmountText, parseAmountText } from '../../lib/amountText'
import { IconButton } from '../ui/Button'

/** What's typed, as a number of things: nothing, or zero, isn't one. */
const quantityOf = (text: string) => {
  const parsed = parseAmountText(cleanAmountText(text))
  return parsed && parsed > 0 ? parsed : null
}

/** − number +, for how many of something. It can be typed too: 25 is a long way by tapping, and 1.5 for kilos. Empty means none given. */
export function QuantityInput({ id, value, onChange, label, placeholder }: { id?: string; value: number | null; onChange: (value: number | null) => void; label: string; placeholder?: string }) {
  const copy = t.transactions
  const [text, setText] = useState(value === null ? '' : amountToText(value))
  // The buttons, or the form, changed it: what's typed follows. While typing, "2." still reads as 2 and stays as it is.
  if (quantityOf(text) !== value) setText(value === null ? '' : amountToText(value))
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-surface p-0.5">
      <IconButton icon={Minus} label={copy.quantityLess} variant="ghost" disabled={value === null || value <= 1} onClick={() => onChange(Math.max(1, (value ?? 1) - 1))} />
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const cleaned = cleanAmountText(e.target.value)
          setText(groupAmountText(cleaned))
          onChange(quantityOf(cleaned))
        }}
        className="h-10 w-14 bg-transparent text-center text-lg font-extrabold tabular-nums outline-none placeholder:text-muted"
      />
      <IconButton icon={Plus} label={copy.quantityMore} variant="ghost" onClick={() => onChange((value ?? 0) + 1)} />
    </div>
  )
}

/** The row in the entry sheet: how many, and what one came to. */
export function QuantityField({ value, onChange, hint }: { value: number | null; onChange: (value: number | null) => void; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-sm font-bold">{t.transactions.quantityLabel}</span>
      <QuantityInput value={value} onChange={onChange} label={t.transactions.quantityLabel} />
      {hint && <span className="min-w-0 flex-1 text-end text-xs font-semibold leading-tight text-muted">{hint}</span>}
    </div>
  )
}
