import clsx from 'clsx'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { ArrowRight, ChevronRight } from '../components/ui/directionalIcons'
import { subDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ForecastLine } from '../components/budget/ForecastLine'
import { BudgetBreakdown } from '../components/budget/BudgetBreakdown'
import { budgetNote, daysLeftText } from '../components/budget/budgetText'
import { ExpectedPays } from '../components/income/ExpectedPays'
import { HomeDesk } from '../components/desk/HomeDesk'
import { AlertList } from '../components/home/AlertList'
import { RepeatApprovals } from '../components/debts/RepeatApprovals'
import { BillsCard, DebtsCard, GoalsCard, WalletsCard } from '../components/home/HomeCards'
import { ReminderBanner } from '../components/home/ReminderBanner'
import { WhereItWentCard } from '../components/home/WhereItWentCard'
import { ExportButton } from '../components/ExportButton'
import { TransactionRow } from '../components/transactions/TransactionRow'
import { buttonClass, iconButtonClass } from '../components/ui/buttonStyles'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { HideAmountsButton } from '../components/lock/HideAmountsButton'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StatTile } from '../components/ui/StatTile'
import { TileAmount } from '../components/ui/TileAmount'
import { CashCountSheet } from '../components/wallets/CashCountSheet'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { t } from '../i18n'
import { homeAlerts } from '../lib/alerts'
import { cycleBills } from '../lib/bills'
import { budgetSummary, leftShown } from '../lib/budget'
import { fromISODate, planMonth, todayISO, toISODate } from '../lib/dates'
import { debtViews } from '../lib/debts'
import { homeWorkbook } from '../lib/export/pages'
import { goalViews } from '../lib/goals'
import { live } from '../lib/id'
import { SafekeepingCard } from '../components/home/SafekeepingCard'
import { FundsDueCard } from '../components/goals/FundsDueCard'
import { ReviewCard } from '../components/review/ReviewCard'
import { formatMoney } from '../lib/money'
import { weeklyReminderDue } from '../lib/reminders'
import { newestFirst } from '../lib/transactions'
import { walletBalance } from '../lib/wallets'
import { appStore, useAppStore } from '../store'
import type { Account } from '../types'
import { isOnboardingPostponed } from './onboarding/postpone'

/** Latest entries on Home: phones show fewer, because everything is in one column there. */
const RECENT = 4
const RECENT_WIDE = 5
const RECENT_DESK = 8

export function HomePage() {
  const onboarded = useAppStore((s) => s.profile.onboardingCompleted)
  if (!onboarded) {
    // First open: go straight to setup, unless "Set up later" was chosen.
    if (!isOnboardingPostponed()) return <Navigate to="/onboarding/1" replace />
    return <SetupPrompt />
  }
  return <CycleOverview />
}

function SetupPrompt() {
  return (
    <>
      <PageHeader title={t.home.title} />
      <section className="rounded-2xl bg-accent p-5 text-on-accent">
        <h2 className="text-lg font-extrabold">{t.home.setupTitle}</h2>
        <p className="mt-1 max-w-md text-[0.9375rem] opacity-90">{t.home.setupBody}</p>
        <Link to="/onboarding/1" className={clsx(buttonClass({ variant: 'secondary' }), 'mt-4')}>
          {t.home.setupAction}
          <ArrowRight aria-hidden className="size-[1.125rem]" />
        </Link>
      </section>
    </>
  )
}

/**
 * Home once set up: what's left until payday, anything that needs attention,
 * this cycle's totals, wallets, bills, goals and the latest entries. Phones get
 * one column in that order; wider screens run the budget across the top and put wallets, bills and goals on the right.
 */
function CycleOverview() {
  const data = useAppStore(
    useShallow((s) => ({
      profile: s.profile,
      settings: s.settings,
      categories: s.categories,
      transactions: s.transactions,
      accounts: s.accounts,
      goals: s.goals,
      debts: s.debts,
      incomes: s.incomes,
      bills: s.bills,
      wishlist: s.wishlist,
    })),
  )
  const [counting, setCounting] = useState<Account | null>(null)
  const desktop = useIsDesktop()
  // Ticks each minute, so the weekly reminder and "today" turn over while Home is open.
  const now = useNow()
  const today = todayISO(now)
  const minute = Math.floor(now.getTime() / 60_000)
  const summary = useMemo(() => budgetSummary(data, today), [data, today])
  // `minute` stands in for `now`: these rerun once a minute, not on every render.
  const alerts = useMemo(() => homeAlerts(data, today, new Date(minute * 60_000)), [data, today, minute])
  const reminder = useMemo(() => weeklyReminderDue(data, new Date(minute * 60_000)), [data, minute])
  // Bills, goals and instalments are monthly, even when pay isn't.
  const { start: monthStart, end: monthEnd, days: monthDays } = planMonth(today, data.profile.salary)
  const month = useMemo(() => ({ start: monthStart, end: monthEnd, days: monthDays }), [monthStart, monthEnd, monthDays])
  const bills = useMemo(() => cycleBills(data.bills, month, data.transactions, today), [data.bills, month, data.transactions, today])
  const goals = useMemo(() => goalViews(data.goals, data.transactions, month, today, data.profile.salary, data.bills), [data.goals, data.transactions, month, today, data.profile.salary, data.bills])
  const debts = useMemo(() => debtViews(data.debts, data.transactions, month, today), [data.debts, data.transactions, month, today])
  const wallets = useMemo(
    () =>
      live(data.accounts)
        .filter((a) => !a.archived)
        .map((account) => ({ account, balance: walletBalance(account, data.transactions, today) })),
    [data.accounts, data.transactions, today],
  )
  const recent = useMemo(() => live(data.transactions).sort(newestFirst).slice(0, desktop ? RECENT_DESK : RECENT_WIDE), [data.transactions, desktop])
  const names = useMemo(() => ({ categories: data.categories, accounts: data.accounts, goals: data.goals, debts: data.debts }), [data.categories, data.accounts, data.goals, data.debts])
  const currency = data.profile.currency
  const money = (amount: number) => formatMoney(amount, currency)
  const { name } = data.profile
  const subtitle = name ? `${t.home.greeting(name)} · ${t.format.longDay(today)}` : t.format.longDay(today)
  // On phones the two columns dissolve (`contents`) and `order` puts the cards in the mockup's order.
  const column = 'contents lg:flex lg:flex-col lg:gap-4'
  const exportButton = <ExportButton workbook={() => homeWorkbook(appStore.getState(), today)} />
  const countSheet = (
    <CashCountSheet
      account={counting}
      expected={counting ? walletBalance(counting, data.transactions, today) : 0}
      currency={currency}
      onClose={() => setCounting(null)}
    />
  )

  if (desktop) {
    return (
      <>
        <PageHeader
          title={t.format.range(summary.cycle.start, summary.cycle.end)}
          subtitle={subtitle}
          actions={
            <>
              <HideAmountsButton />
              {exportButton}
            </>
          }
        />
        <HomeDesk
          summary={summary}
          currency={currency}
          today={today}
          yesterday={toISODate(subDays(fromISODate(today), 1))}
          transactions={data.transactions}
          recent={recent}
          names={names}
          categories={data.categories}
          alerts={{ alerts, categories: data.categories, bills: data.bills, currency, today }}
          reminder={reminder && <ReminderBanner key={reminder.week.end} reminder={reminder} />}
          wallets={{ wallets, salaryAccountId: data.profile.salary.accountId, currency, onCountCash: setCounting }}
          bills={{ bills, currency, today }}
          goals={{ goals, currency }}
          debts={{ debts, currency }}
        />
        {countSheet}
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t.format.range(summary.cycle.start, summary.cycle.end)}
        subtitle={subtitle}
        actions={
          <>
            {/* The bottom bar has no room for Calendar, so phones reach it from here (and from Activity). */}
            <Link to="/calendar" aria-label={t.nav.calendar} title={t.nav.calendar} className={iconButtonClass()}>
              <CalendarDays aria-hidden className="size-5" />
            </Link>
            <HideAmountsButton />
            {exportButton}
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="order-1 lg:order-none lg:col-span-2">
          {summary.hasPay ? (
            <section className="rounded-2xl bg-accent p-5 text-on-accent lg:p-7 xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-10">
              <div>
                <p className="text-sm font-bold opacity-85">{t.home.leftToSpend}</p>
                <p className="text-4xl font-extrabold tracking-tight lg:text-6xl">{money(leftShown(summary))}</p>
                <p className="text-sm opacity-85 lg:mt-1">{budgetNote(summary, money)}</p>
                <ProgressBar value={summary.waitingFor > 0 ? 0 : summary.flexibleBudget > 0 ? summary.usedRatio : 1} marker={summary.progress.elapsedRatio} tone="inverse" label={t.home.usedLabel} className="mt-4 lg:mt-5" />
                {summary.flexibleBudget > 0 && summary.waitingFor === 0 && (
                  <p className="mt-2 text-xs opacity-90">
                    {t.home.usedAndElapsed(Math.round(summary.usedRatio * 100), Math.round(summary.progress.elapsedRatio * 100))}
                  </p>
                )}
                <ForecastLine summary={summary} money={money} inverse className="mt-1.5" />
                <details className="group mt-3 xl:hidden">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-bold opacity-90 [&::-webkit-details-marker]:hidden">
                    <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                    {t.home.howWorkedOut}
                  </summary>
                  <BudgetBreakdown summary={summary} currency={currency} inverse className="mt-1" />
                </details>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-on-accent/25 pt-3 lg:mt-5">
                  <div>
                    <p className="text-sm opacity-85">{t.home.safeToSpend}</p>
                    <p className="text-lg font-extrabold">{t.home.perDay(money(summary.safePerDay))}</p>
                  </div>
                  <p className="text-sm font-semibold opacity-90">{daysLeftText(summary)}</p>
                </div>
              </div>
              {/* There's room to show the sums outright, so "How is this worked out?" isn't needed here. */}
              <BudgetBreakdown summary={summary} currency={currency} inverse className="hidden self-center border-s border-on-accent/25 ps-10 xl:block" />
            </section>
          ) : (
            <Card>
              <p className="text-[0.9375rem] text-ink-2">{t.home.noSalary}</p>
              <Link to="/settings/pay" className={clsx(buttonClass({ variant: 'secondary', size: 'sm' }), 'mt-3')}>
                {t.home.noSalaryAction}
              </Link>
            </Card>
          )}
        </div>

        <div className={column}>
          <div className="order-2 empty:hidden lg:order-none">
            <ExpectedPays today={today} />
          </div>

          {reminder && (
            <div className="order-2 lg:order-none">
              <ReminderBanner key={reminder.week.end} reminder={reminder} />
            </div>
          )}

          {alerts.length > 0 && (
            <div className="order-2 lg:order-none">
              <AlertList alerts={alerts} categories={data.categories} bills={data.bills} currency={currency} today={today} />
            </div>
          )}

          <div className="order-2 empty:hidden lg:order-none">
            <RepeatApprovals />
          </div>

          <div className="order-2 empty:hidden lg:order-none">
            <ReviewCard today={today} />
          </div>

          <div className="order-2 empty:hidden lg:order-none">
            <FundsDueCard today={today} />
          </div>

          <div className="order-2 empty:hidden lg:order-none">
            <SafekeepingCard />
          </div>

          <section aria-label={t.home.tilesLabel} className="order-3 grid grid-cols-3 gap-2 lg:order-none">
            <StatTile label={t.home.spent} value={<TileAmount amount={summary.spent} currency={currency} />} />
            <StatTile label={t.home.income} value={<TileAmount amount={summary.income} currency={currency} />} />
            <StatTile label={t.home.saved} value={<TileAmount amount={summary.saved} currency={currency} />} />
          </section>

          {/* Where it went, right under this cycle's totals: a tap on a category opens its own stats. */}
          <WhereItWentCard transactions={data.transactions} categories={data.categories} cycle={summary.cycle} currency={currency} rows={3} size={104} className="order-3 lg:order-none" />

          {recent.length > 0 && (
            <section className="order-7 rounded-2xl border border-line bg-surface p-1 lg:order-none">
              <div className="flex items-center justify-between px-3 pb-1 pt-3">
                <h2 className="text-sm font-extrabold">{t.home.recent}</h2>
                <Link to="/activity/list" className="flex items-center gap-0.5 text-xs font-bold text-accent">
                  {t.home.seeAll}
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              </div>
              <ul>
                {recent.map((tx, index) => (
                  <li key={tx.id} className={clsx(index >= RECENT && 'hidden lg:block')}>
                    <TransactionRow transaction={tx} names={names} currency={currency} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className={column}>
          <div className="order-4 lg:order-none">
            <WalletsCard wallets={wallets} salaryAccountId={data.profile.salary.accountId} currency={currency} onCountCash={setCounting} />
          </div>
          {bills.due.length > 0 && (
            <div className="order-5 lg:order-none">
              <BillsCard bills={bills} currency={currency} today={today} />
            </div>
          )}
          <div className="order-6 lg:order-none">
            <GoalsCard goals={goals} currency={currency} />
          </div>
          <div className="order-6 empty:hidden lg:order-none">
            <DebtsCard debts={debts} currency={currency} />
          </div>
        </div>
      </div>

      {countSheet}
    </>
  )
}
