import clsx from 'clsx'
import { addDays } from 'date-fns'
import { LayoutGrid, SlidersHorizontal } from 'lucide-react'
import { ChevronRight } from '../../components/ui/directionalIcons'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { BudgetBreakdown } from '../../components/budget/BudgetBreakdown'
import { ForecastLine } from '../../components/budget/ForecastLine'
import { budgetNote } from '../../components/budget/budgetText'
import { CycleSwitcher } from '../../components/CycleSwitcher'
import { BudgetOverview, LimitsTable } from '../../components/desk/PlanTables'
import { buttonClass } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatusChip } from '../../components/ui/StatusChip'
import { SummarySplit } from '../../components/ui/SummarySplit'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { budgetSummary, unbudgetedSpending, type BudgetLevel } from '../../lib/budget'
import { fromISODate, getPayCycle, todayISO, toISODate } from '../../lib/dates'
import { inMainCurrency } from '../../lib/currency'
import { formatMoney } from '../../lib/money'
import { isValidDate } from '../../lib/validation'
import { useAppStore } from '../../store'

const TONES: Record<BudgetLevel, 'accent' | 'warn' | 'crit'> = { ok: 'accent', warning: 'warn', over: 'crit' }

export function BudgetPage() {
  const [params, setParams] = useSearchParams()
  const desktop = useIsDesktop()
  const data = useAppStore(
    useShallow((s) => ({ profile: s.profile, settings: s.settings, categories: s.categories, transactions: s.transactions, bills: s.bills, goals: s.goals, debts: s.debts, incomes: s.incomes })),
  )
  const today = todayISO()
  const current = getPayCycle(today, data.profile.salary)
  const cycleParam = params.get('cycle')
  const cycle = cycleParam && isValidDate(cycleParam) ? getPayCycle(cycleParam, data.profile.salary) : current
  const isCurrent = cycle.start === current.start
  const range = useMemo(() => ({ start: cycle.start, end: cycle.end, days: cycle.days }), [cycle.start, cycle.end, cycle.days])
  const summary = useMemo(() => budgetSummary(data, today, range), [data, today, range])
  const unlimited = useMemo(() => unbudgetedSpending(data.categories, inMainCurrency(data.transactions, data.profile.currency), range), [data.categories, data.transactions, data.profile.currency, range])
  const byId = new Map(data.categories.map((c) => [c.id, c]))
  const money = (amount: number) => formatMoney(amount, data.profile.currency)
  const copy = t.budgetTab
  // A category's own stats first; its entries are one tap further.
  const activityLink = (categoryId: string) => `/activity/category/${categoryId}${isCurrent ? '' : `?cycle=${cycle.start}`}`
  const nextPayday = toISODate(addDays(fromISODate(cycle.end), 1))

  const switcher = (
    <CycleSwitcher
      cycle={cycle}
      current={current}
      salary={data.profile.salary}
      onChange={(start) => setParams(start ? { cycle: start } : {}, { replace: true })}
    />
  )

  const unlimitedList = unlimited.length > 0 && (
    <section className="mt-6">
      <h2 className="text-sm font-extrabold">{copy.noLimitTitle}</h2>
      <p className="mb-2 text-sm text-muted">{copy.noLimitBody}</p>
      <ul className="rounded-2xl border border-line bg-surface p-1">
        {unlimited.map(({ categoryId, spent }) => {
          const category = byId.get(categoryId)
          return (
            <li key={categoryId}>
              <Link to={activityLink(categoryId)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={category?.icon ?? 'package'} className="size-[1.125rem]" />
                </span>
                <span className="flex-1 font-bold">{category?.name}</span>
                <span className="font-extrabold tabular-nums">{money(spent)}</span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )

  // What the salary leaves to spend this cycle, and where it goes. Needs a salary to mean anything.
  const hasUsage = summary.flexibleBudget > 0 && summary.waitingFor === 0
  const overview = summary.hasPay && (
    <Card className="mt-3">
      <p className="text-sm font-semibold text-muted">{isCurrent ? (summary.irregular ? copy.resetsMonth : copy.resets)(t.format.dayMonth(nextPayday)) : copy.pastCycle}</p>
      {hasUsage ? (
        <p className="text-2xl font-extrabold tracking-tight">{copy.usedOf(money(summary.flexibleSpent), money(summary.flexibleBudget))}</p>
      ) : (
        <p className="mt-1 text-[0.9375rem] font-semibold">{budgetNote(summary, money)}</p>
      )}
      <ProgressBar
        value={hasUsage ? summary.usedRatio : summary.waitingFor > 0 ? 0 : 1}
        tone={!hasUsage && summary.waitingFor === 0 ? 'crit' : summary.usedRatio >= 1 ? 'crit' : isCurrent && summary.spendingTooFast ? 'warn' : 'accent'}
        marker={isCurrent ? summary.progress.elapsedRatio : undefined}
        label={copy.totalLabel}
        className="mt-3"
      />
      {hasUsage && <p className="mt-2 text-sm text-muted">{copy.usedPercent(Math.round(summary.usedRatio * 100))}</p>}
      {isCurrent && <ForecastLine summary={summary} money={money} className="mt-2" />}
      <BudgetBreakdown summary={summary} currency={data.profile.currency} className="mt-3 border-t border-line pt-2" />
    </Card>
  )

  if (desktop && summary.categories.length > 0) {
    return (
      <div className="space-y-6">
        {summary.hasPay ? (
          <BudgetOverview summary={summary} money={money} note={isCurrent ? copy.paceMark(summary.progress.dayNumber, summary.cycle.days) : copy.pastCycle} showPace={isCurrent} />
        ) : (
          <p className="text-sm text-muted">{isCurrent ? copy.paceMark(summary.progress.dayNumber, summary.cycle.days) : copy.pastCycle}</p>
        )}
        <LimitsTable
          summary={summary}
          byId={byId}
          unlimited={unlimited}
          money={money}
          linkFor={activityLink}
          showPace={isCurrent}
          aside={
            <Link to="/plan/budget/edit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              <SlidersHorizontal aria-hidden className="size-4" />
              {copy.editLimits}
            </Link>
          }
        />
      </div>
    )
  }

  const rail = (
    <>
      {/* On a computer it's in the top bar. */}
      {!desktop && switcher}
      {overview}
    </>
  )

  if (summary.categories.length === 0) {
    return (
      <SummarySplit summary={rail}>
        <div className="mt-3">
          <EmptyState
            icon={LayoutGrid}
            title={copy.emptyTitle}
            body={copy.emptyBody}
            action={
              <Link to="/plan/budget/edit" className={buttonClass()}>
                {copy.setLimits}
              </Link>
            }
          />
        </div>
        {unlimitedList}
      </SummarySplit>
    )
  }

  return (
    <SummarySplit summary={rail}>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold">{copy.limitsTitle}</h2>
          <p className="text-sm text-muted">{copy.limitsBody}</p>
        </div>
        <Link to="/plan/budget/edit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <SlidersHorizontal aria-hidden className="size-4" />
          {copy.editLimits}
        </Link>
      </div>

      <ul className="mt-2 rounded-2xl border border-line bg-surface p-1">
        {summary.categories.map((row) => {
          const category = byId.get(row.categoryId)
          const name = category?.name ?? ''
          const percent = Math.round(row.ratio * 100)
          return (
            <li key={row.categoryId}>
              <Link
                to={activityLink(row.categoryId)}
                className="block rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Icon name={category?.icon ?? 'package'} className="size-[1.125rem]" />
                  </span>
                  <span className="min-w-0 flex-1 font-bold">{name}</span>
                  <span className="shrink-0 font-extrabold tabular-nums">
                    {money(row.spent)} <span className="font-semibold text-muted">/ {money(row.budget)}</span>
                  </span>
                </span>
                <ProgressBar
                  value={row.ratio}
                  tone={TONES[row.level]}
                  marker={isCurrent ? summary.progress.elapsedRatio : undefined}
                  label={copy.barLabel(name)}
                  className="ms-12 mt-2"
                />
                <span className="ms-12 mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                  {row.level === 'over' && <StatusChip tone="crit">{copy.overBy(money(-row.remaining))}</StatusChip>}
                  {row.level === 'warning' && <StatusChip tone="warn">{copy.nearLimit}</StatusChip>}
                  <span className={clsx(row.level === 'over' && 'font-semibold text-crit-ink')}>
                    {copy.percent(percent)}
                    {row.remaining > 0 && ` · ${copy.left(money(row.remaining))}`}
                  </span>
                </span>
                <span className="sr-only">. {copy.seeExpenses(name)}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {isCurrent && <p className="mt-3 text-sm text-muted">{copy.paceMark(summary.progress.dayNumber, summary.cycle.days)}</p>}
      {unlimitedList}
    </SummarySplit>
  )
}
