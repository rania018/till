import type { Language } from '../i18n/language'

/** Calendar date in the user's local time, `YYYY-MM-DD`. */
export type ISODate = string
/** A moment in time, full ISO 8601 string (UTC). */
export type ISODateTime = string
export type ID = string

/**
 * Fields every stored record has. `updatedAt` and `deleted` (soft delete) let
 * sync merge records with "last write wins" (src/sync/records.ts).
 */
export interface BaseRecord {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deleted?: boolean
}

/** `irregular`: no fixed paydays, for freelance work or no salary. Budget months still start on `payday`. */
export type PayFrequency = 'monthly' | 'biweekly' | 'weekly' | 'irregular'

export interface Salary {
  /** Take-home pay per pay period. With `irregular`: a monthly estimate, or 0 to budget only from what's received. */
  amount: number
  frequency: PayFrequency
  /**
   * Day of the month the salary arrives (1–31). The budget month runs from this
   * day to the day before the next payday. Not used for weekly and biweekly pay.
   */
  payday: number
  /**
   * Weekly and biweekly pay: any one payday. Pay cycles repeat from it, every 7 or 14 days.
   * Data saved before these cycles existed has none, and stays on calendar months until it's set.
   */
  anchor?: ISODate
  /** Wallet the salary lands in. */
  accountId: ID
  /** The day this schedule was chosen, when that came after setup. Paydays before it were under another schedule, so they aren't asked about. */
  since?: ISODate
}

/** What decides when pay arrives. */
export type PaySchedule = Pick<Salary, 'frequency' | 'payday' | 'anchor'>

export interface WorkSchedule {
  hoursPerDay: number
  daysPerWeek: number
}

export interface Profile {
  name?: string
  /** ISO 4217 code; `DZD` is shown as "DA". */
  currency: string
  language: Language
  salary: Salary
  work: WorkSchedule
  /** "Is it worth it?" divides by net salary, or by what's left after bills. */
  hourlyRateBasis: 'net-salary' | 'after-bills'
  /** Day the app was set up. Salaries are recorded automatically for paydays after it. */
  startDate: ISODate
  onboardingCompleted: boolean
  /** When it was last changed, for sync. Absent until the first change. */
  updatedAt?: ISODateTime
}

export type AccountKind = 'cash' | 'bank'

/** A wallet: cash on hand or a bank card. */
export interface Account extends BaseRecord {
  name: string
  kind: AccountKind
  /** ISO 4217 code. Left out means the main currency (`profile.currency`). */
  currency?: string
  /** Money in this wallet on `startDate`, before any logged transaction. */
  startingBalance: number
  startDate: ISODate
  lastCountedAt?: ISODateTime
  archived: boolean
}

export type CategoryKind = 'expense' | 'income'

export interface Category extends BaseRecord {
  name: string
  /** Lucide icon name, e.g. `shopping-cart`. */
  icon: string
  kind: CategoryKind
  /** Spending limit per pay cycle. No limit when absent. */
  monthlyBudget?: number
  /** Optional categories (like Pets) start switched off. */
  optional: boolean
  enabled: boolean
  /** Used by the app itself (e.g. untracked cash) and hidden from pickers. */
  system: boolean
  archived: boolean
  order: number
  /** The main category this one sits under: spending only, one level deep. None means it is a main category. */
  parentId?: ID
  /** A main category's colour: its slot in the pastel palette, 1 to 8. None shows the neutral one. */
  color?: number
}

export type BillFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/** A fixed, recurring expense such as rent or internet. */
export interface Bill extends BaseRecord {
  name: string
  amount: number
  categoryId: ID
  /** Wallet it's usually paid from. */
  accountId: ID
  frequency: BillFrequency
  /** Day of the month it's due (1–31), or the weekday (0 = Sunday … 6 = Saturday) for weekly bills. */
  dueDay: number
  /** No due dates before this day. Quarterly and yearly bills repeat from this month. */
  startDate: ISODate
  active: boolean
}

/** Something bought again and again, saved so one tap in the + sheet logs it. */
export interface QuickItem extends BaseRecord {
  /** Becomes the entry's note. */
  name: string
  /** In `currency`. */
  amount: number
  /** The wallet's currency, copied by the store. Left out means the main currency. */
  currency?: string
  accountId: ID
  categoryId: ID
  /** How many to buy at most in a pay cycle. No limit when absent. */
  cycleLimit?: number
}

/** Money that arrives regularly on top of the salary: a second job, rent from a flat, a pension. */
export interface IncomeSource extends BaseRecord {
  name: string
  /** Per pay, in `currency`. */
  amount: number
  /** The wallet's currency, copied by the store. Left out means the main currency. */
  currency?: string
  frequency: Exclude<PayFrequency, 'irregular'>
  /** Day of the month, when monthly. */
  payday: number
  /** Any one payday, when weekly or biweekly. */
  anchor?: ISODate
  /** No paydays before this day. */
  startDate: ISODate
  accountId: ID
  categoryId: ID
}

/**
 * `refund`: money back for something bought. It arrives in a wallet and takes back spending in its
 * expense category (and from its bill, if it was a bill payment). It's never income.
 */
export type TransactionType = 'expense' | 'refund' | 'income' | 'transfer' | 'goal-deposit' | 'goal-withdrawal' | 'debt-out' | 'debt-in'

/** Set when the app created the transaction itself. */
export type TransactionSource = 'salary' | 'cash-count'

export interface Transaction extends BaseRecord {
  type: TransactionType
  /** Always positive; `type` says which way the money moved. In `currency`. */
  amount: number
  /** The wallet's currency, copied by the store. Left out means the main currency. */
  currency?: string
  /** Transfers between currencies: what arrived, in `toCurrency`. No rate is ever stored. */
  toAmount?: number
  toCurrency?: string
  /** Debt entries in another currency than the debt: how much of the debt this cleared, in the debt's currency. */
  debtAmount?: number
  date: ISODate
  /** Wallet the money left, or arrived in for income, refunds and goal withdrawals. */
  accountId: ID
  /** Required for expenses, refunds (an expense category) and income. */
  categoryId?: ID
  /** Refunds: the expense this is money back for, when it's known. */
  refundOf?: ID
  /**
   * Expenses, refunds and income: names that group entries across categories and pay cycles, like
   * "Wedding" or "Trip to Oran". Each once, in the spelling the tag was first given.
   */
  tags?: string[]
  /** Expenses only: the purchase this is a part of, when one purchase is split across categories. Every part has the same id. */
  splitId?: ID
  /** Transfers only: the wallet the money moved to (e.g. ATM withdrawal: bank → cash). */
  toAccountId?: ID
  /** Set when this expense pays a bill. */
  billId?: ID
  /** Required for goal deposits and withdrawals. On an expense, the fund that paid `fundAmount` of it. */
  goalId?: ID
  /** Required for `debt-out` and `debt-in`: money leaving or arriving for this debt. */
  debtId?: ID
  source?: TransactionSource
  /** Set when this is a payday of an income source. */
  incomeId?: ID
  /**
   * Expenses only: the part paid from the fund `goalId`, up to the whole amount. That part comes out
   * of the fund, not the wallet, and it isn't everyday spending: the fund was put aside for it.
   */
  fundAmount?: number
  /**
   * An answer about expected pay that was taken back, so it's asked again. It has to stay
   * as a deleted record: sync would bring back a record that simply disappeared.
   */
  reasked?: boolean
  /** Expenses only: how many were bought. `amount` is still the total paid. Left out when it wasn't given, which isn't the same as one. */
  quantity?: number
  note?: string
}

/** How a fund's date comes round again. `hijri-yearly` follows the Islamic calendar, so it moves about 11 days earlier each year. */
export type FundRepeat = 'yearly' | 'hijri-yearly'

/**
 * Makes a goal a fund: money put aside for a cost that comes back, like insurance, back to school
 * or Ramadan. It's spent when the time comes and filled again for the next time.
 */
export interface GoalFund {
  /** How the date repeats. Left out with a bill, whose due dates it follows. */
  repeat?: FundRepeat
  /** The bill it pays. The bill's amount is the target, and its payments come out of the fund. */
  billId?: ID
}

export interface Goal extends BaseRecord {
  name: string
  icon: string
  /** For a fund: what's needed each time. */
  target: number
  /** For a fund that isn't for a bill: one date it's needed, which then repeats. */
  deadline?: ISODate
  /** Set for a fund. */
  fund?: GoalFund
  /** Planned amount to put aside each pay cycle. */
  monthlyContribution: number
  /** Already saved before the app tracked it. Deposits add to this. */
  startingAmount?: number
  archived: boolean
}

export type DebtDirection = 'lent' | 'borrowed'

/** An amount added to a debt with no money moving through a wallet, so it keeps its own date and history line. */
export interface DebtCharge {
  id: ID
  date: ISODate
  amount: number
  note?: string
  /** Set when this is a month of a repeating charge. */
  repeatId?: ID
  /** Which month of it: the date it fell due. */
  dueDate?: ISODate
}

/** Something that adds to a debt every month, like a subscription on a friend's card. It's only ever added after the person says yes. */
export interface DebtRepeat {
  id: ID
  name: string
  amount: number
  /** Falls due from this date, on this day of each month. */
  startDate: ISODate
  /** Months the person said no to, by their due date. */
  skipped?: ISODate[]
  /** Nothing more falls due from this date. */
  stoppedAt?: ISODate
}

/**
 * Money lent to someone or borrowed from someone, or a purchase paid in instalments.
 * Money moving is logged as `debt-out` and `debt-in` transactions, so wallets stay
 * right; those are neither spending nor income.
 */
export interface Debt extends BaseRecord {
  direction: DebtDirection
  /** A person, shop or bank. */
  person: string
  /** What's owed is tracked in this. Left out means the main currency. */
  currency?: string
  /** Owed when it was added, without money moving through a wallet: an older debt, or something bought on credit. */
  startingAmount: number
  date: ISODate
  /** When it should all be paid back. */
  dueDate?: ISODate
  note?: string
  /** Borrowed money only: the instalment. Reserved in the budget like a bill. */
  monthlyPayment?: number
  /** Instalments fall due from this date, on this day of each month. */
  firstPaymentDate?: ISODate
  /** Closed: forgiven, or no longer counted. Its history stays. */
  archived: boolean
  charges?: DebtCharge[]
  repeats?: DebtRepeat[]
}

/** `gold` can be weighed: its value is then its grams times a price per gram. */
export type AssetKind = 'gold' | 'property' | 'vehicle' | 'other'

/** What an asset was worth from a day on, until the next value. */
export interface AssetValue {
  id: ID
  date: ISODate
  /** In the asset's currency. */
  value: number
  /** Gold weighed in grams: the price per gram this value came from. */
  perGram?: number
}

/**
 * Something owned that's worth money but isn't money: gold, a flat, a car. It counts in net worth
 * at the value the person gives it, which they update by hand; nothing is ever priced for them.
 */
export interface Asset extends BaseRecord {
  name: string
  kind: AssetKind
  /** ISO 4217 code. Left out means the main currency (`profile.currency`). */
  currency?: string
  /** Gold only: how much there is, in grams. */
  grams?: number
  /** Never empty. The first one is when it started counting. */
  values: AssetValue[]
  /** Sold, given away or lost: it stops counting from this day. Its history stays. */
  soldAt?: ISODate
}

export type WishlistStatus = 'thinking' | 'bought' | 'skipped'

export interface WishlistItem extends BaseRecord {
  /** Can be empty: the calculator doesn't need a name. */
  name: string
  price: number
  categoryId?: ID
  status: WishlistStatus
  remindAt?: ISODateTime
  decidedAt?: ISODateTime
  /** The expense logged when the item was bought. */
  transactionId?: ID
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  /** Weekday 0 = Sunday … 6 = Saturday; time is `HH:mm`. */
  weeklyReminder: { enabled: boolean; weekday: number; time: string }
  cashCheck: { enabled: boolean }
  alerts: {
    enabled: boolean
    /** A category is "near its limit" at this share of its budget. */
    warnAtPercent: number
    /** "Spending too fast" when budget used is this many points ahead of the cycle elapsed. */
    paceTolerancePercent: number
    /** A single expense above this share of monthly salary shows its work hours. */
    bigPurchasePercent: number
  }
  showWorkHours: boolean
  /** "Is it worth it?" asks again about a wishlist item after this many hours. */
  coolingOffHours: number
  /** The main categories someone chose to see first when adding an expense, up to `CATEGORY_SHORTCUTS`. Places left empty show the most used. */
  categoryShortcuts?: ID[]
  /** When they were last changed, for sync. Absent until the first change. */
  updatedAt?: ISODateTime
}

/** Everything the app saves. */
export interface AppData {
  deviceId: string
  profile: Profile
  settings: Settings
  accounts: Account[]
  categories: Category[]
  bills: Bill[]
  transactions: Transaction[]
  goals: Goal[]
  debts: Debt[]
  incomes: IncomeSource[]
  quickItems: QuickItem[]
  assets: Asset[]
  wishlist: WishlistItem[]
}
