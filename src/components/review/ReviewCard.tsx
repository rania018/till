import { ClipboardCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { t } from '../../i18n'
import { cycleProgress, getPayCycle } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { cycleReview, lastEndedCycle } from '../../lib/review'
import { useAppStore } from '../../store'
import { dismissReview, reviewDismissedFor } from '../../store/deviceState'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'
import { reviewResult, tipText } from './reviewText'

/**
 * Home's look back at the pay cycle that just ended: shown in the first days of the new one
 * (up to a week, a quarter of the cycle with weekly pay), until "Done".
 */
export function ReviewCard({ today }: { today: string }) {
  const data = useAppStore(
    useShallow((s) => ({ profile: s.profile, settings: s.settings, categories: s.categories, transactions: s.transactions, bills: s.bills, goals: s.goals, debts: s.debts, incomes: s.incomes, accounts: s.accounts })),
  )
  const [dismissed, setDismissed] = useState(reviewDismissedFor)
  const { salary } = data.profile
  const review = useMemo(() => cycleReview(data, lastEndedCycle(today, salary)), [data, today, salary])
  const { cycle } = review
  const current = getPayCycle(today, salary)
  const early = cycleProgress(current, today).dayNumber <= Math.min(7, Math.ceil(current.days / 4))
  // Nothing to look back on: before setup, or a cycle with nothing in it.
  const inUse = data.profile.onboardingCompleted && cycle.end >= data.profile.startDate && (review.spent !== 0 || review.income !== 0)
  if (!early || !inUse || dismissed === cycle.start) return null

  const money = (amount: number) => formatMoney(amount, data.profile.currency)
  const copy = t.review
  const tip = review.tips[0]
  return (
    <section className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <ClipboardCheck aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">{copy.cardTitle(t.format.range(cycle.start, cycle.end))}</h2>
        <p className={review.left < 0 ? 'text-[0.9375rem] font-semibold text-crit-ink' : 'text-[0.9375rem] font-semibold'}>{reviewResult(review, money)}</p>
        <p className="text-sm text-muted">{copy.line(money(review.spent), money(review.saved))}</p>
        {tip && <p className="mt-2 text-sm text-ink-2">{tipText(tip, data.categories, money)}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link to={`/review?cycle=${cycle.start}`} className={buttonClass({ size: 'sm' })}>
            {copy.see}
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dismissReview(cycle.start)
              setDismissed(cycle.start)
            }}
          >
            {copy.done}
          </Button>
        </div>
      </div>
    </section>
  )
}
