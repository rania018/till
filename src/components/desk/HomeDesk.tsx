import clsx from 'clsx'
import { addDays } from 'date-fns'
import { ChevronDown } from 'lucide-react'
import { ForecastLine } from '../budget/ForecastLine'
import { BudgetBreakdown } from '../budget/BudgetBreakdown'
import { ChevronRight } from '../ui/directionalIcons'
import { useMemo, useState, type ComponentProps } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n'
import { leftShown, type BudgetSummary } from '../../lib/budget'
import { inMainCurrency } from '../../lib/currency'
import { fromISODate, toISODate } from '../../lib/dates'
import { cumulativeSpending, dailySpending } from '../../lib/stats'
import { formatCompact, formatMoney } from '../../lib/money'
import type { Category, ISODate, Transaction } from '../../types'
import { useDetail } from '../detail/useDetail'
import { AlertList } from '../home/AlertList'
import { SafekeepingCard } from '../home/SafekeepingCard'
import { FundsDueCard } from '../goals/FundsDueCard'
import { ReviewCard } from '../review/ReviewCard'
import { budgetNote } from '../budget/budgetText'
import { RepeatApprovals } from '../debts/RepeatApprovals'
import { ExpectedPays } from '../income/ExpectedPays'
import { BillsCard, CardHeader, DebtsCard, GoalsCard, SeeAll, WalletsCard } from '../home/HomeCards'
import { WhereItWentCard } from '../home/WhereItWentCard'
import { TransactionTable } from './TransactionTable'
import type { TransactionNames } from '../transactions/describe'
import { CategoryBadge } from '../ui/CategoryBadge'
import { ProgressBar } from '../ui/ProgressBar'
import { PaceStrip } from './PaceStrip'
import { Panel } from './Panel'

interface HomeDeskProps {
  summary: BudgetSummary
  currency: string
  today: ISODate
  yesterday: ISODate
  transactions: Transaction[]
  recent: Transaction[]
  names: TransactionNames
  categories: Category[]
  alerts: ComponentProps<typeof AlertList>
  reminder: React.ReactNode
  wallets: ComponentProps<typeof WalletsCard>
  bills: ComponentProps<typeof BillsCard>
  goals: ComponentProps<typeof GoalsCard>
  debts: ComponentProps<typeof DebtsCard>
}

const TONES = { ok: 'accent', warning: 'warn', over: 'crit' } as const

/** More limits than this would make their row taller than anything beside it: the ones closest to running out stay, and "See all" has the rest. */
const MAX_LIMITS = 9

/**
 * The pay cycle at a glance, on one grid of three equal columns: the budget and wallets, what needs a look,
 * then spending, limits and plans. Cards in a row share their top and bottom, so every column ends on the same line.
 */
export function HomeDesk({ summary, currency, today, yesterday, transactions, recent, names, categories, alerts, reminder, wallets, bills, goals, debts }: HomeDeskProps) {
  const money = (amount: number) => formatMoney(amount, currency)
  const copy = t.desk.home
  const byId = new Map(categories.map((c) => [c.id, c]))
  const { open } = useDetail()
  const navigate = useNavigate()
  const mine = useMemo(() => inMainCurrency(transactions, currency), [transactions, currency])
  const pace = useMemo(() => cumulativeSpending(mine, summary.cycle, summary.flexibleBudget, today), [mine, summary.cycle, summary.flexibleBudget, today])
  const hasSalary = summary.hasPay
  const waiting = summary.waitingFor > 0
  // With nothing to spend, a share of it means nothing: the bar is simply full. It's empty while pay is on its way.
  const hasBudget = summary.flexibleBudget > 0 && !waiting
  // The sum is the longest part of the card, so it opens from the figure it explains.
  const [showingSum, setShowingSum] = useState(false)
  const usedAndElapsed = hasBudget ? t.home.usedAndElapsed(Math.round(summary.usedRatio * 100), Math.round(summary.progress.elapsedRatio * 100)) : undefined
  const headlines = [
    { label: t.home.safeToSpend, value: t.home.perDay(money(summary.safePerDay)) },
    { label: summary.irregular ? copy.monthEnds : copy.payday, value: copy.daysLeft(summary.progress.daysLeft) },
  ]
  const totals = [
    { label: t.home.spent, value: summary.spent },
    { label: t.home.income, value: summary.income },
    { label: t.home.saved, value: summary.saved },
  ]

  // This week, day by day, from the language's first day of the week.
  const week = useMemo(() => {
    const date = fromISODate(today)
    const start = addDays(date, -((date.getDay() - t.format.weekStartsOn + 7) % 7))
    return dailySpending(mine, { start: toISODate(start), end: toISODate(addDays(start, 6)) }, today)
  }, [mine, today])
  const weekHigh = Math.max(summary.safePerDay, ...week.map((d) => d.spent ?? 0))
  const showDay = (date: ISODate) => open({ target: { kind: 'day', date }, range: { start: date, end: date } })

  const hasLimits = summary.categories.length > 0
  const limits = summary.categories.length > MAX_LIMITS ? [...summary.categories].sort((a, b) => b.ratio - a.ratio).slice(0, MAX_LIMITS) : summary.categories
  // Beside the limits the ring goes above its rows, and there are as many rows as fill the same height; without limits it has the room to sit beside them.
  const spendingRows = hasLimits ? Math.min(7, Math.max(4, limits.length - 3)) : 4

  const needsALook = (
    <>
      {reminder}
      <AlertList {...alerts} columns />
      <RepeatApprovals />
      <ReviewCard today={today} />
      <FundsDueCard today={today} />
      <SafekeepingCard />
    </>
  )

  return (
    <div className="space-y-6 @container">
      <div className="grid gap-6 @min-[48rem]:grid-cols-2 @min-[66rem]:grid-cols-3">
        <div className="min-w-0 @min-[48rem]:col-span-2">
          {hasSalary ? (
            <section className="@container/hero flex h-full flex-col rounded-2xl bg-accent px-6 py-5 text-on-accent">
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <div>
                  <button
                    type="button"
                    aria-expanded={showingSum}
                    title={t.home.howWorkedOut}
                    onClick={() => setShowingSum((shown) => !shown)}
                    className="-ms-2 flex min-h-7 items-center gap-1 rounded-lg ps-2 pe-1 text-sm font-bold transition-colors hover:bg-on-accent/15"
                  >
                    <span className="opacity-85">{t.home.leftToSpend}</span>
                    <span className="sr-only">· {t.home.howWorkedOut}</span>
                    <ChevronDown aria-hidden className={clsx('size-4 opacity-85 transition-transform', showingSum && 'rotate-180')} />
                  </button>
                  <p className="whitespace-nowrap text-5xl font-extrabold tracking-tight">{money(leftShown(summary))}</p>
                </div>
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  {headlines.map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-sm font-bold opacity-85">{label}</dt>
                      <dd className="mt-0.5 whitespace-nowrap text-xl font-extrabold tracking-tight tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* The mark on the bar is how much of the cycle has gone: spelled out on hover and for screen readers. */}
              <div className="mt-3.5" title={usedAndElapsed}>
                <ProgressBar value={waiting ? 0 : hasBudget ? summary.usedRatio : 1} marker={summary.progress.elapsedRatio} tone="inverse" label={t.home.usedLabel} />
                {usedAndElapsed && <p className="sr-only">{usedAndElapsed}</p>}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
                <p className="opacity-90">{budgetNote(summary, money)}</p>
                <ForecastLine summary={summary} money={money} inverse />
              </div>
              {showingSum && <BudgetBreakdown summary={summary} currency={currency} inverse className="mt-3 border-t border-on-accent/25 pt-3 @min-[44rem]/hero:columns-2 @min-[44rem]/hero:gap-x-10 [&_dl>div]:break-inside-avoid" />}

              {/* Any height the wallets beside it add goes here, keeping the charts on the card's bottom edge. */}
              <div aria-hidden className="min-h-3.5 grow" />

              {/* Three strips side by side; a narrower card lays the totals out in a row over the other two, so it doesn't get taller. */}
              <div className={clsx('grid items-center gap-x-8 gap-y-3 border-t border-on-accent/25 pt-3.5', hasBudget ? '@min-[36rem]/hero:grid-cols-2 @min-[44rem]/hero:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)]' : '@min-[36rem]/hero:grid-cols-[auto_minmax(0,1fr)]')}>
                <dl aria-label={t.home.tilesLabel} className={clsx('grid gap-x-8 gap-y-1.5', hasBudget && '@min-[36rem]/hero:@max-[44rem]/hero:col-span-2 @min-[36rem]/hero:@max-[44rem]/hero:grid-cols-3')}>
                  {totals.map(({ label, value }) => (
                    <div key={label} className="flex items-baseline justify-between gap-6 text-sm">
                      <dt className="font-semibold opacity-85">{label}</dt>
                      <dd className="whitespace-nowrap font-extrabold tabular-nums">{money(value)}</dd>
                    </div>
                  ))}
                </dl>

                <div className="min-w-0">
                  {/* The day names say what this is, so the heading is only needed without them. */}
                  <h2 className="sr-only">{copy.thisWeek}</h2>
                  <ol className="grid grid-cols-7 gap-1">
                    {week.map((day) => {
                      const future = day.spent === null
                      const name = t.format.weekdaysShort[fromISODate(day.date).getDay()]
                      const label = future ? copy.weekToCome(t.format.shortDay(day.date)) : copy.weekDay(t.format.shortDay(day.date), money(day.spent ?? 0))
                      return (
                        <li key={day.date}>
                          <button
                            type="button"
                            disabled={future}
                            aria-label={label}
                            title={label}
                            onClick={() => showDay(day.date)}
                            className={clsx('flex w-full flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-colors enabled:hover:bg-on-accent/10', day.date === today && 'bg-on-accent/10')}
                          >
                            <span aria-hidden className="flex h-8 w-full items-end justify-center">
                              <span
                                className={clsx('block w-3/5 max-w-5 rounded-t-[3px]', future ? 'h-px bg-on-accent/30' : 'min-h-0.5 bg-on-accent')}
                                style={future ? undefined : { height: `${weekHigh > 0 ? ((day.spent ?? 0) / weekHigh) * 100 : 0}%` }}
                              />
                            </span>
                            <span aria-hidden className={clsx('text-xs font-bold', day.date === today ? 'opacity-100' : 'opacity-80')}>
                              {name}
                            </span>
                            <span aria-hidden className="h-4 whitespace-nowrap text-xs font-semibold leading-4 opacity-85">
                              {future ? '' : formatCompact(day.spent ?? 0, weekHigh)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </div>

                {/* An even pace toward nothing, or toward a budget still on its way, would only mislead. */}
                {hasBudget && <PaceStrip points={pace} budget={summary.flexibleBudget} currency={currency} onSelectDay={showDay} className="min-w-0" />}
              </div>
            </section>
          ) : (
            <Panel className="flex h-full items-center gap-3 px-6 py-5">
              <p className="flex-1 text-sm text-ink-2">{t.home.noSalary}</p>
              <Link to="/settings/pay" className="text-sm font-bold text-accent">
                {t.home.noSalaryAction}
              </Link>
            </Panel>
          )}
        </div>

        {/* Beside the budget from the top; with only two columns, it moves below with the other plans. */}
        <div className="min-w-0 @max-[66rem]:order-last">
          <WalletsCard {...wallets} />
        </div>

        {/* What needs a look comes right under the card and takes the room it needs, on the same columns as what's below it. */}
        <div className="col-span-full space-y-3 empty:hidden">{needsALook}</div>

        <div className="col-span-full empty:hidden">
          <ExpectedPays today={today} />
        </div>

        {/* Nothing spent yet shows no card here: `peer` lets the limits take its place, so no column is left blank. */}
        <div className={clsx('peer min-w-0 empty:hidden', !hasLimits && '@min-[48rem]:col-span-2')}>
          <WhereItWentCard transactions={transactions} categories={categories} cycle={summary.cycle} currency={currency} rows={spendingRows} size={hasLimits ? 144 : 128} stacked={hasLimits} className="h-full" />
        </div>

        {hasLimits && (
          <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 @min-[48rem]:peer-empty:col-span-2">
            <CardHeader title={copy.limits} action={<SeeAll to="/plan/budget" />} />
            {/* The rows share the card's height evenly, however few limits there are. */}
            <ul className="-mx-2 grid flex-1 auto-rows-fr">
              {limits.map((row) => {
                const category = byId.get(row.categoryId)
                return (
                  <li key={row.categoryId}>
                    <button type="button" onClick={() => navigate(`/activity/category/${row.categoryId}`)} className="flex size-full flex-col justify-center rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-surface-2">
                      <span className="flex w-full items-center gap-2.5 text-sm">
                        <CategoryBadge categories={categories} id={row.categoryId} size="sm" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{category?.name}</span>
                        <span className={clsx('shrink-0 text-sm font-semibold tabular-nums', row.level === 'over' ? 'text-crit-ink' : 'text-muted')}>
                          {row.remaining >= 0 ? t.budgetTab.left(money(row.remaining)) : t.budgetTab.overBy(money(-row.remaining))}
                        </span>
                      </span>
                      <ProgressBar value={row.ratio} tone={TONES[row.level]} marker={summary.progress.elapsedRatio} label={t.budgetTab.barLabel(category?.name ?? '')} className="mt-1.5 w-full" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* The cards share out whatever height the row has, so this column ends level with the others. With two columns they join the grid themselves, beside the wallets. */}
        <div className={clsx('flex min-w-0 flex-col gap-6 *:grow @max-[66rem]:contents @max-[66rem]:*:order-last', !hasLimits && '@min-[48rem]:peer-empty:col-span-full')}>
          <BillsCard {...bills} />
          <GoalsCard {...goals} />
          <DebtsCard {...debts} />
        </div>
      </div>

      {recent.length > 0 && (
        <Panel
          title={t.home.recent}
          aside={
            <Link to="/activity/list" className="flex items-center gap-0.5 text-sm font-bold text-accent">
              {t.home.seeAll}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          }
        >
          <TransactionTable transactions={recent} names={names} currency={currency} today={today} yesterday={yesterday} />
        </Panel>
      )}
    </div>
  )
}
