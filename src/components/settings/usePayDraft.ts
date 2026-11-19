import { useState } from 'react'
import { t } from '../../i18n'
import { isShortPay, todayISO } from '../../lib/dates'
import { useAppStore } from '../../store'
import type { Profile } from '../../types'

export interface PayDraft {
  salary: Omit<Profile['salary'], 'amount'> & { amount: number | null }
  work: Profile['work']
}

/** Irregular pay budgets from what's received, or from an estimate. */
export type PayBasis = 'received' | 'estimate'

/** Salary and working time being edited, starting from what's saved. Shared by setup step 2 and Settings. */
export function usePayDraft() {
  const profile = useAppStore((s) => s.profile)
  const [draft, setDraft] = useState<PayDraft>(() => ({
    salary: { ...profile.salary, amount: profile.salary.amount || null },
    work: { hoursPerDay: profile.work.hoursPerDay || 8, daysPerWeek: profile.work.daysPerWeek || 5 },
  }))
  const [basis, setBasis] = useState<PayBasis>(profile.salary.frequency === 'irregular' && profile.salary.amount > 0 ? 'estimate' : 'received')
  const [error, setError] = useState<string | null>(null)
  return {
    draft,
    basis,
    error,
    setError,
    setBasis: (next: PayBasis) => {
      setBasis(next)
      setError(null)
    },
    setSalary: (patch: Partial<PayDraft['salary']>) =>
      setDraft((d) => {
        const salary = { ...d.salary, ...patch }
        // Cycles of 7 or 14 days need a day to start from: today until told otherwise.
        return { ...d, salary: isShortPay(salary) && !salary.anchor ? { ...salary, anchor: todayISO() } : salary }
      }),
    setWork: (patch: Partial<PayDraft['work']>) => setDraft((d) => ({ ...d, work: { ...d.work, ...patch } })),
    /** What to save, or `null` (with the error shown) when there's no amount yet and one is needed. */
    toProfile(): Pick<Profile, 'salary' | 'work'> | null {
      const { salary, work } = draft
      if (salary.frequency === 'irregular' && basis === 'received') return { salary: { ...salary, amount: 0 }, work }
      if (!salary.amount || salary.amount <= 0) {
        setError(salary.frequency === 'irregular' ? t.onboarding.salary.estimateError : t.onboarding.salary.amountError)
        return null
      }
      return { salary: { ...salary, amount: salary.amount }, work }
    },
  }
}

export type PayDraftState = ReturnType<typeof usePayDraft>
