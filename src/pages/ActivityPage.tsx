import { subDays } from 'date-fns'
import { ChartColumn, List, Plus, Search, Tag, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ActivityTabs } from '../components/calendar/ActivityTabs'
import { CycleSwitcher } from '../components/CycleSwitcher'
import { ChargeSheet } from '../components/debts/ChargeSheet'
import { DebtSheet } from '../components/debts/DebtSheet'
import { Metric, Panel } from '../components/desk/Panel'
import { TransactionTable } from '../components/desk/TransactionTable'
import { ExportButton } from '../components/ExportButton'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { NoMoneyRow, TransactionRow } from '../components/transactions/TransactionRow'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { inputClass } from '../components/ui/formStyles'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Select'
import { TagCard } from '../components/tags/TagCard'
import { buttonClass } from '../components/ui/buttonStyles'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { fromISODate, getPayCycle, previousCycle, todayISO, toISODate } from '../lib/dates'
import { detailParams } from '../lib/detail'
import { noMoneyEntries, type NoMoneyEntry } from '../lib/debts'
import { activityWorkbook } from '../lib/export/pages'
import { live } from '../lib/id'
import { formatMoney } from '../lib/money'
import { inMainCurrency, otherCurrencyTotals } from '../lib/currency'
import { filterNoMoneyEntries, filterTransactions, groupByDay, nameOf, totals, type TransactionKindFilter } from '../lib/transactions'
import { isSpending, spentAmount } from '../lib/spending'
import { isValidDate } from '../lib/validation'
import { knownTags, tagSummary } from '../lib/tags'
import { appStore, useAppStore } from '../store'

/** More than a pay cycle's worth; past this, search or filter to narrow it down. */
const LIMIT = 300
const KINDS: TransactionKindFilter[] = ['expense', 'income', 'transfer', 'goal', 'debt']

export function ActivityPage() {
  const [params, setParams] = useSearchParams()
  const desktop = useIsDesktop()
  const { transactions, categories, accounts, goals, debts, profile } = useAppStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, accounts: s.accounts, goals: s.goals, debts: s.debts, profile: s.profile })),
  )
  const today = todayISO()
  const yesterday = toISODate(subDays(fromISODate(today), 1))
  const currentCycle = getPayCycle(today, profile.salary)
  const cycleParam = params.get('cycle')
  const cycle = cycleParam && isValidDate(cycleParam) ? getPayCycle(cycleParam, profile.salary) : currentCycle
  const query = params.get('q') ?? ''
  const kindParam = params.get('kind') as TransactionKindFilter | null
  const kind = kindParam && KINDS.includes(kindParam) ? kindParam : undefined
  const wallet = params.get('wallet') ?? undefined
  const categoryId = params.get('category') ?? undefined
  const searching = query.trim() !== ''
  const tag = params.get('tag') ?? undefined
  const debtId = params.get('debt') ?? undefined
  const debtFilter = debtId ? live(debts).find((d) => d.id === debtId) : undefined
  // Any dates, opened from Stats: a day, or a stretch longer than a pay cycle.
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const customRange = fromParam && toParam && isValidDate(fromParam) && isValidDate(toParam) && fromParam <= toParam ? { start: fromParam, end: toParam } : null
  // A tag is an event that can run over several pay cycles, so like a search it looks at all of them. So does a debt.
  const allTime = !customRange && (searching || !!tag || !!debtId)

  const names = useMemo(() => ({ categories, accounts, goals, debts }), [categories, accounts, goals, debts])
  const range = useMemo(() => customRange ?? { start: cycle.start, end: cycle.end }, [customRange?.start, customRange?.end, cycle.start, cycle.end]) // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(
    () => filterTransactions(transactions, { range: allTime ? undefined : range, kind, accountId: wallet, categoryId, query, tag, debtId }, names),
    [transactions, allTime, range, kind, wallet, categoryId, query, tag, debtId, names],
  )
  const shown = results.slice(0, LIMIT)
  const allNoMoney = useMemo(() => noMoneyEntries(debts), [debts])
  const matchingNoMoney = useMemo(
    () => filterNoMoneyEntries(allNoMoney, { range: allTime ? undefined : range, kind, accountId: wallet, categoryId, query, tag, debtId }),
    [allNoMoney, allTime, range, kind, wallet, categoryId, query, tag, debtId],
  )
  // Past the cap the list stops at some day, so nothing older shows below it.
  const noMoney = results.length > LIMIT ? matchingNoMoney.filter((e) => e.date >= shown[shown.length - 1].date) : matchingNoMoney
  const groups = groupByDay(shown, profile.currency, noMoney)
  // The entry only says which one: the sheets edit the debt as it is now.
  const [opened, setOpened] = useState<NoMoneyEntry | null>(null)
  const openedDebt = (opened && live(debts).find((d) => d.id === opened.debt.id)) || null
  const openedCharge = openedDebt?.charges?.find((c) => c.id === opened?.charge?.id) ?? null
  const noMoneySheets = (
    <>
      <ChargeSheet debt={openedDebt} charge={openedCharge} currency={openedDebt?.currency ?? profile.currency} onClose={() => setOpened(null)} />
      <DebtSheet debt={opened && !opened.charge ? openedDebt : null} onClose={() => setOpened(null)} />
    </>
  )
  // Totals add up the main currency; other currencies are listed after them.
  const sums = totals(inMainCurrency(results, profile.currency))
  const othersSpent = otherCurrencyTotals(results, undefined, profile.currency).filter((row) => row.spent > 0)
  const alsoSpent = othersSpent.length > 0 ? ` · ${t.activity.alsoSpent(othersSpent.map((row) => formatMoney(row.spent, row.currency)).join(' · '))}` : ''
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const tags = useMemo(() => knownTags(transactions), [transactions])
  const tagged = useMemo(() => (tag ? tagSummary(transactions, tag, profile.currency) : null), [transactions, tag, profile.currency])
  const everywhere = searching ? t.activity.searchingAll : t.tags.everyCycle
  const nothingLoggedYet = live(transactions).length === 0 && allNoMoney.length === 0
  // The same filters as the list, without its cap.
  const exportButton = !nothingLoggedYet && <ExportButton workbook={() => activityWorkbook(appStore.getState(), today, { range: allTime ? undefined : range, kind, accountId: wallet, categoryId, query, tag, debtId })} />

  const clearRange = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('from')
        next.delete('to')
        if (customRange) next.set('cycle', getPayCycle(customRange.start, profile.salary).start)
        return next
      },
      { replace: true },
    )
  const rangeLabel = customRange && (customRange.start === customRange.end ? t.format.shortDay(customRange.start) : t.format.range(customRange.start, customRange.end))
  const rangeChip = customRange && rangeLabel && (
    <Chip selected onClick={clearRange}>
      {rangeLabel}
      <X aria-label={t.activity.clearRange(rangeLabel)} className="size-3.5" />
    </Chip>
  )
  const debtChip = debtFilter && (
    <Chip selected onClick={() => setParam('debt', undefined)}>
      {debtFilter.person}
      <X aria-label={t.activity.clearDebt(debtFilter.person)} className="size-3.5" />
    </Chip>
  )
  // The same dates in Stats, with the category's details open when one is picked.
  const statsLink = (() => {
    const shown = allTime ? getPayCycle(today, profile.salary) : range
    const next = new URLSearchParams()
    if (shown.start !== currentCycle.start || shown.end !== currentCycle.end) {
      const last = previousCycle(currentCycle, profile.salary)
      if (shown.start === last.start && shown.end === last.end) next.set('period', 'last')
      else {
        next.set('period', 'custom')
        next.set('from', shown.start)
        next.set('to', shown.end < today ? shown.end : today)
      }
    }
    if (categoryId) {
      for (const [key, value] of Object.entries(detailParams({ target: { kind: 'category', id: categoryId }, range: { start: shown.start, end: shown.end } }))) if (value) next.set(key, value)
    }
    return `/stats${next.size > 0 ? `?${next}` : ''}`
  })()

  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const dayLabel = (date: string) =>
    date === today
      ? t.activity.today
      : date === yesterday
        ? t.activity.yesterday
        : date.slice(0, 4) === today.slice(0, 4)
          ? t.format.longDay(date)
          : t.format.longDayWithYear(date)

  if (desktop) {
    const copy = t.desk.activity
    const spendRows = [...results.reduce((all, tx) => (isSpending(tx) && tx.categoryId ? all.set(tx.categoryId, (all.get(tx.categoryId) ?? 0) + spentAmount(tx)) : all), new Map<string, number>())].sort((a, b) => b[1] - a[1])
    const topSpend = spendRows[0]?.[1] ?? 0
    const categoryOptions = live(categories)
      .filter((c) => !c.archived)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order)
    return (
      <>
        <PageHeader
          title={t.activity.title}
          nav={<ActivityTabs />}
          centerNav
          actions={rangeChip || (!allTime && <CycleSwitcher framed cycle={cycle} current={currentCycle} salary={profile.salary} onChange={(start) => setParam('cycle', start)} />)}
        />

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="relative block w-80">
            <span className="sr-only">{t.activity.searchLabel}</span>
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setParam('q', e.target.value || undefined)}
              placeholder={t.activity.searchPlaceholder}
              title={t.desk.searchHint}
              className={inputClass({ className: 'ps-9' })}
            />
          </label>
          <div className="flex items-center gap-1.5" role="group" aria-label={t.activity.kindLabel}>
            <Chip selected={!kind} onClick={() => setParam('kind', undefined)}>
              {t.activity.kinds.all}
            </Chip>
            {KINDS.map((k) => (
              <Chip key={k} selected={kind === k} onClick={() => setParam('kind', kind === k ? undefined : k)}>
                {t.activity.kinds[k]}
              </Chip>
            ))}
          </div>
          <div className="w-48">
            <Select aria-label={copy.walletFilter} value={wallet ?? ''} onChange={(e) => setParam('wallet', e.target.value || undefined)}>
              <option value="">{copy.allWallets}</option>
              {live(accounts)
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="w-56">
            <Select aria-label={copy.categoryFilter} value={categoryId ?? ''} onChange={(e) => setParam('category', e.target.value || undefined)}>
              <option value="">{copy.allCategories}</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {tags.length > 0 && (
            <div className="w-48">
              <Select aria-label={t.tags.filter} value={tagged?.name ?? ''} onChange={(e) => setParam('tag', e.target.value || undefined)}>
                <option value="">{t.tags.allTags}</option>
                {tags.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Link to="/activity/tags" className={buttonClass({ variant: 'secondary' })}>
            <Tag aria-hidden className="size-4" />
            {t.tags.title}
          </Link>
          {debtChip}
          {/* What these filters come to and what to do with it, at the end of the row; the top bar stays the same on every Activity tab. */}
          {!nothingLoggedYet && (
            <div className="ms-auto flex min-w-0 items-center gap-3">
              <p className="min-w-0 truncate text-sm font-semibold tabular-nums text-muted">
                {allTime && `${everywhere} · `}
                {copy.entries(results.length + matchingNoMoney.length)}
                <span className="min-[1470px]:hidden"> · {t.activity.summary(money(sums.spent), money(sums.received))}{alsoSpent}</span>
              </p>
              <Link to={statsLink} className={buttonClass({ variant: 'secondary' })}>
                <ChartColumn aria-hidden className="size-4" />
                {copy.seeInStats}
              </Link>
              {exportButton}
            </div>
          )}
        </div>
        {tagged && (
          <div className="mb-6 max-w-2xl">
            <TagCard summary={tagged} categories={categories} currency={profile.currency} showCategories={false} onClose={() => setParam('tag', undefined)} />
          </div>
        )}

        {nothingLoggedYet ? (
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
        ) : (
          <div className="@container">
          <div className="grid items-start gap-6 @min-[72rem]:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0">
              {groups.length === 0 ? (
                <EmptyState icon={Search} title={t.activity.noResults} body={t.activity.noResultsBody} />
              ) : (
                <Panel>
                  <TransactionTable transactions={shown} noMoney={noMoney} onOpenNoMoney={setOpened} names={names} currency={profile.currency} viewAccountId={wallet} today={today} yesterday={yesterday} dayTotals stickyHeader />
                </Panel>
              )}
              {results.length > LIMIT && <p className="mt-4 text-center text-sm text-muted">{t.activity.capped(LIMIT)}</p>}
            </div>
            <aside className="hidden min-w-0 space-y-6 @min-[72rem]:sticky @min-[72rem]:top-[5.5rem] @min-[72rem]:block">
              <Panel className="grid divide-y divide-line">
                <Metric label={copy.spent} value={money(sums.spent)} />
                <Metric label={copy.received} value={money(sums.received)} tone={sums.received > 0 ? 'good' : undefined} />
              </Panel>
              <Panel title={copy.byCategory}>
                {spendRows.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">{copy.noSpending}</p>
                ) : (
                  <ul className="p-2">
                    {spendRows.map(([id, spent]) => {
                      const category = categories.find((c) => c.id === id)
                      const on = categoryId === id
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => setParam('category', on ? undefined : id)}
                            className={`block w-full rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-surface-2 ${on ? 'bg-accent-soft' : ''}`}
                          >
                            <span className="flex items-center gap-2.5 text-sm">
                              <Icon name={category?.icon ?? 'package'} className="size-[1.125rem] shrink-0 text-accent" />
                              <span className="min-w-0 flex-1 truncate font-semibold">{category?.name}</span>
                              <span className="shrink-0 font-bold tabular-nums">{money(spent)}</span>
                            </span>
                            <span className="mt-2 block h-1.5 rounded-full bg-surface-2">
                              <span className="block h-full rounded-full bg-accent" style={{ width: `${topSpend > 0 ? (spent / topSpend) * 100 : 0}%` }} />
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>
            </aside>
          </div>
          </div>
        )}
        {noMoneySheets}
      </>
    )
  }

  return (
    <>
      <PageHeader title={t.activity.title} actions={exportButton} />

      <div className="space-y-3">
        <div className="lg:max-w-xs">
          <ActivityTabs />
        </div>
        <div className="space-y-3 lg:flex lg:items-center lg:gap-4 lg:space-y-0">
          {customRange ? (
            <div className="flex">{rangeChip}</div>
          ) : !allTime && (
            <div className="lg:w-64 lg:shrink-0">
              <CycleSwitcher cycle={cycle} current={currentCycle} salary={profile.salary} onChange={(start) => setParam('cycle', start)} />
            </div>
          )}

          <label className="relative block lg:flex-1">
            <span className="sr-only">{t.activity.searchLabel}</span>
            <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setParam('q', e.target.value || undefined)}
              placeholder={t.activity.searchPlaceholder}
              enterKeyHint="search"
              className={inputClass({ className: 'ps-10' })}
            />
          </label>
        </div>

        <div className="space-y-3 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label={t.activity.kindLabel}>
            <Chip selected={!kind} onClick={() => setParam('kind', undefined)}>
              {t.activity.kinds.all}
            </Chip>
            {KINDS.map((k) => (
              <Chip key={k} selected={kind === k} onClick={() => setParam('kind', kind === k ? undefined : k)}>
                {t.activity.kinds[k]}
              </Chip>
            ))}
            <span aria-hidden className="mx-1 w-px shrink-0 bg-line" />
            {live(accounts)
              .filter((a) => !a.archived)
              .map((a) => (
                <Chip key={a.id} selected={wallet === a.id} onClick={() => setParam('wallet', wallet === a.id ? undefined : a.id)}>
                  {a.name}
                </Chip>
              ))}
            {categoryId && (
              <Chip selected onClick={() => setParam('category', undefined)}>
                {nameOf(categories, categoryId)}
                <X aria-label={t.activity.clearCategory(nameOf(categories, categoryId))} className="size-3.5" />
              </Chip>
            )}
            {debtChip}
            {tag && (
              <Chip selected onClick={() => setParam('tag', undefined)}>
                {tagged?.name ?? tag}
                <X aria-label={t.tags.clear(tagged?.name ?? tag)} className="size-3.5" />
              </Chip>
            )}
          </div>

          {/* A tag's card says the same, and more. */}
          {!nothingLoggedYet && !tagged && (
            <p className="text-sm font-semibold text-muted lg:shrink-0">
              {allTime && `${everywhere} · `}
              {t.activity.summary(money(sums.spent), money(sums.received))}
              {alsoSpent}
            </p>
          )}
        </div>
      </div>

      {tagged && (
        <div className="mt-4 lg:max-w-2xl">
          <TagCard summary={tagged} categories={categories} currency={profile.currency} onClose={() => setParam('tag', undefined)} />
        </div>
      )}

      <div className="mt-2">
        {nothingLoggedYet ? (
          <div className="mt-4">
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
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={Search} title={t.activity.noResults} body={t.activity.noResultsBody} />
          </div>
        ) : (
          // Phones: a card per day. Wider screens: one ledger, with each day in the margin beside its entries.
          <div className="lg:mt-4 lg:divide-y lg:divide-line lg:rounded-2xl lg:border lg:border-line lg:bg-surface">
            {groups.map((group) => (
              <section key={group.date} aria-label={dayLabel(group.date)} className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
                <div className="flex items-baseline justify-between px-2 pb-1.5 pt-5 lg:sticky lg:top-0 lg:block lg:self-start lg:px-4 lg:py-3">
                  <h2 className="text-sm font-extrabold">{dayLabel(group.date)}</h2>
                  {group.spent > 0 && <span className="text-sm font-semibold text-muted lg:mt-0.5 lg:block lg:text-xs">{t.activity.daySpent(money(group.spent))}</span>}
                </div>
                <ul className="rounded-2xl border border-line bg-surface p-1 lg:rounded-none lg:border-0 lg:bg-transparent lg:py-1.5 lg:ps-0 lg:pe-2">
                  {group.transactions.map((tx) => (
                    <li key={tx.id}>
                      <TransactionRow transaction={tx} names={names} currency={profile.currency} viewAccountId={wallet} columns />
                    </li>
                  ))}
                  {group.noMoney.map((entry) => (
                    <li key={entry.id}>
                      <NoMoneyRow entry={entry} currency={profile.currency} columns onClick={() => setOpened(entry)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {results.length > LIMIT && <p className="mt-4 text-center text-sm text-muted">{t.activity.capped(LIMIT)}</p>}
      </div>
      {noMoneySheets}
    </>
  )
}
