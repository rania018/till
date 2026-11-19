import { useMemo } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { CycleSwitcher } from '../../components/CycleSwitcher'
import { ExportButton } from '../../components/ExportButton'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedLinks } from '../../components/ui/SegmentedControl'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { getPayCycle, planMonth, todayISO } from '../../lib/dates'
import { billsWorkbook, budgetWorkbook, debtsWorkbook, goalsWorkbook } from '../../lib/export/pages'
import { isGoalBehind } from '../../lib/attention'
import { goalViews } from '../../lib/goals'
import { isValidDate } from '../../lib/validation'
import { appStore, useAppStore } from '../../store'

/** Plan holds four sub-pages under one bottom-bar tab. */
export function PlanPage() {
  const { goals, transactions, salary, bills } = useAppStore(useShallow((s) => ({ goals: s.goals, transactions: s.transactions, salary: s.profile.salary, bills: s.bills })))
  const desktop = useIsDesktop()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const { start, end } = planMonth(today, salary)
  // Goals that won't make their deadline get a badge on their tab (§7.1 "goal off track").
  const behind = useMemo(
    // A fund past its date is a bill still to pay, which Bills already shows.
    () => goalViews(goals, transactions, { start, end }, today, salary, bills).filter(isGoalBehind).length,
    [goals, transactions, start, end, today, salary, bills],
  )

  // The header is shared, so the button exports whichever tab is open.
  const tabWorkbook = () => {
    const data = appStore.getState()
    if (pathname.endsWith('/bills')) return billsWorkbook(data, today)
    if (pathname.endsWith('/goals')) return goalsWorkbook(data, today)
    if (pathname.endsWith('/debts')) return debtsWorkbook(data, today)
    return budgetWorkbook(data, today, params.get('cycle'))
  }

  // On a computer Budget's pay cycle is in the top bar, as on Activity.
  const onBudget = !/\/(bills|goals|debts)$/.test(pathname)
  const currentCycle = getPayCycle(today, salary)
  const cycleParam = params.get('cycle')
  const cycle = cycleParam && isValidDate(cycleParam) ? getPayCycle(cycleParam, salary) : currentCycle

  const tabs = (
    <SegmentedLinks
      prominent
      label={t.plan.tabsLabel}
      links={[
        { to: '/plan/budget', label: t.plan.budget },
        { to: '/plan/bills', label: t.plan.bills },
        { to: '/plan/goals', label: t.plan.goals, badge: { count: behind, label: t.plan.goalsBehind(behind) } },
        { to: '/plan/debts', label: t.plan.debts },
      ]}
    />
  )

  return (
    <>
      <PageHeader
        title={t.plan.title}
        nav={desktop && tabs}
        centerNav
        actions={
          <>
            {desktop && onBudget && <CycleSwitcher framed cycle={cycle} current={currentCycle} salary={salary} onChange={(start) => setParams(start ? { cycle: start } : {}, { replace: true })} />}
            <ExportButton iconOnly={desktop} workbook={tabWorkbook} />
          </>
        }
      />
      {!desktop && <div className="lg:max-w-sm">{tabs}</div>}
      <div className="mt-4 lg:mt-6 desk:mt-0">
        <Outlet />
      </div>
    </>
  )
}
