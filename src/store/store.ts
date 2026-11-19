import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import type { Account, AppData, Asset, AssetValue, BaseRecord, Bill, Category, Debt, DebtCharge, DebtRepeat, Goal, ID, IncomeSource, ISODate, Profile, QuickItem, Settings, Transaction, WishlistItem, WishlistStatus } from '../types'
import { t } from '../i18n'
import { paydaysUntil, todayISO } from '../lib/dates'
import { createId, live, nowISO } from '../lib/id'
import { billMonthlyCost } from '../lib/bills'
import { debtMoveType, dueRepeats, findDebtWith, type DueRepeat } from '../lib/debts'
import { fundDueDate, fundForBill } from '../lib/funds'
import { goalForecast, goalSaved, suggestedContribution } from '../lib/goals'
import { startsNewPayPlan, type ExpectedPay } from '../lib/income'
import { formatMoney } from '../lib/money'
import { canTag, hasTag, knownTags, MAX_TAG_LENGTH, normalizeTags, tagKey } from '../lib/tags'
import { checkAccount, checkAsset, checkBill, checkCategory, checkCategoryTree, checkDebt, checkGoal, checkGoalPlan, checkIncomeSource, checkProfile, checkPutAsideRoom, checkQuickItem, checkTransaction, checkWishlistItem } from '../lib/validation'
import { cashCountAdjustment, walletBalance, walletCloseProblem, walletWasUsed, type WalletCloseProblem } from '../lib/wallets'
import { withBuiltInNames } from './builtInNames'
import { ACCOUNT_IDS, CATEGORY_IDS, createInitialData } from './defaults'
import { migrate, NewerDataError, SCHEMA_VERSION, withDefaults } from './migrations'
import { STORAGE_KEY } from './storage'

type Fields<T extends BaseRecord> = Omit<T, keyof BaseRecord>

export type TransactionInput = Omit<Fields<Transaction>, 'date'> & { date?: ISODate }

/** A new asset and what it's worth from the day it starts counting. */
export type AssetInput = Pick<Asset, 'name' | 'kind' | 'currency' | 'grams'> & { value: Omit<AssetValue, 'id'> }

export interface SplitInput {
  /** The purchase being changed; left out for a new one. */
  splitId?: ID
  date: ISODate
  accountId: ID
  note?: string
  /** On every part. */
  tags?: string[]
  /** A part that's already saved keeps its id. */
  parts: { id?: ID; categoryId: ID; amount: number }[]
}

export type DebtInput = Pick<Debt, 'direction' | 'person' | 'date'> &
  Partial<Pick<Debt, 'note' | 'dueDate' | 'monthlyPayment' | 'firstPaymentDate' | 'currency'>> & {
    amount: number
    accountId?: ID
    /** Start something that adds to this debt every month. No money moves. */
    repeats?: boolean
    /** This is another month of a repeating charge already on the debt. No money moves. */
    repeatId?: ID
  }

export interface AppActions {
  updateProfile(patch: Partial<Profile>): void
  /** Puts built-in category and wallet names into the profile's language, unless the user renamed them. */
  localizeBuiltInNames(): void
  updateSettings(patch: Partial<Settings>): void

  /** Throws an Error with a user-facing message if the input is invalid. */
  addTransaction(input: TransactionInput): Transaction
  updateTransaction(id: ID, patch: Partial<Fields<Transaction>>): void
  /** Soft delete, so it can be undone with `restoreTransaction`. */
  deleteTransaction(id: ID): void
  restoreTransaction(id: ID): void
  /**
   * One purchase across several categories: an expense per part, all with one `splitId`. Saving again
   * with the same id changes, adds and removes parts; with one part left it's a plain expense. Returns how to take it back.
   */
  saveSplit(input: SplitInput): { parts: Transaction[]; undo: () => void }
  /** Deletes every part of a split purchase. Returns how to bring them back. */
  deleteSplit(splitId: ID): () => void

  addAccount(input: Fields<Account>): Account
  updateAccount(id: ID, patch: Partial<Fields<Account>>): void
  /**
   * Takes a wallet out of use. Throws if it still holds money or something depends on it.
   * A wallet of your own that was never used is removed instead of being kept as closed.
   */
  closeAccount(id: ID): 'closed' | 'removed'
  /** Brings back a closed or just-removed wallet. */
  reopenAccount(id: ID): void
  /**
   * Compares counted cash with what the app expects. A difference is logged as
   * untracked spending (or extra income) so the wallet matches reality.
   */
  recordCashCount(accountId: ID, counted: number, today?: ISODate): Transaction | null

  addCategory(input: Fields<Category>): Category
  updateCategory(id: ID, patch: Partial<Fields<Category>>): void
  /** Switches categories on or off and sets their limits in one save. A `null` limit removes it. */
  setCategoryBudgets(changes: Record<ID, { enabled?: boolean; monthlyBudget?: number | null }>): void

  /**
   * With `fund`, a fund is started for the bill in the same save (or stopped, with `false`): it's
   * put aside for month by month and pays the bill when it's due. Throws if its monthly amount doesn't fit.
   */
  addBill(input: Fields<Bill>, options?: { fund?: boolean }): Bill
  updateBill(id: ID, patch: Partial<Fields<Bill>>, options?: { fund?: boolean }): void
  deleteBill(id: ID): void
  restoreBill(id: ID): void
  /** Logs the bill's payment as an expense. Amount and wallet default to the bill's. Its fund pays what it can. */
  markBillPaid(billId: ID, options?: { date?: ISODate; accountId?: ID; amount?: number }): Transaction
  /** Puts money aside for several goals or funds at once, from one wallet. Returns how to take it all back. */
  putAside(amounts: { goalId: ID; amount: number }[], accountId: ID, date?: ISODate): () => void

  /** Throws if the monthly amount is more than the salary leaves after bills and the other goals. */
  addGoal(input: Fields<Goal>): Goal
  updateGoal(id: ID, patch: Partial<Fields<Goal>>): void
  /** Entries from a spreadsheet, all in one go: spending, money back and income only. Returns how many, and how to take them all back. */
  importTransactions(entries: TransactionInput[]): { count: number; undo: () => void }

  /** Renames a tag on every entry that has it, joining a tag already called that. Returns how to take it back. */
  renameTag(from: string, to: string): () => void
  /** Takes a tag off every entry. The entries stay. Returns how to take it back. */
  deleteTag(name: string): () => void

  /** Soft delete. Its deposits stay in Activity; undo with `restoreGoal`. */
  deleteGoal(id: ID): void
  restoreGoal(id: ID): void

  /** With `opening`, the money that moved when it started is logged too, in the same save. */
  addDebt(input: Fields<Debt>, opening?: { accountId: ID; amount: number; date: ISODate }): Debt
  /**
   * Money lent or borrowed, from the Debt tab. Adds to the debt with that person if
   * there is one, and starts a new one if not. `accountId` is left out when no money
   * moved through a wallet. `undo` takes back exactly what this did.
   */
  recordDebt(input: DebtInput): { debt: Debt; undo: () => void }
  updateDebt(id: ID, patch: Partial<Fields<Debt>>): void
  /** The person said yes to a month of a repeating charge. Returns how to take it back. */
  approveRepeat(due: Pick<DueRepeat, 'dueDate'> & { debtId: ID; repeatId: ID }): () => void
  /** The person said no to a month: it stops asking about that one. Returns how to take it back. */
  skipRepeat(due: Pick<DueRepeat, 'dueDate'> & { debtId: ID; repeatId: ID }): () => void
  /** Stops asking from now on. Returns how to take it back. */
  stopRepeat(debtId: ID, repeatId: ID, today?: ISODate): () => void
  /** Soft delete. Its entries stay in Activity and in wallet balances; undo with `restoreDebt`. */
  deleteDebt(id: ID): void
  restoreDebt(id: ID): void

  /** Saves a price checked with "Is it worth it?", whatever was decided. */
  addWishlistItem(input: Fields<WishlistItem>): WishlistItem
  /** Bought or skipped, now. A bought item can point to the expense that was logged. */
  decideWishlistItem(id: ID, status: Exclude<WishlistStatus, 'thinking'>, transactionId?: ID): void
  deleteWishlistItem(id: ID): void
  restoreWishlistItem(id: ID): void

  addIncomeSource(input: Fields<IncomeSource>): IncomeSource
  updateIncomeSource(id: ID, patch: Partial<Fields<IncomeSource>>): void
  /** Soft delete. What it paid stays in Activity; undo with `restoreIncomeSource`. */
  deleteIncomeSource(id: ID): void
  restoreIncomeSource(id: ID): void

  addQuickItem(input: Fields<QuickItem>): QuickItem
  updateQuickItem(id: ID, patch: Partial<Fields<QuickItem>>): void
  /** Soft delete. What it logged stays in Activity; undo with `restoreQuickItem`. */
  deleteQuickItem(id: ID): void
  restoreQuickItem(id: ID): void

  addAsset(input: AssetInput): Asset
  /** Anything but its values, which change through `setAssetValue`. `soldAt: undefined` brings it back. Grams are only kept for gold. */
  updateAsset(id: ID, patch: Partial<Pick<Asset, 'name' | 'kind' | 'currency' | 'grams' | 'soldAt'>>): void
  /** What it's worth from `value.date` on, replacing a value on the same day. Returns how to take it back. */
  setAssetValue(id: ID, value: Omit<AssetValue, 'id'>): () => void
  /** Removes one value from its history. The last one can't go: delete the asset instead. */
  deleteAssetValue(id: ID, valueId: ID): void
  /** Soft delete; undo with `restoreAsset`. */
  deleteAsset(id: ID): void
  restoreAsset(id: ID): void

  /** Expected pay arrived, as expected or with the changes given. Returns how to take it back, so it's asked again. */
  confirmPay(pay: ExpectedPay, changes?: { amount?: number; date?: ISODate; accountId?: ID }): () => void
  /** Expected pay isn't coming: it stops being asked and nothing is counted. Returns how to take it back. */
  skipPay(pay: ExpectedPay): () => void

  /**
   * Marks setup as done. The first time, today becomes the start date: salaries
   * are logged automatically for paydays after it.
   */
  finishOnboarding(today?: ISODate): void

  /** Takes in what sync merged. Not a user edit, so nothing is checked or re-stamped. */
  applySynced(data: Omit<AppData, 'deviceId'>): void
  /** Replaces everything, e.g. when restoring a backup. Keeps this device's id, which sync uses to tell devices apart. */
  replaceData(data: AppData): void
  /** Back to a fresh install. Keeps the device id. */
  resetAll(): void
}

export type AppState = AppData & AppActions

/** The saved part of the state, without the actions. */
export function pickData(state: AppData): AppData {
  const { deviceId, profile, settings, accounts, categories, bills, transactions, goals, debts, incomes, quickItems, assets, wishlist } = state
  return { deviceId, profile, settings, accounts, categories, bills, transactions, goals, debts, incomes, quickItems, assets, wishlist }
}

function stamp<T extends object>(fields: T): T & BaseRecord {
  const timestamp = nowISO()
  return { ...fields, id: createId(), createdAt: timestamp, updatedAt: timestamp }
}

type Gone = keyof typeof t.errors.gone

function closeProblemText(problem: WalletCloseProblem, currency: string): string {
  switch (problem.reason) {
    case 'not-empty':
      return t.errors.walletNotEmpty(formatMoney(problem.balance, currency))
    case 'receives-salary':
      return t.errors.walletSalary
    case 'pays-bills':
      return t.errors.walletBills(problem.count)
    case 'receives-income':
      return t.errors.walletIncome(problem.count)
    case 'last-open':
      return t.errors.walletLast
  }
}

const BUILT_IN_WALLETS: readonly ID[] = Object.values(ACCOUNT_IDS)

function findLive<T extends BaseRecord>(records: T[], id: ID, what: Gone): T {
  const record = live(records).find((r) => r.id === id)
  if (!record) throw new Error(t.errors.gone[what])
  return record
}

function replaceById<T extends BaseRecord>(records: T[], next: T): T[] {
  return records.map((r) => (r.id === next.id ? next : r))
}

function assertValid(error: string | null): void {
  if (error) throw new Error(error)
}

export type LoadStatus = 'loading' | 'ready' | 'failed'

/** Why loading failed. Each needs something different from the person, so they're never lumped together. */
export interface LoadFailure {
  reason: 'newer-data' | 'damaged' | 'storage'
  message: string
}

function describeLoadFailure(error: unknown): LoadFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof NewerDataError) return { reason: 'newer-data', message }
  // Reading the saved text as JSON is the one step that throws this.
  if (error instanceof SyntaxError) return { reason: 'damaged', message }
  return { reason: 'storage', message }
}

export function createAppStore(storage: StateStorage) {
  // Zustand only reports hydration when loading succeeds, so failures are
  // tracked here; otherwise the app would show its loading screen forever.
  // Kept out of the store state on purpose: any state change before loading
  // finishes is saved, and would overwrite the data that failed to load.
  let loadFailure: LoadFailure | null = null
  // Saved data is one copy, written whole. A tab holding older data would wipe out what another tab saved,
  // so tabs read it again when told it changed, and don't write back what they've just read.
  let takingInSaved = false
  let lastSaved: string | null = null
  const sharedStorage: StateStorage = {
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    setItem: (name, value) => {
      if (takingInSaved) return
      lastSaved = value
      return storage.setItem(name, value)
    },
  }
  const failureListeners = new Set<() => void>()

  const store = createStore<AppState>()(
    persist(
      (set, get) => {
        /** Merges a patch into a record, validates it, and returns the result. */
        function patched<T extends BaseRecord>(
          records: T[],
          id: ID,
          patch: NoInfer<Partial<T>>,
          what: Gone,
          check: (record: NoInfer<T>) => string | null,
        ): T {
          const next = { ...findLive(records, id, what), ...patch, id, updatedAt: nowISO() }
          assertValid(check(next))
          return next
        }

        /** The main currency is stored as nothing, so changing it later moves every such record along. */
        function storedCurrency(currency: string | undefined): string | undefined {
          return currency === get().profile.currency ? undefined : currency
        }

        /** An entry's currency is always its wallet's. Amounts only needed across currencies are dropped otherwise. */
        function withCurrencies<T extends Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'debtId' | 'toAmount' | 'debtAmount'>>(entry: T, debts: Debt[] = get().debts): T & Pick<Transaction, 'currency' | 'toCurrency'> {
          const walletCurrency = (id?: ID) => storedCurrency(get().accounts.find((a) => a.id === id)?.currency)
          const currency = walletCurrency(entry.accountId)
          const toCurrency = entry.type === 'transfer' ? walletCurrency(entry.toAccountId) : undefined
          const exchange = entry.type === 'transfer' && toCurrency !== currency
          const debt = debts.find((d) => d.id === entry.debtId)
          const crossing = !!debt && storedCurrency(debt.currency) !== currency
          return { ...entry, currency, toCurrency, toAmount: exchange ? entry.toAmount : undefined, debtAmount: crossing ? entry.debtAmount : undefined }
        }

        /** Only an expense is paid from a fund, and then it always says which one and how much. */
        function withFund<T extends Pick<Transaction, 'type' | 'goalId' | 'fundAmount'>>(entry: T): T {
          if (entry.type === 'goal-deposit' || entry.type === 'goal-withdrawal') return { ...entry, fundAmount: undefined }
          if (entry.type === 'expense' && entry.fundAmount) return entry
          return { ...entry, goalId: undefined, fundAmount: undefined }
        }

        /** What only some kinds of entry carry: a fund on an expense, a split on an expense, what a refund is for. */
        function tidy<T extends Pick<Transaction, 'type' | 'goalId' | 'fundAmount' | 'splitId' | 'refundOf' | 'tags'>>(entry: T): T {
          const next = withFund(entry)
          // A tag typed again in another case joins the one there is.
          const tags = canTag(next.type) && next.tags?.length ? normalizeTags(next.tags, knownTags(get().transactions)) : undefined
          return { ...next, splitId: next.type === 'expense' ? next.splitId : undefined, refundOf: next.type === 'refund' ? next.refundOf : undefined, tags }
        }

        /** Puts entries back as they were, for Undo. */
        function restoreEntries(versions: Transaction[]): void {
          const back = new Map(versions.map((tx) => [tx.id, { ...tx, updatedAt: nowISO() }]))
          set((s) => ({ transactions: s.transactions.map((tx) => back.get(tx.id) ?? tx) }))
        }

        /** Changes one tag on every entry that has it. */
        function retag(from: string, change: (tags: string[]) => string[]): () => void {
          const before = live(get().transactions).filter((tx) => hasTag(tx, from))
          const changed = new Map(
            before.map((tx) => {
              const tags = change(tx.tags ?? [])
              return [tx.id, { ...tx, tags: tags.length > 0 ? tags : undefined, updatedAt: nowISO() }]
            }),
          )
          set((s) => ({ transactions: s.transactions.map((tx) => changed.get(tx.id) ?? tx) }))
          return () => restoreEntries(before)
        }

        /** Every entry the user logs: valid on its own, and money put aside has to fit the pay cycle. */
        function checkEntry(entry: Parameters<typeof checkTransaction>[0], state: AppState = get()): string | null {
          return checkTransaction(entry, state) ?? checkPutAsideRoom(entry, state)
        }

        function addTransaction(input: TransactionInput): Transaction {
          const transaction = tidy(withCurrencies(stamp({ ...input, date: input.date ?? todayISO() })))
          assertValid(checkEntry(transaction))
          set((s) => ({ transactions: [...s.transactions, transaction] }))
          return transaction
        }

        function addDebt(input: Fields<Debt>, opening?: { accountId: ID; amount: number; date: ISODate }): Debt {
          const debt = stamp({ ...input, person: input.person.trim(), currency: storedCurrency(input.currency) })
          assertValid(checkDebt(debt))
          if (!opening && debt.startingAmount <= 0 && !debt.charges?.length) throw new Error(t.errors.debtAmount)
          const state = get()
          const transaction = opening
            ? withCurrencies(stamp({ type: input.direction === 'lent' ? ('debt-out' as const) : ('debt-in' as const), debtId: debt.id, ...opening }), [...state.debts, debt])
            : undefined
          if (transaction) assertValid(checkTransaction(transaction, { ...state, debts: [...state.debts, debt] }))
          set((s) => ({ debts: [...s.debts, debt], transactions: transaction ? [...s.transactions, transaction] : s.transactions }))
          return debt
        }

        function updateDebt(id: ID, patch: Partial<Fields<Debt>>): void {
          const next = patched(get().debts, id, patch, 'debt', checkDebt)
          next.currency = storedCurrency(next.currency)
          set((s) => ({ debts: replaceById(s.debts, next) }))
        }

        function repeatOf(debtId: ID, repeatId: ID): { debt: Debt; repeat: DebtRepeat } {
          const debt = findLive(get().debts, debtId, 'debt')
          const repeat = debt.repeats?.find((r) => r.id === repeatId)
          if (!repeat) throw new Error(t.errors.gone.item)
          return { debt, repeat }
        }

        function softDelete<K extends 'transactions' | 'bills' | 'goals' | 'debts' | 'incomes' | 'quickItems' | 'assets' | 'wishlist'>(key: K, id: ID, deleted: boolean): void {
          set((s) => {
            const records = s[key] as BaseRecord[]
            const current = records.find((r) => r.id === id)
            if (!current) throw new Error(t.errors.gone.item)
            return { [key]: replaceById(records, { ...current, deleted, updatedAt: nowISO() }) } as Partial<AppState>
          })
        }

        /**
         * The goals once a bill is saved: its fund started, stopped or kept at the bill's amount. With
         * `want` left out, only the amount follows the bill. A new fund plans enough to be ready by the
         * next due date, or the bill's monthly cost when that much doesn't fit.
         */
        function billFundGoals(bill: Bill, bills: Bill[], want: boolean | undefined): Goal[] {
          const state = get()
          const fund = live(state.goals).find((g) => g.fund?.billId === bill.id)
          const keep = want ?? (fund ? !fund.archived : false)
          if (!keep) return fund && !fund.archived ? replaceById(state.goals, { ...fund, archived: true, updatedAt: nowISO() }) : state.goals
          if (fund) {
            if (!fund.archived && fund.target === bill.amount) return state.goals
            const next = { ...fund, target: bill.amount, archived: false, updatedAt: nowISO() }
            if (fund.archived) assertValid(checkGoalPlan(next, { ...state, bills }))
            return replaceById(state.goals, next)
          }
          const today = todayISO()
          const { salary } = state.profile
          const draft = { name: bill.name, icon: 'receipt', target: bill.amount, monthlyContribution: 0, fund: { billId: bill.id }, archived: false }
          const due = fundDueDate(draft, today, { bills, transactions: state.transactions, salary })
          // Due before two more paydays, there's no catching up: this time is paid as a bill, and the fund starts on the next.
          const catchUp = due && paydaysUntil(today, due, salary) >= 2
          // This month counts too: Home asks for its share straight away.
          const needed = catchUp ? goalForecast({ ...draft, id: 'new', createdAt: '', updatedAt: '', deadline: due }, 0, today, salary, 1).neededPerMonth : null
          const steady = suggestedContribution(billMonthlyCost(bill))
          const plan = { ...state, bills }
          const ready = needed !== null ? suggestedContribution(needed) : null
          const monthlyContribution = ready !== null && ready > steady && !checkGoalPlan({ ...draft, monthlyContribution: ready }, plan) ? ready : steady
          const goal = stamp({ ...draft, monthlyContribution })
          assertValid(checkGoal(goal))
          assertValid(checkGoalPlan(goal, plan))
          return [...state.goals, goal]
        }

        /** One answer per payday on every device: the record's id comes from the payday. */
        function answerPay(pay: ExpectedPay, fields: Partial<Transaction>): () => void {
          const before = get().transactions.find((tx) => tx.id === pay.id)
          const answer: Transaction = {
            ...stamp({
              type: 'income' as const,
              amount: pay.amount,
              date: pay.payDate,
              accountId: pay.accountId,
              categoryId: pay.categoryId,
              note: pay.name ?? t.seeds.categories[CATEGORY_IDS.salary],
              ...(pay.sourceId ? { incomeId: pay.sourceId } : { source: 'salary' as const }),
              ...fields,
            }),
            id: pay.id,
          }
          const next = withCurrencies(answer)
          if (!next.deleted) assertValid(checkTransaction(next, get()))
          set((s) => ({ transactions: before ? replaceById(s.transactions, next) : [...s.transactions, next] }))
          return () => set((s) => ({ transactions: replaceById(s.transactions, { ...next, deleted: true, reasked: true, updatedAt: nowISO() }) }))
        }

        return {
          ...createInitialData(),

          updateProfile(patch) {
            const before = get().profile
            const profile = { ...before, ...patch, updatedAt: nowISO() }
            // During setup there's nothing before the first plan to leave out.
            if (before.onboardingCompleted && startsNewPayPlan(before.salary, profile.salary)) profile.salary = { ...profile.salary, since: todayISO() }
            assertValid(checkProfile(profile, get()))
            set({ profile })
          },

          updateSettings(patch) {
            set((s) => ({ settings: { ...s.settings, ...patch, updatedAt: nowISO() } }))
          },

          addTransaction,

          updateTransaction(id, patch) {
            const next = tidy(withCurrencies(patched(get().transactions, id, patch, 'transaction', (t) => checkEntry(tidy(withCurrencies(t))))))
            set((s) => ({ transactions: replaceById(s.transactions, next) }))
          },

          deleteTransaction: (id) => softDelete('transactions', id, true),
          restoreTransaction: (id) => softDelete('transactions', id, false),

          importTransactions(entries) {
            const state = get()
            const added = entries.map((input) => {
              if (input.type !== 'expense' && input.type !== 'income' && input.type !== 'refund') throw new Error(t.errors.amount)
              const entry = tidy(withCurrencies(stamp({ ...input, date: input.date ?? todayISO() })))
              assertValid(checkTransaction(entry, state))
              return entry
            })
            set((s) => ({ transactions: [...s.transactions, ...added] }))
            const ids = new Set(added.map((tx) => tx.id))
            return {
              count: added.length,
              undo: () => set((s) => ({ transactions: s.transactions.map((tx) => (ids.has(tx.id) ? { ...tx, deleted: true, updatedAt: nowISO() } : tx)) })),
            }
          },

          renameTag(from, to) {
            const [name] = normalizeTags([to], knownTags(get().transactions).filter((tag) => tagKey(tag) !== tagKey(from))) ?? []
            if (!name) throw new Error(t.errors.tagName)
            if (name.length > MAX_TAG_LENGTH) throw new Error(t.errors.tagLong(MAX_TAG_LENGTH))
            return retag(from, (tags) => normalizeTags(tags.map((tag) => (tagKey(tag) === tagKey(from) ? name : tag)), [name]) ?? [])
          },

          deleteTag(name) {
            return retag(name, (tags) => tags.filter((tag) => tagKey(tag) !== tagKey(name)))
          },

          saveSplit({ splitId, date, accountId, note, tags, parts }) {
            const state = get()
            if (parts.length === 0) throw new Error(t.errors.amount)
            // One part left is a plain expense again.
            const id = parts.length > 1 ? (splitId ?? createId()) : undefined
            const before = live(state.transactions).filter((tx) => (splitId !== undefined && tx.splitId === splitId) || parts.some((p) => p.id === tx.id))
            const saved: Transaction[] = parts.map((part) => {
              const existing = before.find((b) => b.id === part.id)
              const fields = { type: 'expense' as const, amount: part.amount, date, accountId, categoryId: part.categoryId, note, tags, splitId: id }
              // A part keeps what made sense for the whole purchase only: no bill or fund across a split.
              const entry = existing ? { ...existing, ...fields, billId: undefined, goalId: undefined, fundAmount: undefined, updatedAt: nowISO() } : stamp(fields)
              return tidy(withCurrencies(entry))
            })
            const removed = before.filter((b) => !saved.some((s) => s.id === b.id)).map((b) => ({ ...b, deleted: true, updatedAt: nowISO() }))
            const changed = new Map([...saved, ...removed].map((tx) => [tx.id, tx]))
            const after = [...state.transactions.map((tx) => changed.get(tx.id) ?? tx), ...saved.filter((s) => !state.transactions.some((tx) => tx.id === s.id))]
            for (const part of saved) assertValid(checkEntry(part, { ...state, transactions: after }))
            set({ transactions: after })
            const created = new Set(saved.filter((s) => !before.some((b) => b.id === s.id)).map((s) => s.id))
            const undo = () =>
              set((s) => ({
                transactions: s.transactions.map((tx) => {
                  const old = before.find((b) => b.id === tx.id)
                  if (old) return { ...old, updatedAt: nowISO() }
                  return created.has(tx.id) ? { ...tx, deleted: true, updatedAt: nowISO() } : tx
                }),
              }))
            return { parts: saved, undo }
          },

          deleteSplit(splitId) {
            const parts = live(get().transactions).filter((tx) => tx.splitId === splitId)
            for (const part of parts) softDelete('transactions', part.id, true)
            return () => parts.forEach((part) => softDelete('transactions', part.id, false))
          },

          addAccount(input) {
            assertValid(checkAccount(input))
            const account = stamp({ ...input, currency: storedCurrency(input.currency) })
            set((s) => ({ accounts: [...s.accounts, account] }))
            return account
          },

          updateAccount(id, patch) {
            const next = patched(get().accounts, id, patch, 'wallet', checkAccount)
            next.currency = storedCurrency(next.currency)
            const current = get().accounts.find((a) => a.id === id)
            // Entries are amounts in the wallet's currency: changing it would change what they mean.
            if (current && storedCurrency(current.currency) !== next.currency && get().transactions.some((t) => t.accountId === id || t.toAccountId === id)) {
              throw new Error(t.errors.walletCurrencyLocked)
            }
            set((s) => ({ accounts: replaceById(s.accounts, next) }))
          },

          closeAccount(id) {
            const state = get()
            const account = findLive(state.accounts, id, 'wallet')
            const problem = walletCloseProblem(account, state)
            if (problem) throw new Error(closeProblemText(problem, account.currency ?? state.profile.currency))
            // Built-in wallets stay around as closed: new devices create them again, under the same id.
            const remove = !BUILT_IN_WALLETS.includes(id) && !walletWasUsed(account, state)
            set((s) => ({ accounts: replaceById(s.accounts, { ...account, archived: true, deleted: remove || undefined, updatedAt: nowISO() }) }))
            return remove ? 'removed' : 'closed'
          },

          reopenAccount(id) {
            const account = get().accounts.find((a) => a.id === id)
            if (!account) throw new Error(t.errors.gone.wallet)
            set((s) => ({ accounts: replaceById(s.accounts, { ...account, archived: false, deleted: undefined, updatedAt: nowISO() }) }))
          },

          recordCashCount(accountId, counted, today = todayISO()) {
            if (!Number.isFinite(counted) || counted < 0) throw new Error(t.errors.cashCounted)
            const account = findLive(get().accounts, accountId, 'wallet')
            const adjustment = cashCountAdjustment(walletBalance(account, get().transactions, today), counted)
            const transaction = adjustment
              ? addTransaction({
                  ...adjustment,
                  date: today,
                  accountId,
                  categoryId: adjustment.type === 'expense' ? CATEGORY_IDS.untracked : CATEGORY_IDS.otherIncome,
                  source: 'cash-count',
                })
              : null
            set((s) => ({ accounts: replaceById(s.accounts, { ...account, lastCountedAt: nowISO(), updatedAt: nowISO() }) }))
            return transaction
          },

          addCategory(input) {
            assertValid(checkCategory(input))
            assertValid(checkCategoryTree(get().categories, null, input.parentId, input.kind))
            const category = stamp(input)
            set((s) => ({ categories: [...s.categories, category] }))
            return category
          },

          updateCategory(id, patch) {
            if ('parentId' in patch) assertValid(checkCategoryTree(get().categories, id, patch.parentId, get().categories.find((c) => c.id === id)?.kind))
            const next = patched(get().categories, id, patch, 'category', checkCategory)
            // Out from under a main category: `parentId` goes, rather than staying as undefined.
            if ('parentId' in patch && !patch.parentId) delete next.parentId
            set((s) => ({ categories: replaceById(s.categories, next) }))
          },

          setCategoryBudgets(changes) {
            const categories = get().categories.map((category) => {
              const change = changes[category.id]
              if (!change) return category
              const next: Category = { ...category, updatedAt: nowISO() }
              if (change.enabled !== undefined) next.enabled = change.enabled
              if (change.monthlyBudget === null) delete next.monthlyBudget
              else if (change.monthlyBudget !== undefined) next.monthlyBudget = change.monthlyBudget
              assertValid(checkCategory(next))
              return next
            })
            set({ categories })
          },

          addBill(input, options = {}) {
            assertValid(checkBill(input, get()))
            const bill = stamp(input)
            const goals = billFundGoals(bill, [...get().bills, bill], options.fund)
            set((s) => ({ bills: [...s.bills, bill], goals }))
            return bill
          },

          updateBill(id, patch, options = {}) {
            const next = patched(get().bills, id, patch, 'bill', (b) => checkBill(b, get()))
            const goals = billFundGoals(next, replaceById(get().bills, next), options.fund)
            set((s) => ({ bills: replaceById(s.bills, next), goals }))
          },

          deleteBill: (id) => softDelete('bills', id, true),
          restoreBill: (id) => softDelete('bills', id, false),

          markBillPaid(billId, options = {}) {
            const state = get()
            const bill = findLive(state.bills, billId, 'bill')
            const amount = options.amount ?? bill.amount
            const fund = fundForBill(state.goals, billId)
            const fundAmount = fund ? Math.min(amount, Math.max(0, goalSaved(fund, state.transactions))) : 0
            return addTransaction({
              type: 'expense',
              amount,
              date: options.date,
              accountId: options.accountId ?? bill.accountId,
              categoryId: bill.categoryId,
              billId,
              note: bill.name,
              ...(fund && fundAmount > 0 && { goalId: fund.id, fundAmount }),
            })
          },

          putAside(amounts, accountId, date = todayISO()) {
            const state = get()
            const entries = amounts
              .filter((a) => a.amount > 0)
              .map((a) => withCurrencies(stamp({ type: 'goal-deposit' as const, amount: a.amount, goalId: a.goalId, accountId, date })))
            // Each one counts the ones before it, so together they still fit the wallet and the pay cycle.
            entries.reduce((before, entry) => {
              assertValid(checkEntry(entry, before))
              return { ...before, transactions: [...before.transactions, entry] }
            }, state)
            set((s) => ({ transactions: [...s.transactions, ...entries] }))
            return () => entries.forEach((entry) => softDelete('transactions', entry.id, true))
          },

          addGoal(input) {
            assertValid(checkGoal(input))
            assertValid(checkGoalPlan(input, get()))
            const goal = stamp(input)
            set((s) => ({ goals: [...s.goals, goal] }))
            return goal
          },

          updateGoal(id, patch) {
            const next = patched(get().goals, id, patch, 'goal', checkGoal)
            assertValid(checkGoalPlan(next, get()))
            set((s) => ({ goals: replaceById(s.goals, next) }))
          },

          deleteGoal: (id) => softDelete('goals', id, true),
          restoreGoal: (id) => softDelete('goals', id, false),

          addDebt,
          updateDebt,

          recordDebt({ direction, person, date, note, dueDate, monthlyPayment, firstPaymentDate, amount, accountId: walletId, currency: chosen, repeats, repeatId }) {
            if (!Number.isFinite(amount) || amount <= 0) throw new Error(t.errors.debtAmount)
            const plan = { ...(dueDate && { dueDate }), ...(monthlyPayment && { monthlyPayment, firstPaymentDate }) }
            // A repeating charge is on someone else's card, so no money moves here.
            const accountId = repeats || repeatId ? undefined : walletId
            // Money through a wallet is in that wallet's currency.
            const currency = storedCurrency(accountId ? get().accounts.find((a) => a.id === accountId)?.currency : chosen)
            const existing = findDebtWith(get().debts, person, direction, currency)
            const newRepeat: DebtRepeat | undefined = repeats ? { id: createId(), name: note?.trim() || person.trim(), amount, startDate: date } : undefined
            // Another month of something repeating answers the oldest month still waiting, if there is one.
            const earlier = repeatId ? existing?.repeats?.find((r) => r.id === repeatId) : undefined
            const waiting = earlier && existing ? dueRepeats([existing], date).find((d) => d.repeat.id === earlier.id)?.dueDate : undefined
            const charge: DebtCharge | undefined = accountId
              ? undefined
              : { id: createId(), date, amount, note, ...(newRepeat && { repeatId: newRepeat.id, dueDate: date }), ...(earlier && { repeatId: earlier.id, dueDate: waiting }) }

            if (!existing) {
              const debt = addDebt(
                {
                  direction,
                  person,
                  date,
                  // What repeats is named on its own lines: one debt can hold several subscriptions.
                  note: newRepeat ? undefined : note,
                  currency,
                  // One amount with no history yet reads as what was already owed; something repeating keeps its months.
                  startingAmount: accountId || newRepeat ? 0 : amount,
                  archived: false,
                  ...plan,
                  ...(newRepeat && charge && { charges: [charge], repeats: [newRepeat] }),
                },
                accountId ? { accountId, amount, date } : undefined,
              )
              // Only what this save did: a payment logged since stays, like any entry of a deleted debt.
              const opening = get().transactions.find((tx) => tx.debtId === debt.id)
              const undo = () => {
                if (opening) softDelete('transactions', opening.id, true)
                softDelete('debts', debt.id, true)
              }
              return { debt, undo }
            }

            const before = { dueDate: existing.dueDate, monthlyPayment: existing.monthlyPayment, firstPaymentDate: existing.firstPaymentDate, charges: existing.charges, repeats: existing.repeats }
            updateDebt(existing.id, {
              ...plan,
              ...(charge && { charges: [...(existing.charges ?? []), charge] }),
              ...(newRepeat && { repeats: [...(existing.repeats ?? []), newRepeat] }),
            })
            const entry = accountId ? addTransaction({ type: debtMoveType(existing, false), amount, date, accountId, debtId: existing.id, note }) : undefined
            const undo = () => {
              if (entry) softDelete('transactions', entry.id, true)
              updateDebt(existing.id, before)
            }
            return { debt: existing, undo }
          },

          deleteDebt: (id) => softDelete('debts', id, true),
          restoreDebt: (id) => softDelete('debts', id, false),

          approveRepeat({ debtId, repeatId, dueDate }) {
            const { debt, repeat } = repeatOf(debtId, repeatId)
            const before = debt.charges
            const charge: DebtCharge = { id: createId(), date: dueDate, amount: repeat.amount, note: repeat.name, repeatId, dueDate }
            updateDebt(debtId, { charges: [...(before ?? []), charge] })
            return () => updateDebt(debtId, { charges: before })
          },

          skipRepeat({ debtId, repeatId, dueDate }) {
            const { debt, repeat } = repeatOf(debtId, repeatId)
            const before = debt.repeats
            updateDebt(debtId, { repeats: debt.repeats?.map((r) => (r.id === repeat.id ? { ...r, skipped: [...(r.skipped ?? []), dueDate] } : r)) })
            return () => updateDebt(debtId, { repeats: before })
          },

          stopRepeat(debtId, repeatId, today = todayISO()) {
            const { debt, repeat } = repeatOf(debtId, repeatId)
            const before = debt.repeats
            updateDebt(debtId, { repeats: debt.repeats?.map((r) => (r.id === repeat.id ? { ...r, stoppedAt: today } : r)) })
            return () => updateDebt(debtId, { repeats: before })
          },

          addWishlistItem(input) {
            const item = stamp({ ...input, name: input.name.trim() })
            assertValid(checkWishlistItem(item))
            set((s) => ({ wishlist: [...s.wishlist, item] }))
            return item
          },

          decideWishlistItem(id, status, transactionId) {
            const next = patched(get().wishlist, id, { status, decidedAt: nowISO(), transactionId }, 'wishlist', checkWishlistItem)
            set((s) => ({ wishlist: replaceById(s.wishlist, next) }))
          },

          deleteWishlistItem: (id) => softDelete('wishlist', id, true),
          restoreWishlistItem: (id) => softDelete('wishlist', id, false),

          addIncomeSource(input) {
            const source = stamp({ ...input, name: input.name.trim() })
            assertValid(checkIncomeSource(source, get()))
            const currency = storedCurrency(get().accounts.find((a) => a.id === source.accountId)?.currency)
            set((s) => ({ incomes: [...s.incomes, { ...source, currency }] }))
            return { ...source, currency }
          },

          updateIncomeSource(id, patch) {
            const before = findLive(get().incomes, id, 'income')
            const next = patched(get().incomes, id, patch, 'income', (s) => checkIncomeSource(s, get()))
            next.name = next.name.trim()
            // The answers so far belong to the old paydays: the new ones start from here, or the old ones would all be asked again.
            if (before.frequency !== next.frequency || before.payday !== next.payday || before.anchor !== next.anchor) next.startDate = todayISO()
            next.currency = storedCurrency(get().accounts.find((a) => a.id === next.accountId)?.currency)
            set((s) => ({ incomes: replaceById(s.incomes, next) }))
          },

          deleteIncomeSource: (id) => softDelete('incomes', id, true),
          restoreIncomeSource: (id) => softDelete('incomes', id, false),

          addQuickItem(input) {
            const item = stamp({ ...input, name: input.name.trim() })
            assertValid(checkQuickItem(item, get()))
            const currency = storedCurrency(get().accounts.find((a) => a.id === item.accountId)?.currency)
            set((s) => ({ quickItems: [...s.quickItems, { ...item, currency }] }))
            return { ...item, currency }
          },

          updateQuickItem(id, patch) {
            const next = patched(get().quickItems, id, { ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }) }, 'item', (item) => checkQuickItem(item, get()))
            const currency = storedCurrency(get().accounts.find((a) => a.id === next.accountId)?.currency)
            set((s) => ({ quickItems: replaceById(s.quickItems, { ...next, currency }) }))
          },

          deleteQuickItem: (id) => softDelete('quickItems', id, true),
          restoreQuickItem: (id) => softDelete('quickItems', id, false),

          addAsset({ value, ...input }) {
            const asset = stamp({ ...input, name: input.name.trim(), currency: storedCurrency(input.currency), grams: input.kind === 'gold' ? input.grams : undefined, values: [{ ...value, id: createId() }] })
            assertValid(checkAsset(asset))
            set((s) => ({ assets: [...s.assets, asset] }))
            return asset
          },

          updateAsset(id, patch) {
            const next = patched(get().assets, id, { ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }) }, 'item', checkAsset)
            next.currency = storedCurrency(next.currency)
            if (next.kind !== 'gold') next.grams = undefined
            set((s) => ({ assets: replaceById(s.assets, next) }))
          },

          setAssetValue(id, value) {
            const before = findLive(get().assets, id, 'item')
            const values = [...before.values.filter((v) => v.date !== value.date), { ...value, id: createId() }].sort((a, b) => a.date.localeCompare(b.date))
            const next = { ...before, values, updatedAt: nowISO() }
            assertValid(checkAsset(next))
            set((s) => ({ assets: replaceById(s.assets, next) }))
            return () => {
              const now = live(get().assets).find((a) => a.id === id)
              if (now) set((s) => ({ assets: replaceById(s.assets, { ...now, values: before.values, updatedAt: nowISO() }) }))
            }
          },

          deleteAssetValue(id, valueId) {
            const asset = findLive(get().assets, id, 'item')
            const values = asset.values.filter((v) => v.id !== valueId)
            if (values.length === 0) throw new Error(t.errors.assetLastValue)
            const next = { ...asset, values, updatedAt: nowISO() }
            assertValid(checkAsset(next))
            set((s) => ({ assets: replaceById(s.assets, next) }))
          },

          deleteAsset: (id) => softDelete('assets', id, true),
          restoreAsset: (id) => softDelete('assets', id, false),

          confirmPay(pay, changes = {}) {
            return answerPay(pay, { ...(changes.amount !== undefined && { amount: changes.amount }), ...(changes.date && { date: changes.date }), ...(changes.accountId && { accountId: changes.accountId }) })
          },

          skipPay(pay) {
            return answerPay(pay, { deleted: true })
          },

          finishOnboarding(today = todayISO()) {
            const { profile } = get()
            set({ profile: { ...profile, onboardingCompleted: true, startDate: profile.onboardingCompleted ? profile.startDate : today, updatedAt: nowISO() } })
          },

          localizeBuiltInNames() {
            const { categories, accounts, profile } = get()
            const nextCategories = withBuiltInNames(categories, 'categories', profile.language)
            const nextAccounts = withBuiltInNames(accounts, 'accounts', profile.language)
            if (nextCategories !== categories || nextAccounts !== accounts) set({ categories: nextCategories, accounts: nextAccounts })
          },

          applySynced(data) {
            set(data)
          },

          replaceData(data) {
            set({ ...pickData(data), deviceId: get().deviceId })
          },

          resetAll() {
            set({ ...createInitialData(), deviceId: get().deviceId })
          },
        }
      },
      {
        name: STORAGE_KEY,
        version: SCHEMA_VERSION,
        storage: createJSONStorage(() => sharedStorage),
        partialize: (state) => pickData(state),
        migrate,
        merge: (saved, current) => ({ ...current, ...withDefaults(saved) }),
        onRehydrateStorage: () => (_state, error) => {
          if (!error) return
          loadFailure = describeLoadFailure(error)
          console.error('Saved data could not be loaded.', error)
          failureListeners.forEach((listener) => listener())
        },
      },
    ),
  )

  return Object.assign(store, {
    loadStatus: (): LoadStatus => (store.persist.hasHydrated() ? 'ready' : loadFailure ? 'failed' : 'loading'),
    /**
     * Takes in what another tab saved. Data from a newer version is left alone: that tab's
     * version will be here at the next reload, and overwriting it would lose data.
     */
    async takeInSaved(): Promise<void> {
      if (!store.persist.hasHydrated()) return
      const text = await storage.getItem(STORAGE_KEY)
      if (typeof text !== 'string' || text === lastSaved) return
      const saved = JSON.parse(text) as { state: unknown; version: number }
      if (saved.version > SCHEMA_VERSION) return
      lastSaved = text
      takingInSaved = true
      try {
        store.setState({ ...pickData(migrate(saved.state, saved.version)), deviceId: store.getState().deviceId })
      } finally {
        takingInSaved = false
      }
    },
    /** Why the status is `failed`. */
    loadFailure: (): LoadFailure | null => loadFailure,
    /** Calls `listener` when loading finishes or fails. */
    subscribeLoadStatus(listener: () => void): () => void {
      failureListeners.add(listener)
      const unsubscribe = store.persist.onFinishHydration(listener)
      return () => {
        failureListeners.delete(listener)
        unsubscribe()
      }
    },
  })
}

export type AppStore = ReturnType<typeof createAppStore>

/** Resolves once saved data has loaded, rejects if it can't be. Nothing should write to the store before that. */
export function whenHydrated(store: AppStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = () => {
      const status = store.loadStatus()
      if (status === 'loading') return
      unsubscribe()
      if (status === 'ready') resolve()
      else reject(new Error('Saved data could not be loaded.'))
    }
    const unsubscribe = store.subscribeLoadStatus(settle)
    settle()
  })
}
