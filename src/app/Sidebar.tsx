import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '../components/ui/Button'
import { LogoTile } from '../components/ui/Logo'
import { daysLeftText } from '../components/budget/budgetText'
import { ProgressBar } from '../components/ui/ProgressBar'
import { t } from '../i18n'
import { attention, planAttention } from '../lib/attention'
import { budgetSummary, leftShown } from '../lib/budget'
import { todayISO } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { useAppStore } from '../store'
import { SECONDARY_NAV, SIDEBAR_NAV, type NavItem } from './nav'

function SideLink({ item, badge }: { item: NavItem; badge?: { count: number; label: string } }) {
  const Icon = item.icon
  const { pathname } = useLocation()
  const within = (paths?: string[]) => paths?.some((path) => pathname.startsWith(path)) ?? false
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        clsx(
          'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors desk:min-h-10 desk:gap-3 desk:px-3 desk:text-sm',
          (isActive && !within(item.notFor)) || within(item.alsoFor) ? 'bg-accent-soft font-extrabold text-accent' : 'font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <Icon aria-hidden className="size-5" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge && badge.count > 0 && (
        <>
          <span aria-hidden title={badge.label} className="grid min-w-6 place-items-center rounded-full bg-warn-soft px-1.5 text-xs font-extrabold tabular-nums text-warn-ink">
            {badge.count}
          </span>
          <span className="sr-only">, {badge.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** The counts beside Home and Plan: what's waiting for you there, said in words too. */
function useAttentionBadges(): Record<NonNullable<NavItem['attention']>, { count: number; label: string }> {
  const data = useAppStore(useShallow((s) => ({ profile: s.profile, transactions: s.transactions, bills: s.bills, goals: s.goals, debts: s.debts, incomes: s.incomes })))
  const today = todayISO()
  return useMemo(() => {
    const a = attention(data, today)
    const copy = t.nav.attention
    const plan = [a.lateBills > 0 && copy.lateBills(a.lateBills), a.goalsBehind > 0 && copy.goalsBehind(a.goalsBehind), a.lateDebts > 0 && copy.lateDebts(a.lateDebts)].filter(Boolean).join(', ')
    return {
      home: { count: a.pay, label: copy.pay(a.pay) },
      plan: { count: planAttention(a), label: plan },
    }
  }, [data, today])
}

/** On a computer, what's left stays in view from every page. */
function BudgetStatus() {
  const data = useAppStore(
    useShallow((s) => ({ profile: s.profile, settings: s.settings, categories: s.categories, transactions: s.transactions, bills: s.bills, goals: s.goals, debts: s.debts, incomes: s.incomes })),
  )
  const today = todayISO()
  const summary = useMemo(() => budgetSummary(data, today), [data, today])
  if (!summary.hasPay) return null
  return (
    <NavLink to="/" className="hidden rounded-xl border border-line p-3 transition-colors hover:bg-surface-2 desk:block">
      <span className="block text-xs font-semibold text-muted">{t.home.leftToSpend}</span>
      <span className="mt-0.5 block text-lg font-extrabold tabular-nums tracking-tight">{formatMoney(leftShown(summary), data.profile.currency)}</span>
      <ProgressBar value={summary.waitingFor > 0 ? 0 : summary.flexibleBudget > 0 ? summary.usedRatio : 1} marker={summary.progress.elapsedRatio} label={t.home.usedLabel} className="my-2" />
      <span className="block text-xs text-muted">{summary.waitingFor > 0 ? t.income.waitingShort : daysLeftText(summary)}</span>
    </NavLink>
  )
}

/** Tablets and computers: the same places as the bottom bar, plus Calendar, Wallets, Is it worth it? and Settings. */
export function Sidebar({ onAdd }: { onAdd: () => void }) {
  const badges = useAttentionBadges()
  return (
    <aside className="fixed inset-y-0 start-0 z-20 hidden w-62 print:!hidden flex-col gap-6 overflow-y-auto border-e border-line bg-surface px-4 py-6 md:flex desk:w-60 desk:gap-5 desk:px-3 desk:py-4">
      <div className="flex items-center gap-2.5 px-2 desk:h-8 desk:px-3">
        <LogoTile className="size-9 desk:size-7" />
        <span className="text-[1.0625rem] font-extrabold tracking-tight">{t.appName}</span>
      </div>
      {/* On a computer, Add lives in the top bar of every page. */}
      <div className="desk:hidden">
        <Button icon={Plus} onClick={onAdd} block>
          {t.nav.add}
        </Button>
      </div>
      <nav aria-label={t.nav.label} className="flex flex-col gap-1 desk:gap-0.5">
        {SIDEBAR_NAV.map((item) => (
          <SideLink key={item.to} item={item} badge={item.attention && badges[item.attention]} />
        ))}
      </nav>
      <nav aria-label={t.nav.more} className="mt-auto flex flex-col gap-1 desk:gap-0.5">
        {SECONDARY_NAV.map((item) => (
          <SideLink key={item.to} item={item} />
        ))}
      </nav>
      <BudgetStatus />
    </aside>
  )
}
