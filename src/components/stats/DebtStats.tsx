import { Link } from 'react-router'
import { t } from '../../i18n'
import { formatAmounts, isMainCurrency } from '../../lib/currency'
import { debtTotals, type DebtView } from '../../lib/debts'
import { formatMoney, sumAmounts } from '../../lib/money'
import type { DebtFlows } from '../../lib/stats'
import { ChevronRight } from '../ui/directionalIcons'

interface DebtStatsProps {
  views: DebtView[]
  flows: DebtFlows
  currency: string
  /** Only for the pay cycle running now: how this cycle's instalments are going. */
  showInstalments: boolean
  /** Opens a debt's details. */
  onSelect?: (debtId: string) => void
}

/** Debts in their own section: never part of Spent or Income, so what moved here has nowhere else to show. */
export function DebtStats({ views, flows, currency, showInstalments, onSelect }: DebtStatsProps) {
  const copy = t.stats.debts
  const { iOwe, owedToMe } = debtTotals(views, currency)
  const moved = [
    { label: copy.repaid, amount: flows.repaid },
    { label: copy.repaidToYou, amount: flows.repaidToYou },
    { label: copy.borrowed, amount: flows.borrowed },
    { label: copy.lent, amount: flows.lent },
  ].filter((row) => row.amount > 0)
  if (iOwe.length === 0 && owedToMe.length === 0 && moved.length === 0) return null

  const late = views.filter((v) => v.status === 'overdue').length
  const inMain = views.filter((v) => isMainCurrency(v.debt, currency))
  const planned = sumAmounts(inMain.map((v) => v.plan.planned))
  const paid = sumAmounts(inMain.map((v) => v.plan.paid))
  const money = (amount: number) => formatMoney(amount, currency)

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 desk:h-full desk:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 desk:mb-2 desk:min-h-9">
        <h2 className="text-sm font-extrabold desk:text-base">{copy.title}</h2>
        <Link to="/plan/debts" className="flex items-center gap-0.5 text-sm font-bold text-accent desk:text-xs">
          {t.home.seeAll}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-muted">{t.debts.iOwe}</dt>
          <dd className="text-lg font-extrabold tabular-nums">{iOwe.length > 0 ? formatAmounts(iOwe, currency) : money(0)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-muted">{t.debts.owedToMe}</dt>
          <dd className="text-lg font-extrabold tabular-nums">{owedToMe.length > 0 ? formatAmounts(owedToMe, currency) : money(0)}</dd>
        </div>
      </dl>

      {showInstalments && planned > 0 && <p className="mt-3 text-sm font-semibold text-ink-2">{t.debts.instalmentsThisCycle(money(paid), money(planned))}</p>}
      {late > 0 && (
        <p className="mt-1 text-sm font-bold text-crit-ink">
          <Link to="/plan/debts">{copy.late(late)}</Link>
        </p>
      )}

      {onSelect && views.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-xs font-semibold text-muted">{copy.each}</h3>
          <ul className="-mx-2">
            {views.map((view) => (
              <li key={view.debt.id}>
                <button type="button" onClick={() => onSelect(view.debt.id)} className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-start text-sm transition-colors hover:bg-surface-2">
                  <span className="min-w-0 truncate font-semibold">
                    {view.debt.person}
                    <span className="ms-2 text-xs font-semibold text-muted">{view.debt.direction === 'borrowed' ? t.debts.iOwe : t.debts.owedToMe}</span>
                  </span>
                  <span className={view.status === 'overdue' ? 'whitespace-nowrap font-extrabold tabular-nums text-crit-ink' : 'whitespace-nowrap font-extrabold tabular-nums'}>
                    {view.owed > 0 ? formatMoney(view.owed, view.debt.currency ?? currency) : copy.settled}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mb-1 mt-4 text-xs font-semibold text-muted">{copy.moved}</h3>
      {moved.length > 0 ? (
        <ul className="divide-y divide-line">
          {moved.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="font-semibold text-ink-2">{row.label}</span>
              <span className="whitespace-nowrap font-extrabold tabular-nums">{money(row.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{copy.none}</p>
      )}
      <p className="mt-3 text-xs text-muted in-data-quiet:sr-only">{copy.note}</p>
    </section>
  )
}
