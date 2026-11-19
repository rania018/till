import { currencySymbol, formatAmount } from '../../lib/money'

/** Three tiles share a phone's width: a smaller currency keeps 60,000 DA on one line. */
export function TileAmount({ amount, currency }: { amount: number; currency: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1 tabular-nums">
      <span className="whitespace-nowrap">{`${amount < 0 ? '−' : ''}${formatAmount(amount, currency)}`}</span>
      <span className="whitespace-nowrap text-xs font-bold text-muted">{currencySymbol(currency)}</span>
    </span>
  )
}
