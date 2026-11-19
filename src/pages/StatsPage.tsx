import { ChartColumn, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { useDetail } from '../components/detail/useDetail'
import { SumBand, SumCell } from '../components/desk/Panel'
import { CardHeader } from '../components/home/HomeCards'
import { ExportButton } from '../components/ExportButton'
import { LookBackLinks } from '../components/review/LookBackLinks'
import { FLOW } from '../components/stats/chartTheme'
import { OwedChart, PaceChart, SavingsRateChart, TrendChart } from '../components/stats/charts'
import { CompareCard, IncomeCard, TopItemsCard, WalletCard } from '../components/insights/InsightCards'
import { categoryStatsLink, listLink, useOpenItem } from '../components/insights/period'
import { DayHeatmap } from '../components/stats/DayHeatmap'
import { DebtStats } from '../components/stats/DebtStats'
import { PayFlow } from '../components/stats/PayFlow'
import { ShareRing } from '../components/stats/ShareRing'
import { StatsTabs } from '../components/stats/StatsTabs'
import { CategoryRanking, SplitCard } from '../components/stats/StatsLists'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { inputClass } from '../components/ui/formStyles'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Select'
import { StatTile } from '../components/ui/StatTile'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { totalMonthlyBills } from '../lib/bills'
import { budgetSummary } from '../lib/budget'
import { categoryColor } from '../lib/categoryTree'
import { cycleProgress, getPayCycle, previousCycle, todayISO } from '../lib/dates'
import { debtViews } from '../lib/debts'
import type { DetailPart } from '../lib/detail'
import { statsWorkbook } from '../lib/export/pages'
import { live } from '../lib/id'
import { inMainCurrency, otherCurrencyTotals } from '../lib/currency'
import { formatDecimal, formatMoney } from '../lib/money'
import {
  biggestExpense,
  busiestWeekday,
  cumulativeSpending,
  cycleTrend,
  dailySpending,
  incomeBreakdown,
  mainCategoryBreakdown,
  mainCategoryHistory,
  PERIOD_KINDS,
  debtBalances,
  debtFlows,
  keptAfterDebts,
  periodTotals,
  savingsRate,
  skippedSavings,
  statsPeriod,
  topItems,
  walletFlows,
  type StatsPeriodKind,
  type TrendPoint,
} from '../lib/stats'
import { nameOf } from '../lib/transactions'
import { isValidDate } from '../lib/validation'
import { formatWorkTime, hourlyRate, workTimeFor } from '../lib/workHours'
import { appStore, useAppStore } from '../store'
import type { ID } from '../types'

/** One row of cards on a computer: three abreast, sharing their top and bottom, and whatever a page leaves out, the others spread to fill. */
const STATS_ROW = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] gap-6 @max-[66rem]:[&>:last-child:nth-child(odd)]:col-span-full'
const CHART_HEIGHT = 230

/**
 * Insights from the transaction log. Each "month" is one pay cycle; the period lives in the URL.
 * Anything with entries behind it opens them in the details panel, beside the page.
 */
export function StatsPage() {
  const [params, setParams] = useSearchParams()
  const desktop = useIsDesktop()
  const { open } = useDetail()
  const navigate = useNavigate()
  const openItem = useOpenItem()
  const [activeCategory, setActiveCategory] = useState<ID | null>(null)
  const data = useAppStore(
    useShallow((s) => ({
      profile: s.profile,
      settings: s.settings,
      categories: s.categories,
      transactions: s.transactions,
      accounts: s.accounts,
      bills: s.bills,
      goals: s.goals,
      debts: s.debts,
      incomes: s.incomes,
      wishlist: s.wishlist,
    })),
  )
  const today = todayISO()
  const kindParam = params.get('period') as StatsPeriodKind | null
  const kind = kindParam && PERIOD_KINDS.includes(kindParam) ? kindParam : 'cycle'
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const from = fromParam && isValidDate(fromParam) ? fromParam : undefined
  const to = toParam && isValidDate(toParam) ? toParam : undefined
  const { salary, currency, work } = data.profile

  const period = useMemo(
    () => statsPeriod(kind, today, salary, kind === 'custom' ? { start: from ?? '', end: to ?? today } : undefined),
    [kind, today, salary, from, to],
  )
  const stats = useMemo(() => {
    const { accounts } = data
    // Everything on this page is in the main currency: amounts in others can't be added to it.
    const transactions = inMainCurrency(data.transactions, data.profile.currency)
    const totals = periodTotals(transactions, accounts, period.range)
    const singleCycle = kind === 'cycle' || kind === 'last' ? getPayCycle(period.range.start, salary) : null
    const summary = singleCycle ? budgetSummary(data, today, singleCycle) : null
    const budget = summary?.flexibleBudget ?? 0
    return {
      totals,
      previousSpent: periodTotals(transactions, accounts, period.previous).spent,
      // By main category: each opens its own stats, with its subcategories.
      breakdown: mainCategoryBreakdown(transactions, period.range, period.previous, data.categories),
      history: mainCategoryHistory(transactions, period.trend, data.categories),
      income: incomeBreakdown(transactions, period.range),
      wallets: walletFlows(transactions, accounts, period.range),
      top: topItems(transactions, period.range),
      days: dailySpending(transactions, period.range, today),
      trend: cycleTrend(transactions, accounts, period.trend, today, data.debts),
      flows: debtFlows(transactions, data.debts, period.range),
      debtViews: debtViews(data.debts, data.transactions, getPayCycle(today, salary), today),
      balances: debtBalances(data.debts, data.transactions, period.trend, data.profile.currency, today),
      // While pay is on its way, or there's none, there's nothing for it to flow from.
      payFlow: summary && summary.hasPay && summary.waitingFor === 0 ? summary : null,
      biggest: biggestExpense(transactions, period.range),
      busiest: busiestWeekday(transactions, period.range),
      skipped: skippedSavings(data.wishlist, period.range),
      pace: singleCycle && budget > 0 ? { points: cumulativeSpending(transactions, singleCycle, budget, today), budget } : null,
      others: otherCurrencyTotals(data.transactions, period.range, data.profile.currency),
    }
  }, [data, period, kind, salary, today])

  const money = (amount: number) => formatMoney(amount, currency)
  const rate = data.settings.showWorkHours ? hourlyRate(data.profile, totalMonthlyBills(data.bills)) : null
  const copy = t.stats

  const setPeriod = (next: StatsPeriodKind) =>
    setParams(
      next === 'cycle'
        ? {}
        : next === 'custom'
          ? { period: next, from: period.range.start, to: period.range.end < today ? period.range.end : today }
          : { period: next },
      { replace: true },
    )
  const setCustom = (key: 'from' | 'to', value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('period', 'custom')
        next.set(key, value)
        return next
      },
      { replace: true },
    )

  // What a click opens: the entries behind it, over the dates on screen.
  const range = { start: period.range.start, end: period.range.end }
  const showCategory = (id: ID) => navigate(categoryStatsLink(id, range, salary))
  const colorOf = (id: ID) => categoryColor(data.categories, id)
  const insights = (
    <>
      <IncomeCard rows={stats.income} categories={data.categories} currency={currency} onSelect={(id) => navigate(listLink({ kind: 'income', category: id }, range, salary))} />
      <WalletCard accounts={data.accounts} flows={stats.wallets} transactions={inMainCurrency(data.transactions, currency)} cycles={period.trend} today={today} currency={currency} onSelect={(id) => navigate(listLink({ wallet: id }, range, salary))} />
      <TopItemsCard items={stats.top} categories={data.categories} currency={currency} onSelect={(item) => openItem(item.name, range)} />
      <CompareCard transactions={inMainCurrency(data.transactions, currency)} categories={data.categories} salary={salary} today={today} currency={currency} onSelect={(id, cycle) => navigate(categoryStatsLink(id, cycle, salary))} />
    </>
  )
  const showDay = (date: string) => open({ target: { kind: 'day', date }, range: { start: date, end: date } })
  const showPart = (part: DetailPart) => open({ target: { kind: 'part', part }, range })
  const showDebt = (id: ID) => open({ target: { kind: 'debt', id }, range: null })
  const showWeekday = (day: number) => open({ target: { kind: 'weekday', day }, range })
  // A pay cycle clicked in the trend becomes the period shown, with Back to return.
  const showCycle = (point: TrendPoint) => {
    const current = getPayCycle(today, salary)
    if (point.cycle.start === current.start) return setParams({})
    if (point.cycle.start === previousCycle(current, salary).start) return setParams({ period: 'last' })
    setParams({ period: 'custom', from: point.cycle.start, to: point.cycle.end < today ? point.cycle.end : today })
  }

  if (live(data.transactions).length === 0) {
    return (
      <>
        <PageHeader title={copy.title} />
        <EmptyState
          icon={ChartColumn}
          title={copy.emptyTitle}
          body={copy.emptyBody}
          action={
            <Button icon={Plus} onClick={() => openTransactionSheet('expense')}>
              {t.activity.addFirst}
            </Button>
          }
        />
      </>
    )
  }

  const { totals, breakdown, history, days, trend, flows, biggest, busiest, skipped, pace, others, payFlow, balances } = stats
  const kept = keptAfterDebts(totals, flows)
  const debtsSection = <DebtStats views={stats.debtViews} flows={flows} currency={currency} showInstalments={kind === 'cycle'} onSelect={showDebt} />
  const owedOverTime = balances.length > 1 && balances.some((b) => b.owed > 0 || b.owedToYou > 0)
  const heroLabel = kind === 'custom' ? copy.hero.custom(t.format.range(period.range.start, period.range.end)) : copy.hero[kind]
  const compareKey = kind === 'cycle' || kind === 'last' ? kind : 'other'
  const daysLeft = kind === 'cycle' ? cycleProgress(getPayCycle(today, salary), today).daysLeft : null
  const flexibleDaily = period.elapsedDays > 0 ? totals.flexible / period.elapsedDays : 0
  const rateOfSavings = savingsRate(totals, flows)
  // A pay cycle still running has its bills to come, so its rate only says how it's going so far.
  const rateHint = period.isCurrent ? copy.tiles.savingsRateSoFar : copy.tiles.savingsRateHint
  const workTime = rate ? workTimeFor(totals.spent, rate, work.hoursPerDay) : null
  const biggestHint = biggest ? `${biggest.note?.split('\n')[0] || nameOf(data.categories, biggest.categoryId)} · ${t.format.dayMonth(biggest.date)}` : undefined
  const exportButton = <ExportButton workbook={() => statsWorkbook(appStore.getState(), today, period)} />
  const fixedSplit = [
    { label: copy.split.flexible, amount: totals.flexible, color: FLOW.everyday, onSelect: () => showPart('everyday') },
    { label: copy.split.fixed, amount: totals.fixed, color: FLOW.bills, onSelect: () => showPart('bills') },
  ]
  const cashSplit = [
    { label: copy.split.cash, amount: totals.cash, color: FLOW.income, onSelect: () => showPart('cash') },
    { label: copy.split.card, amount: totals.card, color: FLOW.other, onSelect: () => showPart('card') },
  ]
  const othersSection = others.length > 0 && (
    <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 desk:p-6">
      <h2 className="text-sm font-extrabold">{copy.otherCurrencies}</h2>
      <p className="mt-0.5 text-sm text-muted">{copy.otherHint}</p>
      <ul className="mt-2 divide-y divide-line">
        {others.map((row) => (
          <li key={row.currency} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <span className="font-bold">{row.currency}</span>
            <span className="text-sm font-semibold tabular-nums text-ink-2">{copy.otherLine(formatMoney(row.spent, row.currency), formatMoney(row.received, row.currency))}</span>
          </li>
        ))}
      </ul>
    </section>
  )

  if (desktop) {
    const splits = (
      <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
        <CardHeader title={t.desk.stats.splits} />
        <div className="-mx-3.5 grid flex-1 auto-rows-fr divide-y divide-line">
          <SplitCard title={copy.split.fixedTitle} currency={currency} parts={fixedSplit} bare />
          <SplitCard title={copy.split.cashTitle} currency={currency} parts={cashSplit} bare />
        </div>
      </section>
    )
    const dateField = (key: 'from' | 'to', value: string) => (
      <label className="flex items-center gap-1.5">
        {copy[key]}
        <input type="date" value={value} max={today} onChange={(e) => e.target.value && setCustom(key, e.target.value)} className={inputClass({ className: 'w-36' })} />
      </label>
    )
    const transactionsInMain = inMainCurrency(data.transactions, currency)
    return (
      <>
        <PageHeader
          title={copy.title}
          nav={<StatsTabs />}
          centerNav
          actions={
            <>
              <div className="w-36 shrink-0">
                <Select aria-label={copy.periodLabel} value={kind} onChange={(e) => setPeriod(e.target.value as StatsPeriodKind)} className="min-h-10 py-1.5 text-sm">
                  {PERIOD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {copy.periods[k]}
                    </option>
                  ))}
                </Select>
              </div>
              <ExportButton iconOnly workbook={() => statsWorkbook(appStore.getState(), today, period)} />
            </>
          }
        />

        {/* `data-quiet`: the sentences explaining each chart are on hover here, and still read out to screen readers. */}
        <div data-quiet className="space-y-6 @container">
          {kind === 'custom' && (
            <div className="flex items-center justify-end gap-3 text-xs font-bold">
              {dateField('from', period.range.start)}
              {dateField('to', period.range.end)}
            </div>
          )}

          <SumBand
            label={copy.tiles.label}
            secondRow={
              <>
                <SumCell label={copy.tiles.biggest} value={biggest ? money(biggest.amount) : copy.tiles.none} note={biggestHint} onClick={biggest ? () => showDay(biggest.date) : undefined} />
                <SumCell sign="" label={copy.tiles.busiest} value={busiest === null ? copy.tiles.none : t.format.weekdays[busiest]} note={busiest === null ? undefined : copy.tiles.busiestHint} onClick={busiest === null ? undefined : () => showWeekday(busiest)} />
                <SumCell sign="" label={copy.tiles.skipped} value={money(skipped.total)} note={copy.tiles.skippedHint(skipped.count)} />
              </>
            }
          >
            <SumCell label={heroLabel} value={money(totals.spent)} tone="accent" note={copy.compare[compareKey](money(stats.previousSpent))}>
              {workTime && <span className="mt-0.5 block truncate text-sm font-bold text-accent">{copy.heroWork(formatWorkTime(workTime), copy.tiles.workDays(formatDecimal(workTime.workDays)))}</span>}
            </SumCell>
            <SumCell sign="" label={copy.tiles.dailyAverage} value={money(Math.round(flexibleDaily))} note={t.desk.stats.overDays(period.elapsedDays)} onClick={() => showPart('everyday')} />
            <SumCell sign="" label={copy.tiles.kept} value={money(kept)} tone={kept < 0 ? 'crit' : undefined} note={rateOfSavings === null ? copy.tiles.keptHint : `${Math.round(rateOfSavings * 100)}% ${rateHint}`} />
          </SumBand>

          <CategoryRanking
            rows={breakdown}
            categories={data.categories}
            currency={currency}
            rate={rate}
            hoursPerDay={work.hoursPerDay}
            compareLabel={copy.compareLabel[compareKey]}
            onSelect={showCategory}
            active={activeCategory}
            onActive={setActiveCategory}
            history={history}
            colorOf={colorOf}
            lead={<ShareRing rows={breakdown} categories={data.categories} currency={currency} active={activeCategory} onActive={setActiveCategory} onSelect={showCategory} colorOf={colorOf} />}
            dense
          />

          <div className={STATS_ROW}>
            <DayHeatmap days={days} currency={currency} onSelect={showDay} compact />
            {payFlow ? <PayFlow summary={payFlow} currency={currency} onSelect={showPart} compact /> : splits}
            <TopItemsCard items={stats.top} categories={data.categories} currency={currency} onSelect={(item) => openItem(item.name, range)} compact />
          </div>

          <div className={STATS_ROW}>
            <TrendChart points={trend} currency={currency} height={CHART_HEIGHT} onSelect={showCycle} />
            {pace && <PaceChart points={pace.points} budget={pace.budget} currency={currency} height={CHART_HEIGHT} onSelectDay={showDay} />}
            <SavingsRateChart points={trend} height={CHART_HEIGHT} />
          </div>

          <div className={STATS_ROW}>
            <CompareCard transactions={transactionsInMain} categories={data.categories} salary={salary} today={today} currency={currency} onSelect={(id, cycle) => navigate(categoryStatsLink(id, cycle, salary))} wide className="@min-[66rem]:col-span-2" />
            <div className="min-w-0 empty:hidden @max-[66rem]:col-span-full">{debtsSection}</div>
          </div>

          <div className={STATS_ROW}>
            <div className="flex min-w-0 flex-col gap-6 *:grow">
              <IncomeCard rows={stats.income} categories={data.categories} currency={currency} onSelect={(id) => navigate(listLink({ kind: 'income', category: id }, range, salary))} />
              <WalletCard only="flows" accounts={data.accounts} flows={stats.wallets} transactions={transactionsInMain} cycles={period.trend} today={today} currency={currency} onSelect={(id) => navigate(listLink({ wallet: id }, range, salary))} />
            </div>
            {payFlow && splits}
            <div className="min-w-0 empty:hidden">
              <WalletCard only="balances" accounts={data.accounts} flows={stats.wallets} transactions={transactionsInMain} cycles={period.trend} today={today} currency={currency} onSelect={(id) => navigate(listLink({ wallet: id }, range, salary))} />
            </div>
          </div>

          {(owedOverTime || othersSection) && (
            <div className={STATS_ROW}>
              {owedOverTime && <OwedChart balances={balances} currency={currency} height={CHART_HEIGHT} />}
              {othersSection}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        actions={
          <>
            <LookBackLinks />
            {exportButton}
          </>
        }
      />

      <div role="group" aria-label={copy.periodLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PERIOD_KINDS.map((k) => (
          <Chip key={k} selected={kind === k} onClick={() => setPeriod(k)}>
            {copy.periods[k]}
          </Chip>
        ))}
      </div>
      {kind === 'custom' && (
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">{copy.from}</span>
            <input type="date" value={period.range.start} max={today} onChange={(e) => e.target.value && setCustom('from', e.target.value)} className={inputClass({ className: 'min-h-11' })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">{copy.to}</span>
            <input type="date" value={period.range.end} max={today} onChange={(e) => e.target.value && setCustom('to', e.target.value)} className={inputClass({ className: 'min-h-11' })} />
          </label>
        </div>
      )}

      <div className="xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-center xl:gap-6">
        <section className="mt-5">
          <p className="text-sm font-bold text-muted">{heroLabel}</p>
          <p className="text-5xl font-extrabold tracking-tight">{money(totals.spent)}</p>
          {workTime && <p className="mt-1 text-sm font-bold text-accent">{copy.heroWork(formatWorkTime(workTime), copy.tiles.workDays(formatDecimal(workTime.workDays)))}</p>}
          <p className="mt-1 text-sm text-muted">
            {copy.compare[compareKey](money(stats.previousSpent))}
            {daysLeft !== null && ` · ${t.home.daysToPayday(daysLeft)}`}
          </p>
        </section>

        <section aria-label={copy.tiles.label} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label={copy.tiles.dailyAverage} value={money(Math.round(flexibleDaily))} hint={copy.tiles.overDays(period.elapsedDays)} onClick={() => showPart('everyday')} />
          <StatTile label={copy.tiles.biggest} value={biggest ? money(biggest.amount) : copy.tiles.none} hint={biggestHint} onClick={biggest ? () => showDay(biggest.date) : undefined} />
          <StatTile label={copy.tiles.busiest} value={busiest === null ? copy.tiles.none : t.format.weekdays[busiest]} hint={busiest === null ? undefined : copy.tiles.busiestHint} onClick={busiest === null ? undefined : () => showWeekday(busiest)} />
          <StatTile
            label={copy.tiles.savingsRate}
            value={rateOfSavings === null ? copy.tiles.noIncome : `${Math.round(rateOfSavings * 100)}%`}
            hint={rateOfSavings === null ? undefined : rateHint}
          />
          <StatTile label={copy.tiles.skipped} value={money(skipped.total)} hint={copy.tiles.skippedHint(skipped.count)} />
          <StatTile label={copy.tiles.kept} value={money(kept)} hint={copy.tiles.keptHint} />
        </section>
      </div>

      {/* Same order on phones. Wider: the long ranking fills the right, and the last row soaks up any height it needs beyond the charts. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto_auto_auto_auto_auto_1fr] lg:items-start">
        {payFlow && (
          <div className="min-w-0 lg:col-start-1">
            <PayFlow summary={payFlow} currency={currency} onSelect={showPart} />
          </div>
        )}
        <div className="min-w-0 lg:col-start-1">
          <TrendChart points={trend} currency={currency} onSelect={showCycle} />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-8 lg:row-start-1">
          <CategoryRanking
            rows={breakdown}
            categories={data.categories}
            currency={currency}
            rate={rate}
            hoursPerDay={work.hoursPerDay}
            compareLabel={copy.compareLabel[compareKey]}
            onSelect={showCategory}
            colorOf={colorOf}
            active={activeCategory}
            onActive={setActiveCategory}
            lead={<ShareRing rows={breakdown} categories={data.categories} currency={currency} active={activeCategory} onActive={setActiveCategory} onSelect={showCategory} colorOf={colorOf} size={210} />}
          />
        </div>
        <div className="min-w-0 lg:col-start-1">
          <DayHeatmap days={days} currency={currency} onSelect={showDay} />
        </div>
        {pace && (
          <div className="min-w-0 lg:col-start-1">
            <PaceChart points={pace.points} budget={pace.budget} currency={currency} onSelectDay={showDay} />
          </div>
        )}
        <div className="grid min-w-0 gap-4 lg:col-start-1 min-[1400px]:grid-cols-2">
          <SplitCard title={copy.split.fixedTitle} currency={currency} parts={fixedSplit} />
          <SplitCard title={copy.split.cashTitle} currency={currency} parts={cashSplit} />
        </div>
        <div className="min-w-0 lg:col-start-1">
          <SavingsRateChart points={trend} />
        </div>
        <div className="min-w-0 empty:hidden lg:col-start-1">{debtsSection}</div>
        {owedOverTime && (
          <div className="min-w-0 lg:col-start-1">
            <OwedChart balances={balances} currency={currency} />
          </div>
        )}
        {othersSection && <div className="min-w-0 lg:col-start-1">{othersSection}</div>}
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">{insights}</div>
    </>
  )
}
