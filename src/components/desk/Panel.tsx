import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { CurrencyAmount } from '../../lib/currency'
import { formatMoney } from '../../lib/money'

/**
 * The building blocks of the desktop layouts, used only with a mouse on a large
 * screen. Touch screens keep the roomier cards and lists.
 */

/** A titled pane: a header bar with hairlines between the rows under it, rather than a stack of cards. */
export function Panel({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('min-w-0 rounded-2xl border border-line bg-surface', className)}>
      {(title || aside) && (
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5 py-2">
          {title && <h2 className="text-base font-extrabold">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

interface MetricProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'crit' | 'good'
  /** Under the number, e.g. a progress bar. */
  children?: ReactNode
  className?: string
  /** Opens what's behind the number. */
  onClick?: () => void
}

/** One number with its label. Lined up in a `SummaryStrip`, they read as a single band. */
export function Metric({ label, value, hint, tone, children, className, onClick }: MetricProps) {
  // A number with something behind it opens its details, the whole tile being the button.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clsx('group min-w-0 px-6 py-5 text-start transition-colors hover:bg-surface-2', className)}>
        <p className="truncate text-sm font-semibold text-muted">{label}</p>
        <div className={clsx('mt-1 text-2xl font-extrabold tabular-nums tracking-tight group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4', tone === 'crit' && 'text-crit-ink', tone === 'good' && 'text-good-ink')}>{value}</div>
        {hint && <p className="mt-1 truncate text-sm text-muted">{hint}</p>}
        {children}
      </button>
    )
  }
  return (
    <div className={clsx('min-w-0 px-6 py-5', className)}>
      <p className="truncate text-sm font-semibold text-muted">{label}</p>
      <div className={clsx('mt-1 text-2xl font-extrabold tabular-nums tracking-tight', tone === 'crit' && 'text-crit-ink', tone === 'good' && 'text-good-ink')}>{value}</div>
      {hint && <p className="mt-1 truncate text-sm text-muted">{hint}</p>}
      {children}
    </div>
  )
}

/** A page's totals in one band, sharing the width evenly so nothing bunches up at one end. */
export function SummaryStrip({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid auto-cols-fr grid-flow-col divide-x divide-line rounded-2xl border border-line bg-surface">
      {children}
    </section>
  )
}

/** Each currency on its own, wrapping onto a new line when there's no room. Amounts in different currencies are never added up. */
export function AmountList({ amounts, main }: { amounts: CurrencyAmount[]; main: string }) {
  const shown = amounts.length > 0 ? amounts : [{ amount: 0, currency: main }]
  return (
    <span className="flex flex-wrap gap-x-5">
      {shown.map(({ amount, currency }) => (
        <span key={currency} className="whitespace-nowrap">
          {formatMoney(amount, currency)}
        </span>
      ))}
    </span>
  )
}

/**
 * A page's figures as one card on three columns, lined up with the cards below it. Usually a little sum: each `SumCell` carries
 * the sign that joins it to the one before. `bar` runs along the bottom edge (see `SumBar`).
 */
export function SumBand({ label, columns = 3, bar, secondRow, className, children }: { label: string; columns?: 2 | 3; bar?: ReactNode; /** More figures, under a line on the same columns. */ secondRow?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={clsx('overflow-hidden rounded-2xl border border-line bg-surface', className)}>
      <div className={clsx('grid gap-6', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>{children}</div>
      {secondRow && <div className={clsx('grid gap-6 border-t border-line', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>{secondRow}</div>}
      {bar}
    </section>
  )
}

const SUM_TONES = { good: 'text-good-ink', crit: 'text-crit-ink', accent: 'text-accent' }

interface SumCellProps {
  label: string
  value: ReactNode
  /** Under the value. */
  note?: string
  /** Left out on the first cell. An empty string draws the dividing line with no sign on it. */
  sign?: string
  tone?: keyof typeof SUM_TONES
  /** Opens what's behind the figure. */
  onClick?: () => void
  /** Under the value instead of a note, e.g. a progress bar. */
  children?: ReactNode
}

/** One part of a `SumBand`: always label, value, then one line under it, so the parts stay level. */
export function SumCell({ label, value, note, sign, tone, onClick, children }: SumCellProps) {
  const body = (
    <>
      {sign !== undefined && (
        <>
          {/* In the middle of the gap between the columns. */}
          <span aria-hidden className="absolute inset-y-0 -start-3 w-px bg-line" />
          {sign && (
            <span aria-hidden className="absolute -start-[1.625rem] top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-base font-extrabold leading-none text-muted">
              {sign}
            </span>
          )}
        </>
      )}
      <span className="block truncate text-sm font-semibold text-muted">{label}</span>
      <span className={clsx('mt-1 block whitespace-nowrap text-3xl font-extrabold tabular-nums tracking-tight', tone && SUM_TONES[tone], onClick && 'group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4')}>{value}</span>
      {note && (
        <span title={note} className="mt-0.5 block truncate text-sm text-muted">
          {note}
        </span>
      )}
      {children}
    </>
  )
  const cell = 'group relative flex min-w-0 flex-col justify-start p-5 text-start'
  return onClick ? (
    <button type="button" onClick={onClick} className={cell}>
      {body}
    </button>
  ) : (
    <div className={cell}>{body}</div>
  )
}

/** A whole split in two along the bottom of a `SumBand`. The figures above say the same thing, so it's only a picture of them. */
export function SumBar({ share, fill, rest }: { share: number; fill: string; rest?: string }) {
  return (
    <div aria-hidden className="flex h-2 gap-0.5">
      <span className={clsx('block h-full', fill)} style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
      {share < 1 && rest && <span className={clsx('block h-full flex-1', rest)} />}
    </div>
  )
}

/** The big number, then what it's out of in quieter text: `24,300 DA of 30,400 DA`. */
export function AmountOf({ amount, of }: { amount: string; of: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="whitespace-nowrap">{amount}</span>
      <span className="whitespace-nowrap text-base font-semibold tracking-normal text-muted">{of}</span>
    </span>
  )
}
