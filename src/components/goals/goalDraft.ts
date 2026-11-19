import { t } from '../../i18n'
import { goalRoomError } from '../../lib/validation'
import type { FundRepeat, Goal, ID, ISODate } from '../../types'

/** A goal is saved for once; a fund comes back every year. */
export type GoalKind = 'goal' | 'fund'

/** What the goal form edits. Amounts are `null` while the field is empty. */
export interface GoalDraft {
  id?: ID
  kind: GoalKind
  name: string
  icon: string
  target: number | null
  /** Saved before the app tracked it (`startingAmount`). */
  saved: number | null
  monthly: number | null
  /** Empty for no deadline. For a fund, the next date it's needed. */
  deadline: ISODate | ''
  /** A fund's: how its date comes round again. */
  repeat: FundRepeat
  /** A fund for a bill: its amount and dates come from the bill, so the form doesn't ask for them. */
  billId?: ID
}

export type GoalDraftErrors = { name?: string; target?: string; monthly?: string; deadline?: string; form?: string }

/** What the salary leaves for this goal's monthly amount; `null` without a salary. */
export interface GoalRoom {
  room: number | null
  currency: string
}

/** Icons a goal can have, in the order the picker shows them. */
export const GOAL_ICONS = ['target', 'shield', 'laptop', 'smartphone', 'plane', 'house', 'car', 'graduation-cap', 'gift', 'heart-pulse', 'piggy-bank', 'sparkles', 'moon', 'backpack', 'sun', 'receipt']

export function newGoalDraft(kind: GoalKind = 'goal'): GoalDraft {
  return { kind, name: '', icon: kind === 'fund' ? 'piggy-bank' : 'target', target: null, saved: null, monthly: null, deadline: '', repeat: 'yearly' }
}

export function goalToDraft(goal: Goal): GoalDraft {
  return {
    id: goal.id,
    kind: goal.fund ? 'fund' : 'goal',
    name: goal.name,
    icon: goal.icon,
    target: goal.target,
    saved: goal.startingAmount ?? null,
    monthly: goal.monthlyContribution || null,
    deadline: goal.deadline ?? '',
    repeat: goal.fund?.repeat ?? 'yearly',
    billId: goal.fund?.billId,
  }
}

/** Messages for the fields that need fixing; empty when the draft can be saved. */
export function goalDraftErrors(draft: GoalDraft, limit: GoalRoom): GoalDraftErrors {
  const errors: GoalDraftErrors = {}
  if (!draft.name.trim()) errors.name = t.goalForm.nameError
  if (!draft.billId && (!draft.target || draft.target <= 0)) errors.target = t.goalForm.targetError
  if (draft.kind === 'fund' && !draft.billId && !draft.deadline) errors.deadline = t.funds.dateError
  const monthly = goalRoomError(draft.monthly ?? 0, limit.room, limit.currency)
  if (monthly) errors.monthly = monthly
  return errors
}

export function hasErrors(errors: GoalDraftErrors): boolean {
  return Object.values(errors).some(Boolean)
}

export function draftToGoal(draft: GoalDraft, existing?: Goal): Omit<Goal, 'id' | 'createdAt' | 'updatedAt'> {
  const fund = draft.kind === 'fund' ? (draft.billId ? { billId: draft.billId } : { repeat: draft.repeat }) : undefined
  return {
    name: draft.name.trim(),
    icon: draft.icon,
    target: draft.target ?? 0,
    monthlyContribution: draft.monthly ?? 0,
    startingAmount: draft.saved || undefined,
    // A bill's fund takes its dates from the bill.
    deadline: draft.billId ? undefined : draft.deadline || undefined,
    // Always given, so turning a fund back into a goal clears it when the edit is merged.
    fund,
    archived: existing?.archived ?? false,
  }
}

/** A goal record for the live forecast while the form is being filled in. */
export function draftPreview(draft: GoalDraft): Goal {
  return { ...draftToGoal(draft), id: draft.id ?? 'draft', createdAt: '', updatedAt: '' }
}
