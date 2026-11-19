import clsx from 'clsx'
import { addMonths } from 'date-fns'
import { Banknote, CalendarClock, HandCoins, PiggyBank, Plus, Receipt, Target, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ActivityTabs } from '../components/calendar/ActivityTabs'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { TransactionRow } from '../components/transactions/TransactionRow'
import { Button, IconButton } from '../components/ui/Button'
import { ChevronLeft, ChevronRight } from '../components/ui/directionalIcons'
import { PageHeader } from '../components/ui/PageHeader'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { calendarMonth, monthGrid, monthOf, type CalendarDay, type CalendarEvent } from '../lib/calendar'
import { fromISODate, todayISO, toISODate } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { isValidDate } from '../lib/validation'
import { useAppStore } from '../store'
import type { ISODate } from '../types'

const ICONS: Record<CalendarEvent['kind'], LucideIcon> = { bill: Receipt, pay: Banknote, goal: Target, fund: PiggyBank, debt: HandCoins, instalment: CalendarClock }

/** Darker for days with more spending, against the month's busiest day. */
const SHADES = ['', 'bg-accent/15', 'bg-accent/25', 'bg-accent/35', 'bg-accent/50']

/** Late is red whatever it is; done is grey. Colour is never the only sign: every cell says it all in words. */
function dotClass(event: CalendarEvent): string {
  if (event.status === 'late') return 'bg-crit'
  if (event.status === 'paid' || event.status === 'received') return 'bg-muted'
  if (event.kind === 'pay') return 'bg-good'
  if (event.kind === 'bill' || event.kind === 'instalment') return 'bg-warn'
  return 'bg-accent'
}

/** Where to act on it: its bill, goal or debt, or Home to answer pay that's due. */
function linkFor(event: CalendarEvent): string {
  switch (event.kind) {
    case 'bill':
      return '/plan/bills'
    case 'pay':
      return event.status === 'expected' ? '/' : '/settings/pay'
    case 'goal':
    case 'fund':
      return `/plan/goals/${event.recordId}`
    case 'debt':
    case 'instalment':
      return `/plan/debts/${event.recordId}`
  }
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const desktop = useIsDesktop()
  const data = useAppStore(
    useShallow((s) => ({ profile: s.profile, transactions: s.transactions, bills: s.bills, goals: s.goals, debts: s.debts, incomes: s.incomes, categories: s.categories, accounts: s.accounts })),
  )
  const today = todayISO()
  const thisMonth = monthOf(today)
  const monthParam = params.get('month')
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && isValidDate(`${monthParam}-01`) ? `${monthParam}-01` : thisMonth
  const dayParam = params.get('day')
  const selected = dayParam && isValidDate(dayParam) && monthOf(dayParam) === month ? dayParam : month === thisMonth ? today : month
  const main = data.profile.currency
  const money = (amount: number, currency = main) => formatMoney(amount, currency)
  const copy = t.calendar

  const calendar = useMemo(() => calendarMonth(data, month, today), [data, month, today])
  const byDate = useMemo(() => new Map(calendar.days.map((d) => [d.date, d])), [calendar])
  const weeks = monthGrid(month, t.format.weekStartsOn)
  const weekdays = Array.from({ length: 7 }, (_, i) => (t.format.weekStartsOn + i) % 7)
  const names = useMemo(() => ({ categories: data.categories, accounts: data.accounts, goals: data.goals, debts: data.debts }), [data.categories, data.accounts, data.goals, data.debts])

  const showMonth = (next: ISODate) => setParams(next === thisMonth ? {} : { month: next.slice(0, 7) })
  const pick = (date: ISODate) => setParams({ ...(month !== thisMonth && { month: month.slice(0, 7) }), day: date }, { replace: true })
  const step = (by: number) => showMonth(toISODate(addMonths(fromISODate(month), by)))

  const eventTitle = (event: CalendarEvent) => event.name ?? copy.salary
  const describeDay = (day: CalendarDay) => {
    const parts = [
      day.spent > 0 && copy.daySpent(money(day.spent)),
      day.received > 0 && copy.dayReceived(money(day.received)),
      ...day.events.map((e) => `${copy.kinds[e.kind]}: ${eventTitle(e)}, ${copy.status[e.status]}`),
    ].filter(Boolean)
    return `${t.format.longDay(day.date)}${parts.length ? `: ${parts.join(', ')}` : ''}`
  }

  const switcher = (
    <div className="flex items-center gap-1 desk:shrink-0">
      {/* On a card in the top bar, like the pay cycle on the other Activity tabs. */}
      <div className="contents desk:flex desk:items-center desk:gap-1 desk:rounded-xl desk:border desk:border-line desk:bg-surface">
        <IconButton icon={ChevronLeft} label={copy.previousMonth} variant="ghost" onClick={() => step(-1)} />
        <p className="min-w-36 text-center font-extrabold desk:whitespace-nowrap desk:text-base">{t.format.monthYear(month)}</p>
        <IconButton icon={ChevronRight} label={copy.nextMonth} variant="ghost" onClick={() => step(1)} />
      </div>
      {month !== thisMonth && (
        <Button size="sm" variant="secondary" onClick={() => showMonth(thisMonth)} className="ms-1">
          {copy.today}
        </Button>
      )}
    </div>
  )

  const summary = (
    <p className="text-sm font-semibold text-muted">
      {[copy.spent(money(calendar.spent)), copy.received(money(calendar.received)), calendar.billsDue > 0 && (calendar.billsOpen > 0 ? copy.billsOpen(calendar.billsOpen, money(calendar.billsToPay)) : copy.billsPaid)]
        .filter(Boolean)
        .join(' · ')}
    </p>
  )

  const grid = (
    <div>
      <div aria-hidden className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted desk:gap-1.5">
        {weekdays.map((day) => (
          <span key={day} className="truncate py-1">
            {desktop ? t.format.weekdaysShort[day] : t.format.weekdaysNarrow[day]}
          </span>
        ))}
      </div>
      <div role="group" aria-label={t.format.monthYear(month)} className="grid grid-cols-7 gap-1 desk:gap-1.5">
        {weeks.flat().map((date, i) => {
          if (!date) return <span key={`empty-${i}`} aria-hidden />
          const day = byDate.get(date)!
          const shade = calendar.busiestDay > 0 && day.spent > 0 ? SHADES[Math.max(1, Math.ceil((day.spent / calendar.busiestDay) * 4))] : ''
          const isToday = date === today
          const isSelected = date === selected
          return (
            <button
              key={date}
              type="button"
              aria-pressed={isSelected}
              aria-label={describeDay(day)}
              onClick={() => pick(date)}
              className={clsx(
                'flex min-h-12 flex-col rounded-xl border p-1 text-start transition-colors desk:min-h-24 desk:p-2',
                shade || 'bg-surface',
                isSelected ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-accent/60',
                date < today && !shade && 'text-ink-2',
              )}
            >
              <span className={clsx('text-sm tabular-nums', isToday ? 'grid size-6 place-items-center rounded-full bg-accent font-extrabold text-on-accent' : 'font-bold')}>
                {t.format.dayNumber(date)}
              </span>
              {desktop ? (
                <>
                  {day.spent > 0 && <span className="mt-0.5 truncate text-sm font-bold tabular-nums">{money(day.spent)}</span>}
                  {day.events.slice(0, 2).map((event) => (
                    <span key={event.id} className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-ink-2">
                      <span aria-hidden className={clsx('size-1.5 shrink-0 rounded-full', dotClass(event))} />
                      <span className="truncate">{eventTitle(event)}</span>
                    </span>
                  ))}
                  {day.events.length > 2 && <span className="text-xs text-muted">{copy.more(day.events.length - 2)}</span>}
                </>
              ) : (
                day.events.length > 0 && (
                  <span aria-hidden className="mt-auto flex flex-wrap justify-center gap-0.5 pb-0.5">
                    {day.events.slice(0, 3).map((event) => (
                      <span key={event.id} className={clsx('size-1.5 rounded-full', dotClass(event))} />
                    ))}
                  </span>
                )
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted">{copy.legend}</p>
    </div>
  )

  const day = byDate.get(selected)!
  const dayPanel = (
    <section aria-labelledby="calendar-day" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="calendar-day" className="text-lg font-extrabold">
            {t.format.longDayWithYear(selected)}
          </h2>
          {(day.spent > 0 || day.received > 0) && (
            <p className="text-sm font-semibold text-muted">{[day.spent > 0 && copy.daySpent(money(day.spent)), day.received > 0 && copy.dayReceived(money(day.received))].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <Button size="sm" icon={Plus} onClick={() => openTransactionSheet('expense', { date: selected })}>
          {copy.addOnDay}
        </Button>
      </div>

      {day.events.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-extrabold">{copy.dueTitle}</h3>
          <ul className="rounded-2xl border border-line bg-surface p-1">
            {day.events.map((event) => {
              const KindIcon = ICONS[event.kind]
              return (
                <li key={event.id}>
                  <Link to={linkFor(event)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent desk:size-9">
                      <KindIcon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{eventTitle(event)}</span>
                      <span className="flex items-center gap-1.5 text-sm text-muted">
                        <span aria-hidden className={clsx('size-2 shrink-0 rounded-full', dotClass(event))} />
                        <span className="truncate">
                          {copy.kinds[event.kind]} · {copy.status[event.status]}
                        </span>
                      </span>
                    </span>
                    {event.amount !== undefined && <span className="shrink-0 font-extrabold tabular-nums">{money(event.amount, event.currency ?? main)}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {day.entries.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-extrabold">{copy.entriesTitle}</h3>
          <ul className="rounded-2xl border border-line bg-surface p-1">
            {day.entries.map((tx) => (
              <li key={tx.id}>
                <TransactionRow transaction={tx} names={names} currency={main} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {day.events.length === 0 && day.entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.9375rem] text-ink-2">{copy.nothing}</p>
      )}
    </section>
  )

  return (
    <>
      <PageHeader title={t.nav.calendar} nav={desktop && <ActivityTabs />} centerNav actions={desktop && switcher} />
      {!desktop && (
        <div className="mb-4 space-y-3">
          <div className="lg:max-w-xs">
            <ActivityTabs />
          </div>
          {switcher}
        </div>
      )}
      <div className="mb-3">{summary}</div>
      <div className="space-y-6 min-[1360px]:grid min-[1360px]:grid-cols-[minmax(0,1fr)_26rem] min-[1360px]:items-start min-[1360px]:gap-8 min-[1360px]:space-y-0">
        {grid}
        <div className="min-[1360px]:sticky min-[1360px]:top-24">{dayPanel}</div>
      </div>
    </>
  )
}
