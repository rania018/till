import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { inMainCurrency, isMainCurrency } from '../../lib/currency'
import { recentCycles, todayISO } from '../../lib/dates'
import { debtOwed } from '../../lib/debts'
import { activityLinkFor, detailEntries, type Detail } from '../../lib/detail'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { categoryHistory } from '../../lib/stats'
import { totals } from '../../lib/transactions'
import { useAppStore, type AppState } from '../../store'
import { TransactionRow } from '../transactions/TransactionRow'
import { BottomSheet } from '../ui/BottomSheet'
import { IconButton } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'
import { Icon } from '../ui/Icon'
import { useDetail } from './useDetail'

/** Past this, the rest are one click away in Activity. */
const SHOWN = 100
/** How many pay cycles a category's history goes back. */
const HISTORY = 6

/**
 * The panel's width on a computer. On a wide screen the page makes the same room for it, so nothing is
 * hidden under it; on a smaller one that would leave the page too narrow, so the panel covers its edge instead.
 */
export const DETAIL_WIDTH = 'w-[27rem]'
export const DETAIL_ROOM = 'desk:min-[1600px]:pe-[27rem]'

/**
 * What's behind anything clicked in Stats, Home or Activity: its total, how it compares,
 * and every entry, tap to edit. Beside the page on a computer, a sheet on a phone.
 */
export function DetailPanel() {
  const { current, open, close } = useDetail()
  const desktop = useIsDesktop()
  const heading = useRef<HTMLHeadingElement>(null)
  const key = current ? JSON.stringify(current) : ''

  // On a computer the panel sits beside the page: Escape closes it, unless a dialog above it takes the key.
  useEffect(() => {
    if (!desktop || !key) return
    heading.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role=dialog]')) return
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, key, close])

  const title = useAppStore((s) => (current ? titleOf(current, s) : ''))
  if (!current) return null

  if (!desktop) {
    return (
      <BottomSheet open onOpenChange={(next) => !next && close()} title={title}>
        <DetailBody detail={current} onOpen={open} />
      </BottomSheet>
    )
  }

  return (
    <aside aria-labelledby="detail-title" className={clsx('fixed inset-y-0 end-0 z-30 flex flex-col border-s border-line bg-surface shadow-2xl animate-panel-in print:hidden', DETAIL_WIDTH)}>
      <div className="flex min-h-16 items-center gap-3 border-b border-line px-6">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">{t.detail.label}</p>
        <IconButton icon={X} label={t.detail.close} variant="ghost" onClick={close} className="-me-2" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
        <h2 id="detail-title" ref={heading} tabIndex={-1} className="text-xl font-extrabold tracking-tight outline-none">
          {title}
        </h2>
        <DetailBody detail={current} onOpen={open} />
      </div>
    </aside>
  )
}

function titleOf(detail: Detail, state: Pick<AppState, 'categories' | 'debts'>): string {
  const { target } = detail
  switch (target.kind) {
    case 'category':
      return state.categories.find((c) => c.id === target.id)?.name ?? ''
    case 'day':
      return target.date.slice(0, 4) === todayISO().slice(0, 4) ? t.format.longDay(target.date) : t.format.longDayWithYear(target.date)
    case 'weekday':
      return t.detail.weekdayTitle(t.format.weekdays[target.day])
    case 'debt':
      return state.debts.find((d) => d.id === target.id)?.person ?? ''
    case 'part':
      return t.detail.parts[target.part]
  }
}

function DetailBody({ detail, onOpen }: { detail: Detail; onOpen: (detail: Detail) => void }) {
  const { transactions, accounts, categories, goals, debts, profile } = useAppStore(
    useShallow((s) => ({ transactions: s.transactions, accounts: s.accounts, categories: s.categories, goals: s.goals, debts: s.debts, profile: s.profile })),
  )
  const main = profile.currency
  const money = (amount: number) => formatMoney(amount, main)
  const names = useMemo(() => ({ categories, accounts, goals, debts }), [categories, accounts, goals, debts])
  const entries = useMemo(() => detailEntries(transactions, accounts, detail, categories), [transactions, accounts, detail, categories])
  const sums = totals(inMainCurrency(entries, main))
  const { target, range } = detail
  const category = target.kind === 'category' ? categories.find((c) => c.id === target.id) : undefined
  const debt = target.kind === 'debt' ? live(debts).find((d) => d.id === target.id) : undefined
  const incomeOnly = (target.kind === 'part' && target.part === 'income') || category?.kind === 'income'
  const subtitle = target.kind === 'day' || target.kind === 'debt' ? null : range ? t.format.range(range.start, range.end) : t.detail.allTime
  const link = activityLinkFor(detail, profile.salary)
  const othersListed = entries.some((e) => !isMainCurrency(e, main))

  // A category's last pay cycles, ending with the one shown: click one to see it instead.
  const history = useMemo(() => {
    if (target.kind !== 'category') return null
    const cycles = recentCycles(range?.end ?? todayISO(), profile.salary, HISTORY)
    const spent = categoryHistory(inMainCurrency(transactions, main), cycles).get(target.id) ?? cycles.map(() => 0)
    return cycles.map((cycle, i) => ({ cycle, spent: spent[i] }))
  }, [target, range, profile.salary, transactions, main])
  const highest = history ? Math.max(...history.map((h) => h.spent)) : 0

  let headline: ReactNode
  if (debt) {
    const owed = debtOwed(debt, transactions)
    headline = <Figure label={debt.direction === 'borrowed' ? t.detail.youOwe : t.detail.owedToYou} value={formatMoney(owed, debt.currency ?? main)} />
  } else if (incomeOnly) {
    headline = <Figure label={t.detail.received} value={money(sums.received)} />
  } else {
    headline = (
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <Figure label={t.detail.spent} value={money(sums.spent)} />
        {sums.received > 0 && <Figure label={t.detail.received} value={money(sums.received)} small />}
      </div>
    )
  }

  return (
    <div className="mt-1">
      {category && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Icon name={category.icon} className="size-4 text-accent" />
          {subtitle}
        </p>
      )}
      {!category && subtitle && <p className="text-sm font-semibold text-muted">{subtitle}</p>}

      <div className="mt-4">{headline}</div>
      <p className="mt-1 text-sm text-muted">{t.detail.entries(entries.length)}</p>
      {target.kind === 'weekday' && <p className="mt-2 text-xs text-muted">{t.detail.weekdayNote}</p>}

      {history && (
        <section className="mt-5">
          <h3 className="text-xs font-bold text-muted">{t.detail.history}</h3>
          <div className="mt-2 grid h-28 grid-cols-6 items-end gap-1.5">
            {history.map(({ cycle, spent }) => {
              const selected = range?.start === cycle.start && range.end === cycle.end
              const label = t.format.range(cycle.start, cycle.end)
              return (
                <button
                  key={cycle.start}
                  type="button"
                  aria-pressed={selected}
                  aria-label={t.detail.historyLabel(label, money(spent))}
                  title={`${label}: ${money(spent)}`}
                  onClick={() => onOpen({ target, range: { start: cycle.start, end: cycle.end } })}
                  className="group flex h-full flex-col justify-end gap-1 rounded-lg px-0.5 pt-1 transition-colors hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className={clsx('block min-h-0.5 rounded-t-[4px] bg-accent transition-opacity', !selected && 'opacity-45 group-hover:opacity-70')}
                    style={{ height: `${highest > 0 ? (spent / highest) * 72 : 0}%` }}
                  />
                  <span aria-hidden className={clsx('truncate text-center text-[0.8125rem] font-semibold', selected ? 'text-ink' : 'text-muted')}>
                    {t.format.month(cycle.start)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {othersListed && <p className="mt-3 text-xs text-muted">{t.detail.otherCurrencies}</p>}

      {entries.length === 0 ? (
        <p className="mt-6 rounded-xl bg-surface-2 px-4 py-5 text-center text-sm text-ink-2">{t.detail.none}</p>
      ) : (
        <ul className="-mx-3 mt-4 border-t border-line pt-2">
          {entries.slice(0, SHOWN).map((tx) => (
            <li key={tx.id}>
              <TransactionRow transaction={tx} names={names} currency={main} dated={target.kind !== 'day'} />
            </li>
          ))}
        </ul>
      )}

      {(link || debt) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {link && (
            <Link to={link} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              {entries.length > SHOWN ? t.detail.more(entries.length - SHOWN) : t.detail.openActivity}
            </Link>
          )}
          {debt && (
            <Link to={`/plan/debts/${debt.id}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              {t.detail.openDebt}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function Figure({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={clsx('font-extrabold tracking-tight', small ? 'text-xl' : 'text-3xl')}>{value}</p>
    </div>
  )
}
