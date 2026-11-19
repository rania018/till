import clsx from 'clsx'
import { Sparkles } from 'lucide-react'
import { t } from '../../i18n'
import { totalMonthlyBills } from '../../lib/bills'
import { categoryColor } from '../../lib/categoryTree'
import { formatMoney } from '../../lib/money'
import { monthlySalary } from '../../lib/workHours'
import { CATEGORY_IDS } from '../../store/defaults'
import type { Category } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { StatusChip } from '../ui/StatusChip'
import { Toggle } from '../ui/Toggle'
import type { LimitsDraft } from './useLimitsDraft'

interface LimitsEditorProps {
  draft: LimitsDraft
  /** Keeps the totals in a side rail on larger screens, in view while editing. */
  wide?: boolean
}

/** Free-to-spend summary and one row per category: switch it on or off and set its limit. Used in setup and Plan › Budget. */
export function LimitsEditor({ draft, wide }: LimitsEditorProps) {
  const { profile, bills, goals, categories, free, debtPayments, otherIncome, rows, assigned, difference } = draft
  const copy = t.onboarding.limits
  const money = (amount: number) => formatMoney(amount, profile.currency)

  const subsOf = (id: string) => categories.filter((c) => c.parentId === id)
  const renderRow = (category: Category) => {
    const row = rows[category.id]
    if (!row) return null
    const billNames = bills.filter((b) => b.categoryId === category.id).map((b) => b.name)
    const subs = subsOf(category.id)
    const hint = category.id === CATEGORY_IDS.pets ? copy.petsHint : billNames.length > 0 ? copy.billsHint(billNames.join(', ')) : subs.length > 0 ? copy.groupHint(subs.map((c) => c.name).join(', ')) : undefined
    return (
      <li key={category.id} className={clsx('flex items-center gap-3 py-2', category.parentId && 'ps-6')}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl text-ink" style={{ background: `color-mix(in oklab, ${categoryColor(categories, category.id)} ${category.parentId ? 30 : 60}%, transparent)` }}>
          <Icon name={category.icon} className="size-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight">{category.name}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
        {row.enabled && (
          <AmountInput
            size="sm"
            className="w-32 shrink-0"
            value={row.limit}
            onChange={(limit) => draft.update(category.id, { limit })}
            placeholder={copy.noLimit}
            aria-label={copy.limitLabel(category.name)}
            currency={profile.currency}
          />
        )}
        <Toggle checked={row.enabled} onChange={(enabled) => draft.update(category.id, { enabled })} label={copy.useLabel(category.name)} />
      </li>
    )
  }

  return (
    <div className={clsx('space-y-5', wide && 'lg:grid lg:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)] lg:items-start lg:gap-6 lg:space-y-0')}>
      <Card className={clsx(wide && 'lg:sticky lg:top-6 desk:top-[5.5rem]')}>
        <p className="text-sm font-semibold text-muted">{copy.freeLabel}</p>
        <p className="text-2xl font-extrabold tracking-tight">{money(free)}</p>
        <p className="text-sm text-muted">
          {copy.freeBreakdown(
            money(monthlySalary(profile.salary)),
            otherIncome > 0 ? money(otherIncome) : null,
            money(totalMonthlyBills(bills)),
            debtPayments > 0 ? money(debtPayments) : null,
            money(goals.reduce((sum, g) => sum + g.monthlyContribution, 0)),
          )}
        </p>
        {free <= 0 ? (
          <p className="mt-3 text-sm text-ink-2">{copy.nothingFree}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-sm font-bold">{copy.assigned(money(assigned))}</span>
              {difference === 0 ? (
                <StatusChip tone="good">{copy.balanced}</StatusChip>
              ) : difference > 0 ? (
                <StatusChip tone="info">{copy.unassigned(money(difference))}</StatusChip>
              ) : (
                <StatusChip tone="warn">{copy.over(money(-difference))}</StatusChip>
              )}
            </div>
            <Button variant="secondary" size="sm" icon={Sparkles} onClick={draft.suggest} className="mt-3">
              {copy.suggest}
            </Button>
          </>
        )}
      </Card>

      <div className="min-w-0 space-y-5">
        <ul className="divide-y divide-line">{categories.filter((c) => !c.optional && !c.parentId).flatMap((main) => [renderRow(main), ...subsOf(main.id).filter((c) => !c.optional).map(renderRow)])}</ul>

        <section>
          <h2 className="text-sm font-bold">{copy.optionalTitle}</h2>
          <p className="text-sm text-muted">{copy.optionalHint}</p>
          <ul className="mt-1 divide-y divide-line">{categories.filter((c) => c.optional).map(renderRow)}</ul>
        </section>
      </div>
    </div>
  )
}
