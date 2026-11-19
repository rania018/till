import { useState } from 'react'
import { plannedFreeToSpend, suggestBudgets } from '../../lib/budget'
import { monthlyIncomes } from '../../lib/income'
import { monthlyDebtPayments } from '../../lib/debts'
import { live } from '../../lib/id'
import { roundMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import { SUGGESTED_BUDGET_SPLIT } from '../../store/defaults'
import type { ID } from '../../types'

export interface LimitRow {
  enabled: boolean
  limit: number | null
}

/**
 * Category switches and limits being edited, before they're saved. Starts from
 * suggestions when no category has a limit yet, so most people only adjust.
 */
export function useLimitsDraft() {
  const profile = useAppStore((s) => s.profile)
  const bills = live(useAppStore((s) => s.bills))
  const goals = live(useAppStore((s) => s.goals)).filter((g) => !g.archived)
  const categories = live(useAppStore((s) => s.categories))
    .filter((c) => c.kind === 'expense' && !c.system && !c.archived)
    .sort((a, b) => a.order - b.order)
  const debts = useAppStore((s) => s.debts)
  const transactions = useAppStore((s) => s.transactions)
  const incomes = useAppStore((s) => s.incomes)
  const debtPayments = monthlyDebtPayments(debts, transactions, profile.currency)
  const otherIncome = monthlyIncomes(incomes, profile.currency)
  const free = plannedFreeToSpend(profile, bills, goals, debtPayments, otherIncome)

  const [rows, setRows] = useState<Record<ID, LimitRow>>(() => {
    const initial = Object.fromEntries(categories.map((c) => [c.id, { enabled: c.enabled, limit: c.monthlyBudget ?? null }]))
    if (!categories.some((c) => (c.monthlyBudget ?? 0) > 0)) {
      for (const [id, limit] of suggestBudgets(free, SUGGESTED_BUDGET_SPLIT)) if (initial[id]) initial[id] = { ...initial[id], limit }
    }
    return initial
  })

  // A main category's limit already covers its subcategories, so theirs aren't added again.
  const limitOf = (id: ID) => (rows[id]?.enabled ? (rows[id].limit ?? 0) : 0)
  const assigned = roundMoney(
    categories
      .filter((c) => !c.parentId)
      .reduce((sum, main) => sum + (limitOf(main.id) > 0 ? limitOf(main.id) : categories.filter((c) => c.parentId === main.id).reduce((subs, c) => subs + limitOf(c.id), 0)), 0),
  )

  return {
    profile,
    bills,
    goals,
    categories,
    free,
    debtPayments,
    otherIncome,
    rows,
    assigned,
    difference: roundMoney(free - assigned),
    update(id: ID, patch: Partial<LimitRow>) {
      setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))
    },
    suggest() {
      setRows((current) => {
        const next = { ...current }
        for (const [id, limit] of suggestBudgets(free, SUGGESTED_BUDGET_SPLIT)) if (next[id]) next[id] = { enabled: true, limit }
        return next
      })
    },
    save() {
      appStore
        .getState()
        .setCategoryBudgets(
          Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, { enabled: row.enabled, monthlyBudget: row.limit && row.limit > 0 ? row.limit : null }])),
        )
    },
  }
}

export type LimitsDraft = ReturnType<typeof useLimitsDraft>
