import clsx from 'clsx'
import { Delete } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { t } from '../../i18n'

export type PinKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'back'

const DIGITS: PinKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Dots for the digits typed so far: never the digits themselves. */
export function PinDots({ count, length, error }: { count: number; length: number; error?: boolean }) {
  return (
    <div aria-hidden className={clsx('flex justify-center gap-3', error && 'animate-shake')}>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={clsx('size-3.5 rounded-full border-2 transition-colors', error ? 'border-crit' : 'border-ink-2', i < count && (error ? 'bg-crit' : 'bg-ink'))} />
      ))}
    </div>
  )
}

/** A phone-style number pad for a PIN. A keyboard's digits, Backspace and Enter work too. */
export function PinPad({ onKey, onEnter, corner, disabled }: { onKey: (key: PinKey) => void; onEnter?: () => void; /** Bottom left, e.g. fingerprint. */ corner?: ReactNode; disabled?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled || (event.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (/^\d$/.test(event.key)) onKey(event.key as PinKey)
      else if (event.key === 'Backspace') onKey('back')
      else if (event.key === 'Enter' && onEnter) onEnter()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKey, onEnter, disabled])

  const key = (value: PinKey) => (
    <button
      key={value}
      type="button"
      disabled={disabled}
      onClick={() => onKey(value)}
      aria-label={value === 'back' ? t.lock.backspace : undefined}
      className="grid h-14 place-items-center rounded-2xl bg-surface-2 text-2xl font-bold tabular-nums transition-colors hover:bg-line active:bg-line disabled:opacity-40"
    >
      {value === 'back' ? <Delete aria-hidden className="size-6" /> : value}
    </button>
  )

  return (
    <div role="group" aria-label={t.lock.keypad} dir="ltr" className="mx-auto grid w-full max-w-72 grid-cols-3 gap-2">
      {DIGITS.map(key)}
      <div className="grid place-items-center">{corner}</div>
      {key('0')}
      {key('back')}
    </div>
  )
}
