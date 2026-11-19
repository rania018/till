import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ActivityTabs } from '../components/calendar/ActivityTabs'
import { CycleSwitcher } from '../components/CycleSwitcher'
import { SumBand, SumBar, SumCell } from '../components/desk/Panel'
import { CardHeader, SeeAll } from '../components/home/HomeCards'
import { TopItemsCard } from '../components/insights/InsightCards'
import { categoryStatsLink, listLink, useOpenItem, usePeriod } from '../components/insights/period'
import { DayHeatmap } from '../components/stats/DayHeatmap'
import { ShareRing } from '../components/stats/ShareRing'
import { CategoryRanking } from '../components/stats/StatsLists'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { TransactionRow } from '../components/transactions/TransactionRow'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { StatTile } from '../components/ui/StatTile'
import { TileAmount } from '../components/ui/TileAmount'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { categoryColor } from '../lib/categoryTree'
import { inMainCurrency } from '../lib/currency'
import { previousCycle, recentCycles } from '../lib/dates'
import { live } from '../lib/id'
import { formatMoney } from '../lib/money'
import { dailySpending, debtFlows, keptAfterDebts, mainCategoryBreakdown, mainCategoryHistory, topItems } from '../lib/stats'
import { isSpending } from '../lib/spending'
import { newestFirst, totals } from '../lib/transactions'
import { useAppStore } from '../store'
import { List, Plus } from 'lucide-react'

/** Params that ask for the list itself: links from before Activity opened on its overview still land there. */
const LIST_PARAMS = ['q', 'category', 'kind', 'wallet', 'tag', 'debt']

/**
 * Activity opens on what the pay cycle came to: the totals, a donut of the main categories,
 * day by day and what's bought most. Each opens its own stats or entries; the full list is a tab away.
 */
export function ActivityOverviewPage() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  if (LIST_PARAMS.some((key) => params.has(key))) {
    return <Navigate to={`/activity/list${location.search}`} replace />
  }
  return <Overview />
}

interface PeriodSumProps {
  received: number
  spent: number
  /** Received − spent, less money paid back or lent, plus lent money returned. */
  kept: number
  receivedCount: number
  spentCount: number
  currency: string
  onReceived: () => void
  onSpent: () => void
}

/** The period as a sum, received − spent = kept, on the same three columns as the cards below; the bar along the bottom is what came in, split between the two. */
function PeriodSum({ received, spent, kept, receivedCount, spentCount, currency, onReceived, onSpent }: PeriodSumProps) {
  const money = (amount: number) => formatMoney(amount, currency)
  const share = received > 0 ? Math.max(0, spent) / received : null
  return (
    <SumBand label={t.home.tilesLabel} bar={share !== null && (share > 1 ? <SumBar share={1} fill="bg-crit" /> : <SumBar share={share} fill="bg-accent/35" rest="bg-accent" />)}>
      <SumCell label={t.insights.received} value={money(received)} tone={received > 0 ? 'good' : undefined} note={t.insights.entries(receivedCount)} onClick={onReceived} />
      <SumCell sign="−" label={t.insights.spent} value={money(spent)} note={t.insights.entries(spentCount)} onClick={onSpent} />
      <SumCell sign="=" label={t.stats.tiles.kept} value={money(kept)} tone={kept < 0 ? 'crit' : 'accent'} note={share !== null && kept >= 0 ? t.insights.keptShare(`${Math.round((kept / received) * 100)}%`) : t.stats.tiles.keptHint} />
    </SumBand>
  )
}

function Overview() {
  const navigate = useNavigate()
  const openItem = useOpenItem()
  const desktop = useIsDesktop()
  const { transactions, categories, accounts, goals, debts, profile } = useAppStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, accounts: s.accounts, goals: s.goals, debts: s.debts, profile: s.profile })),
  )
  const { salary, today, current, cycle, custom, range, setCycle, clearCustom } = usePeriod()
  const [active, setActive] = useState<string | null>(null)
  const currency = profile.currency
  const names = { categories, accounts, goals, debts }

  const data = useMemo(() => {
    const mine = inMainCurrency(transactions, currency)
    const inRange = live(mine).filter((t) => t.date >= range.start && t.date <= range.end)
    const previous = custom ? range : previousCycle(cycle, salary)
    const cycles = recentCycles(range.end < today ? range.end : today, salary, 6)
    // Each main category's last pay cycles, for the small line in its row.
    const history = mainCategoryHistory(mine, cycles, categories)
    return {
      sums: totals(inRange),
      kept: keptAfterDebts({ income: totals(inRange).received, spent: totals(inRange).spent }, debtFlows(inRange, debts, range)),
      count: inRange.length,
      spentCount: inRange.filter(isSpending).length,
      receivedCount: inRange.filter((t) => t.type === 'income').length,
      mains: mainCategoryBreakdown(mine, range, previous, categories),
      history,
      days: dailySpending(mine, range, today),
      top: topItems(mine, range),
      latest: live(transactions).filter((t) => t.date >= range.start && t.date <= range.end).sort(newestFirst).slice(0, 6),
    }
  }, [transactions, currency, range, custom, cycle, salary, today, categories, debts])

  const colorOf = (id: string) => categoryColor(categories, id)
  const openCategory = (id: string) => navigate(categoryStatsLink(id, range, salary))
  const fullList = listLink({}, range, salary)
  const period = custom ? (
    <Chip selected onClick={clearCustom}>
      {t.format.range(custom.start, custom.end)}
      <X aria-label={t.activity.clearRange(t.format.range(custom.start, custom.end))} className="size-3.5" />
    </Chip>
  ) : (
    <CycleSwitcher framed cycle={cycle} current={current} salary={salary} onChange={setCycle} />
  )
  const ring = <ShareRing rows={data.mains} categories={categories} currency={currency} active={active} onActive={setActive} onSelect={openCategory} colorOf={colorOf} size={desktop ? 230 : 210} />
  const nothingYet = live(transactions).length === 0

  if (nothingYet) {
    return (
      <>
        <PageHeader title={t.activity.title} />
        {!desktop && <ActivityTabs />}
        <EmptyState
          icon={List}
          title={t.activity.emptyTitle}
          body={t.activity.emptyBody}
          action={
            <Button icon={Plus} onClick={() => openTransactionSheet('expense')}>
              {t.activity.addFirst}
            </Button>
          }
        />
      </>
    )
  }

  const ranking = (
    <CategoryRanking
      rows={data.mains}
      categories={categories}
      currency={currency}
      rate={null}
      hoursPerDay={0}
      compareLabel={t.stats.compareLabel[custom ? 'other' : cycle.start === current.start ? 'cycle' : 'last']}
      onSelect={openCategory}
      active={active}
      onActive={setActive}
      history={desktop ? data.history : undefined}
      colorOf={colorOf}
      lead={ring}
      dense={desktop}
    />
  )
  const latest = data.latest.length > 0 && (
    <section className="rounded-2xl border border-line bg-surface p-1">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <h2 className="text-sm font-extrabold">{t.insights.recent}</h2>
        <Link to={fullList} className="text-sm font-bold text-accent">
          {t.insights.seeList(data.count)}
        </Link>
      </div>
      <ul>
        {data.latest.map((tx) => (
          <li key={tx.id}>
            <TransactionRow transaction={tx} names={names} currency={currency} dated />
          </li>
        ))}
      </ul>
    </section>
  )
  const heatmap = <DayHeatmap days={data.days} currency={currency} compact={desktop} onSelect={(date) => navigate(listLink({}, { start: date, end: date }, salary))} />
  const top = <TopItemsCard items={data.top} categories={categories} currency={currency} compact={desktop} onSelect={(item) => openItem(item.name, range)} />

  if (desktop) {
    return (
      <>
        <PageHeader title={t.activity.title} nav={<ActivityTabs />} centerNav actions={period} />
        <div className="space-y-6 @container">
          <PeriodSum
            received={data.sums.received}
            spent={data.sums.spent}
            kept={data.kept}
            receivedCount={data.receivedCount}
            spentCount={data.spentCount}
            currency={currency}
            onReceived={() => navigate(listLink({ kind: 'income' }, range, salary))}
            onSpent={() => navigate(listLink({ kind: 'expense' }, range, salary))}
          />
          {ranking}
          {/* One row on Home's three columns: the cards share their top and bottom. */}
          <div className={clsx('grid gap-6 @min-[48rem]:grid-cols-2', data.latest.length > 0 && '@min-[66rem]:grid-cols-3')}>
            {heatmap}
            {top}
            {data.latest.length > 0 && (
              <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 @min-[48rem]:@max-[66rem]:col-span-2">
                <CardHeader title={t.insights.recent} action={<SeeAll to={fullList} label={t.insights.seeList(data.count)} />} />
                <ul className="-mx-2 grid flex-1 content-around">
                  {data.latest.map((tx) => (
                    <li key={tx.id} className="min-w-0">
                      <TransactionRow transaction={tx} names={names} currency={currency} dated stacked />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t.activity.title} />
      <div className="space-y-4">
        <ActivityTabs />
        {period}
        <section aria-label={t.home.tilesLabel} className="grid grid-cols-3 gap-2">
          <StatTile label={t.insights.spent} value={<TileAmount amount={data.sums.spent} currency={currency} />} onClick={() => navigate(listLink({ kind: 'expense' }, range, salary))} />
          <StatTile label={t.insights.received} value={<TileAmount amount={data.sums.received} currency={currency} />} onClick={() => navigate(listLink({ kind: 'income' }, range, salary))} />
          <StatTile label={t.stats.tiles.kept} value={<TileAmount amount={data.kept} currency={currency} />} />
        </section>
        {ranking}
        {heatmap}
        {top}
        {latest}
      </div>
    </>
  )
}
