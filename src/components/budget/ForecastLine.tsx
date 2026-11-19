import clsx from 'clsx'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { t } from '../../i18n'
import type { BudgetSummary } from '../../lib/budget'
import { cycleForecast } from '../../lib/forecast'

interface ForecastLineProps {
  summary: BudgetSummary
  money: (amount: number) => string
  /** On the accent card. */
  inverse?: boolean
  className?: string
}

/** "At this pace you'll finish 4,000 DA over": where everyday spending is heading by the last day. Nothing when it's too early to say. */
export function ForecastLine({ summary, money, inverse, className }: ForecastLineProps) {
  const forecast = cycleForecast(summary)
  if (!forecast) return null
  const copy = t.forecast
  const over = forecast.left < 0
  const Icon = over ? TrendingUp : TrendingDown
  const text = over
    ? copy.over(money(-forecast.left))
    : forecast.left === 0
      ? copy.even
      : (summary.irregular ? copy.leftMonth : copy.left)(money(forecast.left))
  return (
    <p className={clsx('flex items-start gap-1.5 text-sm font-semibold', inverse ? 'opacity-95' : over ? 'text-warn-ink' : 'text-ink-2', className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
