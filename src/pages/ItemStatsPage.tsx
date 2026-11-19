import { X } from 'lucide-react'
import { useMemo } from 'react'
import clsx from 'clsx'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { CycleSwitcher } from '../components/CycleSwitcher'
import { CycleBars } from '../components/insights/InsightCards'
import { periodParams, previousPeriod, usePeriod } from '../components/insights/period'
import { TransactionRow } from '../components/transactions/TransactionRow'
import { buttonClass } from '../components/ui/buttonStyles'
import { Chip } from '../components/ui/Chip'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { categoryColor } from '../lib/categoryTree'
import { inMainCurrency } from '../lib/currency'
import { recentCycles } from '../lib/dates'
import { live } from '../lib/id'
import { formatMoney, formatQuantity, roundMoney } from '../lib/money'
import { sameName } from '../lib/quickItems'
import { itemEntries, itemHistory } from '../lib/stats'
import { newestFirst } from '../lib/transactions'
import { useAppStore } from '../store'
import { NotFoundPage } from './NotFoundPage'

/** Only a path inside the app: this comes from the URL. */
const safeBack = (back: string | null) => (back && back.startsWith('/') && !back.startsWith('//') ? back : null)

/**
 * One thing that's bought again and again, named by the first line of its notes: what it came to
 * and how often, its last pay cycles side by side, and its entries.
 */
export function ItemStatsPage() {
  const [params] = useSearchParams()
  const name = params.get('name')?.trim() ?? ''
  const desktop = useIsDesktop()
  const { transactions, categories, accounts, goals, debts, quickItems, currency, warnAt } = useAppStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, accounts: s.accounts, goals: s.goals, debts: s.debts, quickItems: s.quickItems, currency: s.profile.currency, warnAt: s.settings.alerts.warnAtPercent })),
  )
  const { salary, today, current, cycle, custom, range, setCycle, clearCustom } = usePeriod()
  const money = (amount: number) => formatMoney(amount, currency)
  const all = useMemo(() => itemEntries(inMainCurrency(transactions, currency), name), [transactions, currency, name])
  const previous = previousPeriod(range, today, salary)

  const data = useMemo(() => {
    const [now] = itemHistory(all, [range])
    const [before] = itemHistory(all, [previous])
    const cycles = recentCycles(range.end < today ? range.end : today, salary, 6)
    return {
      now,
      before,
      history: itemHistory(all, cycles),
      entries: all.filter((t) => t.date >= range.start && t.date <= range.end).sort(newestFirst),
      latest: [...all].sort(newestFirst)[0],
    }
  }, [all, range, previous, today, salary])

  if (!data.latest) return <NotFoundPage />
  const copy = t.insights.item
  const names = { categories, accounts, goals, debts }
  const category = categories.find((c) => c.id === data.latest.categoryId)
  const color = categoryColor(categories, category?.id)
  const isCycle = !custom
  const change = data.before.amount > 0 ? (data.now.amount - data.before.amount) / data.before.amount : null
  const each = (amount: number, count: number) => t.insights.top.each(money(Math.round(amount / count)))
  type Row = Pick<(typeof data.history)[number], 'units' | 'unitSpent' | 'uncounted'>
  const units = (row: Row) => `${formatQuantity(row.units)}${row.uncounted > 0 ? '+' : ''}`
  const perUnit = (row: Row) => t.transactions.quantityEach(money(roundMoney(row.unitSpent / row.units)))
  const saved = live(quickItems).find((item) => sameName(item.name, name))
  const limit = isCycle ? saved?.cycleLimit : undefined
  const limitRatio = limit ? data.now.units / limit : 0
  const anyUncounted = data.history.some((row) => row.uncounted > 0)
  const anyCounted = data.history.some((row) => row.units > 0)
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
      <PageHeader title={name} subtitle={category?.name} backTo={safeBack(params.get('back')) ?? `/activity?${new URLSearchParams(periodParams(range, salary))}`} nav={period} />
      {!desktop && <div className="-mt-2 mb-4">{period}</div>}

      <div className="space-y-4 @container desk:space-y-6">
        {/* The category's own pastel, with near-black text: light fills take dark ink in both themes. */}
        <section className="rounded-2xl p-5 text-[#1a1222] desk:p-7" style={{ background: color }}>
          <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
            <div className="flex items-center gap-4 me-auto">
              {category && (
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/45">
                  <Icon name={category.icon} className="size-7" />
                </span>
              )}
              <div>
                <p className="text-sm font-bold opacity-80">{t.insights.spent}</p>
                <p className="text-4xl font-extrabold tracking-tight desk:text-5xl">{money(data.now.amount)}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="font-semibold opacity-80">{data.now.units > 0 ? copy.boughtUnits(units(data.now)) : data.now.count > 0 ? copy.bought(data.now.count) : copy.notBought}</dt>
                <dd className="font-extrabold">{data.now.units > 0 ? perUnit(data.now) : data.now.count > 0 ? each(data.now.amount, data.now.count) : '–'}</dd>
              </div>
              <div>
                <dt className="font-semibold opacity-80">{isCycle && cycle.start === current.start ? t.stats.compare.cycle(money(data.before.amount)) : t.stats.compare.other(money(data.before.amount))}</dt>
                <dd className="font-extrabold">{change === null ? '–' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(Math.round(change * 100))}%`}</dd>
              </div>
            </dl>
          </div>
          {limit && (
            <div className="mt-5">
              <ProgressBar value={limitRatio} tone={limitRatio > 1 ? 'crit' : limitRatio * 100 >= warnAt ? 'warn' : 'accent'} label={copy.barLabel(name)} />
              <p className="mt-1.5 text-sm font-semibold">{copy.limitUse(formatQuantity(data.now.units), formatQuantity(limit))}</p>
            </div>
          )}
          {saved && (
            <Link to="/settings/quick-items" className={clsx(buttonClass({ variant: 'secondary', size: 'sm' }), 'mt-5')}>
              {saved.cycleLimit ? copy.changeLimit : copy.setLimit}
            </Link>
          )}
        </section>

        {/* The two cards side by side end level, and on a phone nothing wide can stretch the column past the screen. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 desk:gap-6 @min-[60rem]:grid-cols-2">
          <section className="flex flex-col rounded-2xl border border-line bg-surface p-4 desk:p-6">
            <h2 className="text-sm font-extrabold">{t.insights.lastCycles}</h2>
            <div className="mt-3 min-h-32 flex-1">
              <CycleBars points={data.history} selected={isCycle ? cycle.start : ''} currency={currency} color={color} onSelect={(c) => setCycle(c.start)} fill />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 desk:p-6">
            <h2 className="text-sm font-extrabold">{copy.byCycle}</h2>
            <ul className="-mx-2 mt-2">
              {[...data.history].reverse().map((row) => {
                const dates = t.format.range(row.cycle.start, row.cycle.end)
                const on = isCycle && row.cycle.start === cycle.start
                return (
                  <li key={row.cycle.start}>
                    <button type="button" aria-pressed={on} onClick={() => setCycle(row.cycle.start)} className={clsx('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-surface-2', on && 'bg-surface-2')}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{today <= row.cycle.end ? t.insights.compare.soFar(dates) : dates}</span>
                        <span className="block text-xs text-muted">{row.units > 0 ? `${copy.boughtUnits(units(row))} · ${perUnit(row)}` : row.count > 0 ? `${t.insights.top.times(row.count)} · ${each(row.amount, row.count)}` : copy.notBought}</span>
                      </span>
                      <span className="shrink-0 font-extrabold tabular-nums">{row.count > 0 ? money(row.amount) : '–'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {anyUncounted && <p className="mt-2 text-xs text-muted">{anyCounted ? copy.notePartial : copy.note}</p>}
          </section>

          {data.entries.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-1 @min-[60rem]:col-span-2">
              <h2 className="px-3 pb-1 pt-3 text-sm font-extrabold">{t.insights.entries(data.entries.length)}</h2>
              <ul>
                {data.entries.map((tx) => (
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
