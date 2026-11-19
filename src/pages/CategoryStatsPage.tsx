import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Link, useNavigate, useParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { CycleSwitcher } from '../components/CycleSwitcher'
import { CycleBars, TopItemsCard } from '../components/insights/InsightCards'
import { categoryStatsLink, listLink, periodParams, previousPeriod, useOpenItem, usePeriod } from '../components/insights/period'
import { DayHeatmap } from '../components/stats/DayHeatmap'
import { ShareRing } from '../components/stats/ShareRing'
import { CategoryRanking } from '../components/stats/StatsLists'
import { TransactionRow } from '../components/transactions/TransactionRow'
import { buttonClass } from '../components/ui/buttonStyles'
import { Chip } from '../components/ui/Chip'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { categoryBudgets } from '../lib/budget'
import { categoryColor, familyIds, hasSubcategories } from '../lib/categoryTree'
import { inMainCurrency } from '../lib/currency'
import { getPayCycle, recentCycles } from '../lib/dates'
import { live } from '../lib/id'
import { formatMoney } from '../lib/money'
import { categoryHistory, dailySpending, subcategoryBreakdown, topItems } from '../lib/stats'
import { totals } from '../lib/transactions'
import { useAppStore } from '../store'
import { NotFoundPage } from './NotFoundPage'

type Range = { start: string; end: string }

/**
 * One category's own stats: what it came to, its subcategories, day by day, its last pay cycles
 * and what's bought most in it, with the list of its entries one tap further.
 */
export function CategoryStatsPage() {
  const { categoryId = '' } = useParams()
  const navigate = useNavigate()
  const openItem = useOpenItem()
  const desktop = useIsDesktop()
  const { transactions, categories, accounts, goals, debts, profile, settings } = useAppStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, accounts: s.accounts, goals: s.goals, debts: s.debts, profile: s.profile, settings: s.settings })),
  )
  const { salary, today, current, cycle, custom, range, setCycle, clearCustom } = usePeriod()
  const [active, setActive] = useState<string | null>(null)
  const currency = profile.currency
  const money = (amount: number) => formatMoney(amount, currency)
  const category = live(categories).find((c) => c.id === categoryId)
  const parent = category?.parentId ? live(categories).find((c) => c.id === category.parentId) : undefined
  const mine = useMemo(() => inMainCurrency(transactions, currency), [transactions, currency])
  const family = useMemo(() => familyIds(categories, categoryId), [categories, categoryId])
  const inFamily = useMemo(() => mine.filter((t) => t.categoryId && family.has(t.categoryId)), [mine, family])
  const previous = previousPeriod(range, today, salary)

  const data = useMemo(() => {
    const inRange = (t: { date: string }) => t.date >= range.start && t.date <= range.end
    const entries = live(inFamily).filter(inRange)
    const sums = totals(entries)
    const all = totals(live(mine).filter(inRange)).spent
    const before = totals(live(inFamily).filter((t) => t.date >= previous.start && t.date <= previous.end)).spent
    const cycles = recentCycles(range.end < today ? range.end : today, salary, 6)
    const history = categoryHistory(mine, cycles)
    // The category and, for a main one, everything under it.
    const perCycle = cycles.map((_, i) => [...family].reduce((sum, member) => sum + (history.get(member)?.[i] ?? 0), 0))
    return {
      entries: entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      sums,
      share: all > 0 ? sums.spent / all : 0,
      before,
      subs: subcategoryBreakdown(mine, range, previous, categories, categoryId),
      days: dailySpending(inFamily, range, today),
      cycles: cycles.map((c, i) => ({ cycle: c, amount: perCycle[i] })),
      top: topItems(inFamily, range),
      limit: categoryBudgets(categories, mine, getPayCycle(range.start, salary), settings.alerts.warnAtPercent).find((row) => row.categoryId === categoryId),
    }
  }, [inFamily, mine, range, previous, today, salary, family, categories, categoryId, settings.alerts.warnAtPercent])

  if (!category) return <NotFoundPage />
  const names = { categories, accounts, goals, debts }
  const color = categoryColor(categories, category.id)
  const isCycle = !custom
  const withSubs = hasSubcategories(categories, category.id)
  const periodSearch = `?${new URLSearchParams(periodParams(range, salary))}`
  const backTo = parent ? `/activity/category/${parent.id}${periodSearch}` : `/activity${periodSearch}`
  const listOf = (filters: Record<string, string | undefined>, dates: Range | null = range) => listLink({ category: category.id, ...filters }, dates, salary)
  const change = data.before > 0 ? (data.sums.spent - data.before) / data.before : null
  const period = custom ? (
    <Chip selected onClick={clearCustom}>
      {t.format.range(custom.start, custom.end)}
      <X aria-label={t.activity.clearRange(t.format.range(custom.start, custom.end))} className="size-3.5" />
    </Chip>
  ) : (
    <CycleSwitcher cycle={cycle} current={current} salary={salary} onChange={setCycle} />
  )

  return (
    <>
      <PageHeader title={category.name} subtitle={parent?.name} backTo={backTo} nav={period} />
      {!desktop && <div className="-mt-2 mb-4">{period}</div>}

      <div className="space-y-4 @container desk:space-y-6">
        {/* The category's own pastel, with near-black text: light fills take dark ink in both themes. */}
        <section className="rounded-2xl p-5 text-[#1a1222] desk:p-7" style={{ background: color }}>
          <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
            <div className="flex items-center gap-4 me-auto">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/45">
                <Icon name={category.icon} className="size-7" />
              </span>
              <div>
                <p className="text-sm font-bold opacity-80">{t.insights.spent}</p>
                <p className="text-4xl font-extrabold tracking-tight desk:text-5xl">{money(data.sums.spent)}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm @min-[40rem]:grid-cols-3">
              <div>
                <dt className="font-semibold opacity-80">{t.insights.entries(data.entries.length)}</dt>
                <dd className="font-extrabold">{t.insights.ofAll(`${Math.round(data.share * 100)}%`)}</dd>
              </div>
              <div>
                <dt className="font-semibold opacity-80">{isCycle && cycle.start === current.start ? t.stats.compare.cycle(money(data.before)) : t.stats.compare.other(money(data.before))}</dt>
                <dd className="font-extrabold">{change === null ? '–' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(Math.round(change * 100))}%`}</dd>
              </div>
              {data.sums.received > 0 && (
                <div>
                  <dt className="font-semibold opacity-80">{t.insights.received}</dt>
                  <dd className="font-extrabold">{money(data.sums.received)}</dd>
                </div>
              )}
            </dl>
          </div>
          {data.limit && (
            <div className="mt-5">
              <ProgressBar value={data.limit.ratio} tone={data.limit.level === 'over' ? 'crit' : data.limit.level === 'warning' ? 'warn' : 'accent'} label={t.budgetTab.barLabel(category.name)} />
              <p className="mt-1.5 text-sm font-semibold">{t.insights.limit(money(data.limit.spent), money(data.limit.budget))}</p>
            </div>
          )}
          <Link to={listOf({})} className={clsx(buttonClass({ variant: 'secondary', size: 'sm' }), 'mt-5')}>
            {t.insights.seeList(data.entries.length)}
          </Link>
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 desk:gap-6 @min-[60rem]:grid-cols-2">
          {withSubs && (
            <CategoryRanking
              rows={data.subs}
              categories={categories}
              currency={currency}
              rate={null}
              hoursPerDay={0}
              compareLabel={t.insights.subcategories}
              onSelect={(id) => navigate(categoryStatsLink(id, range, salary))}
              active={active}
              onActive={setActive}
              colorOf={() => color}
              lead={<ShareRing rows={data.subs} categories={categories} currency={currency} active={active} onActive={setActive} onSelect={(id) => navigate(categoryStatsLink(id, range, salary))} colorOf={() => color} size={190} />}
            />
          )}
          <section className="rounded-2xl border border-line bg-surface p-4 desk:p-6">
            <h2 className="text-sm font-extrabold">{t.insights.lastCycles}</h2>
            <div className="mt-3">
              <CycleBars points={data.cycles} selected={isCycle ? cycle.start : ''} currency={currency} color={color} onSelect={(c) => navigate(categoryStatsLink(category.id, c, salary), { replace: true })} />
            </div>
          </section>
          <DayHeatmap days={data.days} currency={currency} color={color} onSelect={(date) => navigate(listOf({}, { start: date, end: date }))} />
          <TopItemsCard items={data.top} categories={categories} currency={currency} onSelect={(item) => openItem(item.name, range)} />
          {data.entries.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-1 @min-[60rem]:col-span-2">
              <div className="flex items-center justify-between px-3 pb-1 pt-3">
                <h2 className="text-sm font-extrabold">{t.insights.recent}</h2>
                <Link to={listOf({})} className="text-sm font-bold text-accent">
                  {t.insights.seeList(data.entries.length)}
                </Link>
              </div>
              <ul>
                {data.entries.slice(0, 6).map((tx) => (
                  <li key={tx.id}>
                    <TransactionRow transaction={tx} names={names} currency={currency} dated />
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
