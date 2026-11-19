import clsx from 'clsx'
import { useState, type ComponentPropsWithRef } from 'react'
import { amountToText, cleanAmountText, groupAmountText, parseAmountText } from '../../lib/amountText'
import { currencySymbol } from '../../lib/money'
import { inputClass } from './formStyles'

interface AmountInputProps extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type' | 'size'> {
  value: number | null
  onChange: (value: number | null) => void
  currency?: string
  /** Shown instead of the currency, for a number that isn't money, like grams. */
  unit?: string
  /** `lg` for the main amount of a screen, `sm` for amounts in a list. */
  size?: 'sm' | 'md' | 'lg'
  invalid?: boolean
}

/** Money field: numeric keypad on phones, thousands separators while typing, currency after the number. */
export function AmountInput({ value, onChange, currency = 'DZD', unit, size = 'md', invalid, className, ...props }: AmountInputProps) {
  const [text, setText] = useState(() => amountToText(value))
  // When the value changes from outside (e.g. "Suggest limits"), show the new value.
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    setText(amountToText(value))
  }

  // An empty field with a placeholder ("No limit") reads better without the currency.
  const showSymbol = text !== '' || !props.placeholder

  return (
    <div className={clsx('relative', className)}>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const cleaned = cleanAmountText(event.target.value)
          const next = parseAmountText(cleaned)
          setText(groupAmountText(cleaned))
          setShownValue(next)
          onChange(next)
        }}
        className={inputClass({
          invalid,
          large: size === 'lg',
          className: clsx(
            'tabular-nums',
            size === 'lg' && 'min-h-16 pe-14 text-3xl font-extrabold tracking-tight desk:min-h-12 desk:text-2xl',
            size === 'md' && 'pe-12 font-semibold',
            size === 'sm' && 'min-h-10 pe-10 text-end font-semibold',
          ),
        })}
      />
      <span
        aria-hidden
        hidden={!showSymbol}
        className={clsx(
          'pointer-events-none absolute inset-y-0 end-3.5 flex items-center font-bold text-muted',
          size === 'lg' ? 'text-base' : 'text-sm',
          size === 'sm' && 'end-3 text-xs',
        )}
      >
        {unit ?? currencySymbol(currency)}
      </span>
    </div>
  )
}
