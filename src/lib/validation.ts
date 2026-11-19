import type { Account, AppData, Asset, Bill, Category, Debt, Goal, ID, IncomeSource, Profile, QuickItem, Transaction, WishlistItem } from '../types'
import { budgetSummary, monthlyRoomForGoal, type BudgetData } from './budget'
import { isMainCurrency } from './currency'
import { fromISODate, getPayCycle, isShortPay } from './dates'
import { debtOwed, isRepayment, monthlyDebtPayments } from './debts'
import { goalSaved } from './goals'
import { monthlyIncomes } from './income'
import { MAX_TAG_LENGTH, MAX_TAGS } from './tags'
import { t } from '../i18n'
import { live } from './id'
import { formatMoney, roundMoney } from './money'
import { walletBalance } from './wallets'

// Each check returns a message the UI can show as-is (from the i18n file), or null when valid.

// Checks below take a transaction named `t`, which hides the text.
const errorText = t.errors
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDate(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(fromISODate(value).getTime())
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function exists(records: { id: ID; deleted?: boolean }[], id: ID | undefined): boolean {
  return !!id && records.some((r) => !r.deleted && r.id === id)
}

type TransactionFields = Pick<
  Transaction,
  'type' | 'amount' | 'date' | 'accountId' | 'categoryId' | 'toAccountId' | 'goalId' | 'billId' | 'debtId' | 'currency' | 'toCurrency' | 'toAmount' | 'debtAmount' | 'fundAmount' | 'refundOf' | 'tags' | 'quantity'
> & { id?: ID }

export function checkTransaction(
  t: TransactionFields,
  data: Pick<AppData, 'accounts' | 'categories' | 'goals' | 'bills' | 'transactions' | 'debts'> & { profile?: Pick<Profile, 'currency'> },
): string | null {
  const errors = errorText
  const main = data.profile?.currency
  const sameCurrency = (a?: string, b?: string) => (a ?? main) === (b ?? main)
  const walletOf = (id?: ID) => data.accounts.find((a) => a.id === id)
  if (!isPositive(t.amount)) return errors.amount
  if (t.quantity !== undefined && (t.type !== 'expense' || !isPositive(t.quantity))) return errors.quantity
  if (t.tags && t.tags.length > MAX_TAGS) return errors.tooManyTags(MAX_TAGS)
  if (t.tags?.some((tag) => !tag.trim())) return errors.tagName
  if (t.tags?.some((tag) => tag.length > MAX_TAG_LENGTH)) return errors.tagLong(MAX_TAG_LENGTH)
  if (!isValidDate(t.date)) return errors.date
  if (!exists(data.accounts, t.accountId)) return errors.wallet

  if (t.type === 'expense' || t.type === 'refund' || t.type === 'income') {
    const category = live(data.categories).find((c) => c.id === t.categoryId)
    if (!category) return errors.category
    // A refund is money back for something bought, so it's in what it was bought under.
    if (category.kind !== (t.type === 'income' ? 'income' : 'expense')) return t.type === 'income' ? errors.incomeCategory : errors.expenseCategory
  }
  if (t.type === 'refund' && t.refundOf) {
    const bought = live(data.transactions).find((other) => other.id === t.refundOf)
    if (!bought || bought.type !== 'expense') return errors.refundGone
    if (!sameCurrency(walletOf(t.accountId)?.currency, bought.currency)) return errors.refundCurrency
    // When editing, the refund's own earlier amount doesn't count against it.
    const back = roundMoney(live(data.transactions).filter((other) => other.type === 'refund' && other.refundOf === bought.id && other.id !== t.id).reduce((sum, other) => sum + other.amount, 0))
    const left = roundMoney(bought.amount - back)
    if (t.amount > left) return left > 0 ? errors.refundTooMuch(formatMoney(left, bought.currency ?? main)) : errors.refundDone
  }
  if (t.type === 'transfer') {
    if (!exists(data.accounts, t.toAccountId)) return errors.toWallet
    if (t.toAccountId === t.accountId) return errors.sameWallet
    if (!sameCurrency(walletOf(t.accountId)?.currency, walletOf(t.toAccountId)?.currency) && !isPositive(t.toAmount ?? 0)) return errors.toAmount
  }
  if ((t.type === 'goal-deposit' || t.type === 'goal-withdrawal') && !exists(data.goals, t.goalId)) {
    return errors.goal
  }
  if ((t.type === 'goal-deposit' || t.type === 'goal-withdrawal') && !sameCurrency(walletOf(t.accountId)?.currency)) return errors.goalWalletCurrency
  if (t.type === 'goal-deposit') {
    // When editing, the deposit's own earlier amount doesn't count against it.
    const others = data.transactions.filter((other) => other.id !== t.id)
    const goal = data.goals.find((g) => g.id === t.goalId)!
    const missing = roundMoney(goal.target - goalSaved(goal, others))
    if (t.amount > missing) return missing > 0 ? errors.goalNeeds(formatMoney(missing, main)) : errors.goalFull
    // Only money that's there can be put aside: on the day, and without leaving the wallet short later.
    const wallet = walletOf(t.accountId)!
    const holds = Math.min(walletBalance(wallet, others, t.date), walletBalance(wallet, others))
    if (t.amount > holds) return holds > 0 ? errors.walletHolds(formatMoney(holds, main), wallet.name) : errors.walletEmpty(wallet.name)
  }
  if (t.type === 'goal-withdrawal') {
    // When editing, the withdrawal's own earlier amount doesn't count against it.
    const goal = data.goals.find((g) => g.id === t.goalId)!
    const saved = goalSaved(goal, data.transactions.filter((other) => other.id !== t.id))
    if (t.amount > saved) {
      return saved > 0 ? errors.goalHolds(formatMoney(saved, data.profile?.currency)) : errors.goalEmpty
    }
  }
  if (t.type === 'debt-out' || t.type === 'debt-in') {
    const debt = live(data.debts).find((d) => d.id === t.debtId)
    if (!debt) return errors.debtPick
    const crossing = !sameCurrency(walletOf(t.accountId)?.currency, debt.currency)
    if (crossing && !isRepayment(debt, t.type)) return errors.debtGrowCurrency
    if (crossing && !isPositive(t.debtAmount ?? 0)) return errors.debtCleared
    if (isRepayment(debt, t.type)) {
      // When editing, the payment's own earlier amount doesn't count against it.
      const owed = debtOwed(debt, data.transactions.filter((other) => other.id !== t.id))
      if ((crossing ? (t.debtAmount ?? 0) : t.amount) > owed) return owed > 0 ? errors.debtHolds(formatMoney(owed, debt.currency ?? main)) : errors.debtNothingOwed
    }
  }
  if (t.fundAmount !== undefined) {
    if (t.type !== 'expense' || !exists(data.goals, t.goalId)) return errors.fundGone
    if (!isPositive(t.fundAmount) || t.fundAmount > t.amount) return errors.fundAmount
    if (!sameCurrency(walletOf(t.accountId)?.currency)) return errors.goalWalletCurrency
    // When editing, what this expense took from the fund before doesn't count against it.
    const fund = data.goals.find((g) => g.id === t.goalId)!
    const holds = goalSaved(fund, data.transactions.filter((other) => other.id !== t.id))
    if (t.fundAmount > holds) return holds > 0 ? errors.fundHolds(formatMoney(holds, main)) : errors.fundEmpty
  }
  if (t.billId && !exists(data.bills, t.billId)) return errors.billGone
  if (t.billId && !sameCurrency(walletOf(t.accountId)?.currency)) return errors.billWalletCurrency
  return null
}

export function checkBill(b: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>, data: Pick<AppData, 'accounts' | 'categories'> & { profile?: Pick<Profile, 'currency'> }): string | null {
  if (!b.name.trim()) return t.errors.billName
  if (!isPositive(b.amount)) return t.errors.amount
  if (!exists(data.categories, b.categoryId)) return t.errors.category
  if (!exists(data.accounts, b.accountId)) return t.errors.wallet
  if (!isMainCurrency(data.accounts.find((a) => a.id === b.accountId)!, data.profile?.currency)) return t.errors.billWalletCurrency
  const maxDay = b.frequency === 'weekly' ? 6 : 31
  const minDay = b.frequency === 'weekly' ? 0 : 1
  if (!Number.isInteger(b.dueDay) || b.dueDay < minDay || b.dueDay > maxDay) {
    return b.frequency === 'weekly' ? t.errors.weekday : t.errors.dueDay
  }
  if (!isValidDate(b.startDate)) return t.errors.startDate
  return null
}

export function checkGoal(g: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!g.name.trim()) return t.errors.goalName
  if (!isPositive(g.target)) return t.errors.target
  if (!Number.isFinite(g.monthlyContribution) || g.monthlyContribution < 0) return t.errors.monthlyNegative
  if (g.startingAmount !== undefined && (!Number.isFinite(g.startingAmount) || g.startingAmount < 0)) {
    return t.errors.savedNegative
  }
  if (g.deadline && !isValidDate(g.deadline)) return t.errors.deadline
  // A fund that isn't for a bill repeats from a date, so it needs one.
  if (g.fund && !g.fund.billId && !g.deadline) return t.errors.fundDate
  return null
}

/**
 * Putting aside more than the pay cycle has left would leave less than nothing to spend. What a goal
 * already plans for the cycle is taken off the budget anyway, so putting that aside always fits.
 * Checked on top of `checkTransaction`, as it needs the whole budget.
 */
export function checkPutAsideRoom(t: TransactionFields, data: BudgetData): string | null {
  if (t.type !== 'goal-deposit') return null
  const others = data.transactions.filter((other) => other.id !== t.id)
  const cycle = getPayCycle(t.date, data.profile.salary)
  const after = budgetSummary({ ...data, transactions: [...others, { ...t, id: t.id ?? 'new' } as Transaction] }, t.date, cycle)
  if (!after.hasPay || after.leftToSpend >= 0) return null
  const before = budgetSummary({ ...data, transactions: others }, t.date, cycle)
  const cost = roundMoney(before.leftToSpend - after.leftToSpend)
  if (cost <= 0) return null
  // The part the plan had already set aside, plus whatever was left.
  const room = roundMoney(t.amount - cost + Math.max(0, before.leftToSpend))
  return room > 0 ? errorText.putAsideRoom(formatMoney(room, data.profile.currency)) : errorText.putAsideNoRoom
}

/** The message for a monthly amount above `room`, or `null` when it fits. `room` is `null` without a salary, when nothing limits it. */
export function goalRoomError(monthly: number, room: number | null, currency?: string): string | null {
  if (room === null || monthly <= room) return null
  return room > 0 ? t.errors.goalRoom(formatMoney(room, currency)) : t.errors.goalNoRoom
}

/** A goal's monthly amount has to fit what the salary leaves after bills and the other goals. Finished goals are out of the plan. */
export function checkGoalPlan(g: Pick<Goal, 'monthlyContribution' | 'archived' | 'fund'> & { id?: ID }, data: Pick<AppData, 'profile' | 'bills' | 'goals' | 'debts' | 'transactions' | 'incomes'>): string | null {
  if (g.archived || g.monthlyContribution <= 0) return null
  return goalRoomError(g.monthlyContribution, monthlyRoomForGoal(data.profile, data.bills, data.goals, g, monthlyDebtPayments(data.debts, data.transactions, data.profile.currency), monthlyIncomes(data.incomes, data.profile.currency)), data.profile.currency)
}

export function checkWishlistItem(w: Omit<WishlistItem, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!isPositive(w.price)) return t.errors.price
  return null
}

export function checkAccount(a: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!a.name.trim()) return t.errors.walletName
  if (!Number.isFinite(a.startingBalance)) return t.errors.startingBalance
  if (!isValidDate(a.startDate)) return t.errors.startDate
  return null
}

export function checkDebt(d: Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!d.person.trim()) return t.errors.debtPerson
  if (!Number.isFinite(d.startingAmount) || d.startingAmount < 0) return t.errors.debtAmount
  if (!isValidDate(d.date)) return t.errors.date
  if (d.dueDate && !isValidDate(d.dueDate)) return t.errors.date
  if (d.monthlyPayment !== undefined && (!Number.isFinite(d.monthlyPayment) || d.monthlyPayment < 0)) return t.errors.debtMonthly
  if (d.monthlyPayment && (!d.firstPaymentDate || !isValidDate(d.firstPaymentDate))) return t.errors.debtFirstPayment
  if (d.charges?.some((c) => !isPositive(c.amount) || !isValidDate(c.date))) return t.errors.debtAmount
  return null
}

export function checkCategory(c: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!c.name.trim()) return t.errors.categoryName
  if (c.color !== undefined && (!Number.isInteger(c.color) || c.color < 1 || c.color > 8)) return t.errors.categoryColor
  if (c.monthlyBudget !== undefined && (!Number.isFinite(c.monthlyBudget) || c.monthlyBudget < 0)) {
    return t.errors.limitNegative
  }
  return null
}

/**
 * Where a category can sit: under a main spending category (one that isn't under another), never
 * under itself, and not while it has subcategories of its own. `id` is null for a new category.
 */
export function checkCategoryTree(categories: Category[], id: ID | null, parentId: ID | undefined, kind: Category['kind'] = 'expense'): string | null {
  if (!parentId) return null
  const parent = live(categories).find((c) => c.id === parentId)
  if (kind !== 'expense' || !parent || parent.id === id || parent.kind !== 'expense' || parent.parentId) return t.errors.categoryParent
  if (id && live(categories).some((c) => c.parentId === id)) return t.errors.categoryHasSubs
  return null
}

export function checkIncomeSource(s: Omit<IncomeSource, 'id' | 'createdAt' | 'updatedAt'>, data: Pick<AppData, 'accounts' | 'categories'>): string | null {
  if (!s.name.trim()) return t.errors.incomeName
  if (!isPositive(s.amount)) return t.errors.amount
  if (isShortPay(s) ? !s.anchor || !isValidDate(s.anchor) : !Number.isInteger(s.payday) || s.payday < 1 || s.payday > 31) return isShortPay(s) ? t.errors.anchor : t.errors.payday
  if (!isValidDate(s.startDate)) return t.errors.startDate
  if (!exists(data.accounts, s.accountId)) return t.errors.wallet
  if (live(data.categories).find((c) => c.id === s.categoryId)?.kind !== 'income') return t.errors.incomeCategory
  return null
}

export function checkQuickItem(item: Omit<QuickItem, 'id' | 'createdAt' | 'updatedAt'>, data: Pick<AppData, 'accounts' | 'categories'>): string | null {
  if (!item.name.trim()) return t.errors.quickName
  if (!isPositive(item.amount)) return t.errors.amount
  if (item.cycleLimit !== undefined && !isPositive(item.cycleLimit)) return t.errors.quantity
  if (!exists(data.accounts, item.accountId)) return t.errors.wallet
  if (live(data.categories).find((c) => c.id === item.categoryId)?.kind !== 'expense') return t.errors.expenseCategory
  return null
}

const ASSET_KINDS = new Set(['gold', 'property', 'vehicle', 'other'])

export function checkAsset(asset: Pick<Asset, 'name' | 'kind' | 'grams' | 'values' | 'soldAt'>): string | null {
  if (!asset.name.trim()) return errorText.assetName
  if (!ASSET_KINDS.has(asset.kind)) return errorText.assetKind
  if (asset.grams !== undefined && !isPositive(asset.grams)) return errorText.assetGrams
  if (asset.values.length === 0) return errorText.assetValue
  for (const v of asset.values) {
    if (!isValidDate(v.date)) return errorText.date
    if (!Number.isFinite(v.value) || v.value < 0) return errorText.assetValue
    if (v.perGram !== undefined && !isPositive(v.perGram)) return errorText.assetPerGram
  }
  if (new Set(asset.values.map((v) => v.date)).size !== asset.values.length) return errorText.assetSameDay
  if (asset.soldAt !== undefined) {
    if (!isValidDate(asset.soldAt)) return errorText.date
    const first = asset.values.reduce((min, v) => (v.date < min ? v.date : min), asset.values[0].date)
    if (asset.soldAt < first) return errorText.assetSoldBefore
  }
  return null
}

export function checkProfile(p: Profile, data: Pick<AppData, 'accounts'>): string | null {
  const { salary, work } = p
  if (!Number.isFinite(salary.amount) || salary.amount < 0) return t.errors.salaryNegative
  if (!Number.isInteger(salary.payday) || salary.payday < 1 || salary.payday > 31) return t.errors.payday
  if (salary.anchor && !isValidDate(salary.anchor)) return t.errors.anchor
  if (!exists(data.accounts, salary.accountId)) return t.errors.salaryWallet
  if (!isMainCurrency(data.accounts.find((a) => a.id === salary.accountId)!, p.currency)) return t.errors.salaryWalletCurrency
  if (!Number.isFinite(work.hoursPerDay) || work.hoursPerDay < 0 || work.hoursPerDay > 24) return t.errors.hoursPerDay
  if (!Number.isInteger(work.daysPerWeek) || work.daysPerWeek < 0 || work.daysPerWeek > 7) return t.errors.daysPerWeek
  if (!isValidDate(p.startDate)) return t.errors.startDate
  return null
}
