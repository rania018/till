import { addDays } from 'date-fns'
import { billOccurrences } from '../lib/bills'
import { fromISODate, getPayCycle, previousCycle, toISODate, type Cycle } from '../lib/dates'
import { dueRepeats } from '../lib/debts'
import { occurrenceFrom } from '../lib/funds'
import { expectedPays } from '../lib/income'
import { roundMoney } from '../lib/money'
import { ACCOUNT_IDS, CATEGORY_IDS, createInitialData } from '../store/defaults'
import type { Account, AppData, Bill, Debt, Goal, ISODate, Salary, Transaction, WishlistItem } from '../types'

/**
 * A made-up person with two years of history, for trying the app, for testing Stats, and for
 * screenshots. Nothing here is real. The same `today` always gives the same data.
 *
 * Most pay cycles end with a little left over, and the current one is on track: one limit gone
 * over, one close to it, nothing late. Besides the ordinary months it holds the awkward ones
 * Stats has to get right:
 * - a raise, so older cycles were paid less than the salary in settings
 * - an unpaid month (its salary is deleted): no income, so no savings rate
 * - a month with a big car repair: more spent than earned, a negative savings rate
 * - money taken back out of a goal, so "saved" goes below zero
 * - seasonal categories, a category that only starts recently, and flat subscriptions
 * - cash and card spending that shifts over time, and cash counts that find money missing
 * - deleted entries with absurd amounts, which would wreck the totals if ever counted
 *
 * And at least one of everything the app keeps: a regular income besides the salary (one month
 * smaller, one month not paid), a paused bill, funds on a bill, on the Islamic calendar and on a
 * date each year, a goal reached, quantities and prices that go up, one-tap items with a limit,
 * several tags, debts with instalments, an added charge and a monthly charge waiting for an OK,
 * a wallet in dollars, a closed wallet, and assets: gold, a car, land and a phone that was sold.
 */

export const DEMO_CYCLES = 26
/** Cycles back from the current one (the current one is 0). */
export const DEMO_RAISE_AT = 10
export const DEMO_UNPAID_AT = 8
export const DEMO_CAR_REPAIR_AT = 3
export const DEMO_OLD_SALARY = 85_000
export const DEMO_SALARY = 100_000
const CAR_REPAIR = 92_000
const DELETED_DECOY = 9_999_999

/** Small seeded generator (mulberry32), so a test run and a screen show the same numbers. */
function randomFrom(seed: number) {
  let state = seed
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    chance: (probability: number) => next() < probability,
  }
}

interface Habit {
  categoryId: string
  /** Entries per cycle. */
  count: [number, number]
  /** Rounded to 50 DA. */
  amount: [number, number]
  /** Chance it's paid from the bank card instead of cash. */
  card: number
  notes: string[]
  /** Only in these months, 0 = January. */
  months?: number[]
  /** Only this many cycles back or more recent. */
  since?: number
}

const HABITS: Habit[] = [
  { categoryId: 'cat-groceries', count: [6, 8], amount: [600, 2_400], card: 0.15, notes: ['Market', 'Supermarket', 'Bakery', 'Butcher', 'Vegetables', 'Fruit and eggs', ''] },
  { categoryId: 'cat-eating-out', count: [4, 7], amount: [300, 1_500], card: 0.2, notes: ['Lunch with Nadia', 'Pizza', 'Grilled chicken', 'Tea and cake', ''] },
  { categoryId: 'cat-transport', count: [4, 8], amount: [50, 600], card: 0.05, notes: ['Taxi', 'Tram', 'Fuel', 'Parking', ''] },
  { categoryId: 'cat-personal-care', count: [1, 2], amount: [400, 1_200], card: 0.3, notes: ['Haircut', 'Pharmacy', 'Soap and shampoo', ''] },
  { categoryId: 'cat-household', count: [1, 2], amount: [300, 1_000], card: 0.3, notes: ['Cleaning things', 'Light bulbs', 'Kitchen towels', ''] },
  { categoryId: 'cat-shopping', count: [1, 2], amount: [800, 3_600], card: 0.65, notes: ['Shoes', 'Winter jacket', 'Phone case', 'Shirt', 'Backpack', ''] },
  { categoryId: 'cat-entertainment', count: [1, 2], amount: [400, 1_500], card: 0.45, notes: ['Cinema', 'Football match', 'Video game', 'Museum', ''] },
  { categoryId: 'cat-health', count: [0, 2], amount: [500, 2_000], card: 0.4, notes: ['Dentist', 'Medicine', 'Eye test', ''] },
  { categoryId: CATEGORY_IDS.other, count: [0, 1], amount: [200, 900], card: 0.3, notes: ['Stamps', 'Photocopies', 'Tip', ''] },
  // Seasonal: months with nothing, then a jump, for the "new" and "% more" labels.
  { categoryId: 'cat-travel', count: [2, 3], amount: [4_000, 12_000], card: 0.9, notes: ['Train to Oran', 'Hotel', 'Beach weekend', 'Flight'], months: [6, 7] },
  { categoryId: 'cat-gifts', count: [1, 2], amount: [1_500, 5_000], card: 0.5, notes: ['Gift for Mum', 'Birthday present'], months: [11, 2, 3] },
  { categoryId: 'cat-education', count: [1, 2], amount: [3_000, 8_000], card: 0.8, notes: ['English course', 'Online course'], months: [8, 9] },
  // Only started recently: every comparison before it reads "new".
  { categoryId: CATEGORY_IDS.pets, count: [1, 2], amount: [500, 2_000], card: 0.2, notes: ['Cat food', 'Vet'], since: 5 },
]

const BUDGETS: Record<string, number> = {
  'cat-groceries': 20_000,
  'cat-eating-out': 8_000,
  'cat-transport': 3_000,
  'cat-personal-care': 3_000,
  'cat-household': 3_500,
  'cat-shopping': 5_000,
  'cat-entertainment': 3_000,
  'cat-health': 5_000,
  [CATEGORY_IDS.other]: 1_000,
}

export function demoData(today: ISODate): AppData {
  const random = randomFrom(20261103)
  const salaryPlan: Salary = { amount: DEMO_SALARY, frequency: 'monthly', payday: 25, accountId: ACCOUNT_IDS.bank }

  // Oldest first, ending with the cycle we're in. `back` counts cycles from the current one.
  const cycles: { cycle: Cycle; back: number }[] = []
  for (let cycle = getPayCycle(today, salaryPlan), back = 0; back < DEMO_CYCLES; back++) {
    cycles.unshift({ cycle, back })
    cycle = previousCycle(cycle, salaryPlan)
  }
  const firstDay = cycles[0].cycle.start
  const created = `${firstDay}T09:00:00.000Z`
  const base = { createdAt: created, updatedAt: created }
  const stamped = (date: ISODate) => ({ createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z` })
  const dayOf = (cycle: Cycle, index: number) => toISODate(addDays(fromISODate(cycle.start), index))
  const inCycle = (back: number, index: number) => dayOf(cycles[cycles.length - 1 - back].cycle, index)
  const later = (date: ISODate, days: number) => toISODate(addDays(fromISODate(date), days))

  const data = createInitialData(fromISODate(firstDay))
  data.profile = {
    ...data.profile,
    name: 'Lina',
    salary: salaryPlan,
    work: { hoursPerDay: 8, daysPerWeek: 5 },
    startDate: firstDay,
    onboardingCompleted: true,
  }
  data.categories = data.categories.map((c) => ({
    ...c,
    ...(BUDGETS[c.id] ? { monthlyBudget: BUDGETS[c.id] } : {}),
    ...(c.id === CATEGORY_IDS.pets ? { enabled: true } : {}),
  }))
  data.accounts = data.accounts.map((a) =>
    a.id === ACCOUNT_IDS.bank ? { ...a, startingBalance: 520_000, startDate: firstDay } : { ...a, startingBalance: 6_000, startDate: firstDay },
  )
  // A third wallet, where the tutoring is paid; one in dollars; and an old account emptied and closed.
  const baridi = 'demo-wallet-baridi'
  const usd = 'demo-wallet-usd'
  const ccp = 'demo-wallet-ccp'
  const wallet = (id: string, name: string, startDate: ISODate, extra: Partial<Account> = {}): Account => ({ id, ...stamped(startDate), name, kind: 'bank', startingBalance: 0, startDate, archived: false, ...extra })
  data.accounts = [
    ...data.accounts,
    wallet(baridi, 'BaridiMob', inCycle(6, 0), { startingBalance: 18_000 }),
    wallet(usd, 'USD card', inCycle(10, 0), { currency: 'USD' }),
    { ...wallet(ccp, 'CCP account', firstDay, { startingBalance: 12_000, archived: true }), updatedAt: `${inCycle(20, 3)}T18:00:00.000Z` },
  ]

  const bill = (id: string, name: string, amount: number, categoryId: string, frequency: Bill['frequency'], dueDay: number, accountId: string = ACCOUNT_IDS.bank, active = true): Bill => ({
    id,
    ...base,
    name,
    amount,
    categoryId,
    accountId,
    frequency,
    dueDay,
    startDate: firstDay,
    active,
  })
  data.bills = [
    bill('demo-rent', 'Rent', 22_000, 'cat-housing', 'monthly', 25),
    bill('demo-phone', 'Phone', 1_500, 'cat-bills', 'monthly', 27),
    bill('demo-streaming', 'Streaming', 1_200, 'cat-subscriptions', 'monthly', 1),
    bill('demo-internet', 'Internet', 2_500, 'cat-bills', 'monthly', 17),
    bill('demo-power', 'Electricity and gas', 6_500, 'cat-bills', 'quarterly', 10),
    bill('demo-insurance', 'Car insurance', 18_000, 'cat-transport', 'yearly', 5),
    bill('demo-swim', 'Swimming lesson', 800, 'cat-health', 'weekly', 6, ACCOUNT_IDS.cash),
    // Paused: paid every month until it stopped, with no due dates since.
    bill('demo-gym', 'Gym', 3_000, 'cat-health', 'monthly', 3, ACCOUNT_IDS.bank, false),
  ]
  const GYM_UNTIL = 9

  const goal = (id: string, name: string, icon: string, target: number, monthlyContribution: number, startingAmount: number, extra: Partial<Goal> = {}): Goal => ({
    id,
    ...base,
    name,
    icon,
    target,
    monthlyContribution,
    startingAmount,
    archived: false,
    ...extra,
  })
  const monthsAway = (months: number) => toISODate(addDays(fromISODate(today), months * 30))
  const RAMADAN = '2025-03-01'
  const SCHOOL = '2025-09-14'
  data.goals = [
    goal('demo-laptop', 'Laptop', 'laptop', 220_000, 5_000, 20_000),
    goal('demo-emergency', 'Emergency fund', 'shield', 300_000, 3_000, 90_000),
    // Too little a month for its deadline: reads as behind.
    goal('demo-trip', 'Summer trip', 'plane', 150_000, 2_000, 10_000, { deadline: monthsAway(7) }),
    // Saved in full, not put away yet.
    goal('demo-licence', 'Driving licence', 'car', 60_000, 0, 60_000),
    // Reached, then put away.
    goal('demo-phone-goal', 'New phone', 'smartphone', 30_000, 0, 30_000, { archived: true }),
    // Funds: the yearly insurance is paid from its own, Ramadan's shopping from another, and back to school from a third.
    goal('demo-insurance-fund', 'Car insurance', 'receipt', 18_000, 1_500, 0, { fund: { billId: 'demo-insurance' } }),
    goal('demo-ramadan', 'Ramadan', 'moon', 30_000, 3_000, 0, { fund: { repeat: 'hijri-yearly' }, deadline: occurrenceFrom(RAMADAN, 'hijri-yearly', firstDay) }),
    goal('demo-school', 'Back to school', 'backpack', 20_000, 2_000, 0, { fund: { repeat: 'yearly' }, deadline: occurrenceFrom(SCHOOL, 'yearly', firstDay) }),
  ]
  const fundSaved = new Map<string, number>()
  const yearly = (anchor: ISODate, repeat: 'yearly' | 'hijri-yearly') => {
    const days: ISODate[] = []
    for (let day = occurrenceFrom(anchor, repeat, firstDay); day <= today; day = occurrenceFrom(anchor, repeat, later(day, 1))) days.push(day)
    return days
  }
  const ramadans = yearly(RAMADAN, 'hijri-yearly')
  const schoolStarts = yearly(SCHOOL, 'yearly')
  const eids = yearly('2025-06-06', 'hijri-yearly')

  let serial = 0
  const transactions: Transaction[] = []
  /** Every entry goes through here, so nothing is ever dated after today. */
  const keep = (tx: Transaction): Transaction | null => {
    if (tx.date > today) return null
    transactions.push(tx)
    return tx
  }
  const add = (fields: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction | null => {
    const stamp = `${fields.date}T10:00:00.000Z`
    return keep({ id: `demo-tx-${++serial}`, createdAt: stamp, updatedAt: stamp, ...fields, amount: roundMoney(fields.amount) })
  }
  const expense = (categoryId: string, amount: number, date: ISODate, accountId: string, note?: string, billId?: string) =>
    add({ type: 'expense', amount, categoryId, date, accountId, note: note || undefined, billId })
  const fifty = (min: number, max: number) => Math.round(random.int(min, max) / 50) * 50
  const tagged = (tx: Transaction | null, tag: string) => {
    if (tx) tx.tags = [tag]
    return tx
  }
  /** Spending a fund pays for, from what it holds. */
  const fromFund = (tx: Transaction | null, goalId: string) => {
    const fund = tx ? Math.min(tx.amount, fundSaved.get(goalId) ?? 0) : 0
    if (tx && fund > 0) {
      Object.assign(tx, { goalId, fundAmount: fund })
      fundSaved.set(goalId, roundMoney((fundSaved.get(goalId) ?? 0) - fund))
    }
    return fund
  }

  for (const { cycle, back } of cycles) {
    const month = fromISODate(cycle.start).getMonth()
    const pay = back > DEMO_RAISE_AT ? DEMO_OLD_SALARY : DEMO_SALARY
    const unpaid = back === DEMO_UNPAID_AT
    add({ type: 'income', amount: pay, categoryId: CATEGORY_IDS.salary, date: cycle.start, accountId: ACCOUNT_IDS.bank, source: 'salary', deleted: unpaid || undefined })

    if (back % 6 === 2 && !unpaid) add({ type: 'income', amount: fifty(8_000, 25_000), categoryId: 'inc-side', date: dayOf(cycle, 12), accountId: ACCOUNT_IDS.bank, note: 'Translation job' })
    if (month === 11) add({ type: 'income', amount: 30_000, categoryId: 'inc-bonus', date: dayOf(cycle, 8), accountId: ACCOUNT_IDS.bank, note: 'Year-end bonus' })

    let cashOut = 0
    // Bills, on their due day, all paid, named as marking a bill paid names them.
    for (const b of data.bills) {
      for (const due of billOccurrences(b, cycle, [], today)) {
        // Electricity moves with the season; the others are the same every time, so they compare as "about the same".
        const amount = b.id === 'demo-power' ? fifty(5_000, 9_000) : b.amount
        const paid = expense(b.categoryId, amount, due.dueDate, b.accountId, b.name, b.id)
        // The insurance fund pays what it holds.
        if (paid && b.id === 'demo-insurance') fromFund(paid, 'demo-insurance-fund')
        if (paid && b.accountId === ACCOUNT_IDS.cash) cashOut += amount
      }
    }
    // The gym, on the 3rd, until it was paused.
    if (back >= GYM_UNTIL) {
      const third = Array.from({ length: cycle.days }, (_, i) => dayOf(cycle, i)).find((d) => fromISODate(d).getDate() === 3)
      if (third) expense('cat-health', 3_000, third, ACCOUNT_IDS.bank, 'Gym', 'demo-gym')
    }

    // Everyday spending. Friday and Saturday are the busy days.
    for (const habit of HABITS) {
      if (habit.months && !habit.months.includes(month)) continue
      if (habit.since !== undefined && back > habit.since) continue
      const count = random.int(habit.count[0], habit.count[1])
      for (let i = 0; i < count; i++) {
        let date = dayOf(cycle, random.int(0, cycle.days - 1))
        const weekday = fromISODate(date).getDay()
        if (random.chance(0.35) && weekday !== 5 && weekday !== 6) {
          const nudged = toISODate(addDays(fromISODate(date), 5 - weekday > 0 ? 5 - weekday : 6 - weekday))
          if (nudged <= cycle.end) date = nudged
        }
        const card = random.chance(habit.card)
        const amount = fifty(habit.amount[0], habit.amount[1])
        const tx = expense(habit.categoryId, amount, date, card ? ACCOUNT_IDS.bank : ACCOUNT_IDS.cash, random.pick(habit.notes))
        if (tx && !card) cashOut += amount
      }
    }

    // Bought by the piece, so Stats can show a price each: coffee from its one-tap item, milk and bread
    // by quantity. Their prices go up once, for the "price went up" lines.
    const coffee = back > 12 ? 200 : 250
    const milk = back > 6 ? 140 : 160
    for (let i = 0, cups = random.int(8, 14); i < cups; i++) {
      const tx = add({ type: 'expense', amount: coffee, quantity: 1, categoryId: 'cat-eating-out', date: dayOf(cycle, random.int(0, cycle.days - 1)), accountId: ACCOUNT_IDS.cash, note: 'Coffee' })
      if (tx) cashOut += coffee
    }
    for (let i = 0, times = random.int(3, 5); i < times; i++) {
      const cartons = random.int(2, 6)
      const tx = add({ type: 'expense', amount: cartons * milk, quantity: cartons, categoryId: 'cat-groceries', date: dayOf(cycle, random.int(0, cycle.days - 1)), accountId: ACCOUNT_IDS.cash, note: 'Milk' })
      if (tx) cashOut += cartons * milk
    }
    for (let i = 0, times = random.int(4, 7); i < times; i++) {
      const loaves = random.int(2, 6)
      const tx = add({ type: 'expense', amount: loaves * 20, quantity: loaves, categoryId: 'cat-groceries', date: dayOf(cycle, random.int(0, cycle.days - 1)), accountId: ACCOUNT_IDS.cash, note: 'Bread' })
      if (tx) cashOut += loaves * 20
    }

    // One big supermarket run a cycle, split between food and things for the house.
    const shop = dayOf(cycle, 5)
    add({ type: 'expense', amount: 5_600, categoryId: 'cat-groceries', date: shop, accountId: ACCOUNT_IDS.bank, note: 'Supermarket', splitId: `demo-split-${back}` })
    add({ type: 'expense', amount: 1_400, categoryId: 'cat-household', date: shop, accountId: ACCOUNT_IDS.bank, note: 'Supermarket', splitId: `demo-split-${back}` })
    // Now and then something goes back to the shop: all of it, or part of it.
    if (back % 4 === 1) {
      const bought = expense('cat-shopping', 4_500, dayOf(cycle, 3), ACCOUNT_IDS.bank, 'Shoes')
      if (bought) add({ type: 'refund', amount: back % 8 === 1 ? 4_500 : 1_500, categoryId: 'cat-shopping', date: dayOf(cycle, 8), accountId: ACCOUNT_IDS.bank, refundOf: bought.id, note: 'Shoes' })
    }

    if (back === 0) {
      const early = (index: number) => dayOf(cycle, index)
      expense('cat-shopping', 5_400, early(0), ACCOUNT_IDS.bank, 'Winter coat') // the one limit gone over
      expense('cat-transport', 650, early(1), ACCOUNT_IDS.cash, 'Taxi')
      expense('cat-household', 900, early(2), ACCOUNT_IDS.bank, 'Light bulbs\nKitchen towels\nCleaning things')
      cashOut += 650
    }

    if (back === DEMO_CAR_REPAIR_AT) {
      expense('cat-transport', CAR_REPAIR, dayOf(cycle, 9), ACCOUNT_IDS.bank, 'Car repair\nNew gearbox\nTowing')
      add({ type: 'goal-withdrawal', amount: 40_000, goalId: 'demo-emergency', date: dayOf(cycle, 9), accountId: ACCOUNT_IDS.bank, note: 'For the car repair' })
    }
    if (unpaid) add({ type: 'goal-withdrawal', amount: 25_000, goalId: 'demo-emergency', date: dayOf(cycle, 1), accountId: ACCOUNT_IDS.bank, note: 'Unpaid leave' })
    if (back === 14) expense('cat-household', 1_249.5, dayOf(cycle, 4), ACCOUNT_IDS.bank, 'Fan, with a coupon')

    // A wedding, tagged across four categories.
    if (back === 2) {
      const wedding = "Amina's wedding"
      tagged(expense('cat-gifts', 8_000, dayOf(cycle, 10), ACCOUNT_IDS.bank, 'Wedding gift'), wedding)
      tagged(expense('cat-shopping', 6_500, dayOf(cycle, 9), ACCOUNT_IDS.bank, 'Dress'), wedding)
      tagged(expense('cat-personal-care', 2_500, dayOf(cycle, 11), ACCOUNT_IDS.cash, 'Hairdresser'), wedding)
      tagged(expense('cat-transport', 1_200, dayOf(cycle, 11), ACCOUNT_IDS.cash, 'Taxi there and back'), wedding)
      cashOut += 3_700
    }

    // Goals are paid into at the start of the cycle, except in the two bad months.
    if (!unpaid && back !== DEMO_CAR_REPAIR_AT) {
      for (const g of data.goals) {
        // A full fund waits for its date.
        const amount = g.fund ? Math.min(g.monthlyContribution, g.target - (fundSaved.get(g.id) ?? 0)) : g.monthlyContribution
        if (amount <= 0 || !add({ type: 'goal-deposit', amount, goalId: g.id, date: dayOf(cycle, 1), accountId: ACCOUNT_IDS.bank })) continue
        if (g.fund) fundSaved.set(g.id, (fundSaved.get(g.id) ?? 0) + amount)
      }
    }

    const inThisCycle = (date: ISODate) => date >= cycle.start && date <= cycle.end
    // Ramadan's shopping, paid from its fund until it runs out.
    for (const start of ramadans) {
      for (let week = 0; week < 4; week++) {
        const date = later(start, week * 7 + 1)
        if (!inThisCycle(date)) continue
        const amount = fifty(7_000, 11_000)
        const tx = expense('cat-groceries', amount, date, ACCOUNT_IDS.cash, week === 0 ? 'Ramadan shopping\nDates\nFrik\nZlabia' : 'Ramadan shopping')
        if (tx) cashOut += amount - fromFund(tx, 'demo-ramadan')
      }
    }
    // Back to school for her little brother, from its fund.
    for (const start of schoolStarts) {
      const books = later(start, -6)
      const clothes = later(start, -4)
      if (inThisCycle(books)) fromFund(expense('cat-education', 11_500, books, ACCOUNT_IDS.bank, 'School bag and books for Adam'), 'demo-school')
      if (inThisCycle(clothes)) fromFund(expense('cat-education', 7_800, clothes, ACCOUNT_IDS.bank, 'School clothes for Adam'), 'demo-school')
    }
    // Eid al-Adha, tagged.
    for (const eid of eids) {
      if (!inThisCycle(eid)) continue
      const tag = 'Eid al-Adha'
      tagged(expense('cat-shopping', 4_800, later(eid, -3), ACCOUNT_IDS.bank, 'Eid clothes'), tag)
      tagged(expense('cat-groceries', 2_400, later(eid, -1), ACCOUNT_IDS.cash, 'Eid sweets'), tag)
      tagged(expense('cat-gifts', 3_000, eid, ACCOUNT_IDS.cash, 'Eidiya for the kids'), tag)
      cashOut += 5_400
    }

    // Cash comes from the ATM, in two or three goes through the cycle.
    const goes = random.int(2, 3)
    for (let i = 0; i < goes; i++) {
      add({ type: 'transfer', amount: Math.ceil(cashOut / goes / 500) * 500 + 500, date: dayOf(cycle, Math.floor((i * cycle.days) / goes)), accountId: ACCOUNT_IDS.bank, toAccountId: ACCOUNT_IDS.cash })
    }
    // Every few cycles a cash count finds some missing.
    if (back % 5 === 1) add({ type: 'expense', amount: fifty(200, 1_500), categoryId: CATEGORY_IDS.untracked, date: dayOf(cycle, 20), accountId: ACCOUNT_IDS.cash, source: 'cash-count' })

    // Deleted by mistake-fixing: stats must never count these.
    if (back % 7 === 0) expense('cat-shopping', DELETED_DECOY, dayOf(cycle, 3), ACCOUNT_IDS.bank, 'Typed wrong, deleted')
    const decoy = transactions.at(-1)
    if (decoy && decoy.amount === DELETED_DECOY) decoy.deleted = true
  }

  // Bought and skipped through the year, plus one still being thought over and one ready to decide.
  const wish = (id: string, name: string, price: number, categoryId: string, status: WishlistItem['status'], when: ISODate, extra: Partial<WishlistItem> = {}): WishlistItem => ({
    id,
    createdAt: `${when}T08:00:00.000Z`,
    updatedAt: `${when}T08:00:00.000Z`,
    name,
    price,
    categoryId,
    status,
    ...(status === 'thinking' ? {} : { decidedAt: `${when}T12:00:00.000Z` }),
    ...extra,
  })
  const soon = later(today, 2)
  data.wishlist = [
    wish('demo-w-earbuds', 'Wireless earbuds', 8_900, 'cat-shopping', 'thinking', today, { remindAt: `${soon}T09:00:00.000Z` }),
    wish('demo-w-lamp', 'Desk lamp', 3_200, 'cat-household', 'thinking', cycles[cycles.length - 2].cycle.start, { remindAt: `${inCycle(0, 0)}T09:00:00.000Z` }),
    wish('demo-w-sneakers', 'New sneakers', 12_500, 'cat-shopping', 'skipped', inCycle(0, 2)),
    wish('demo-w-console', 'Game console', 65_000, 'cat-entertainment', 'skipped', inCycle(1, 11)),
    wish('demo-w-watch', 'Smart watch', 24_000, 'cat-shopping', 'skipped', inCycle(2, 6)),
    wish('demo-w-coat', 'Designer coat', 31_000, 'cat-shopping', 'skipped', inCycle(5, 4)),
    wish('demo-w-tablet', 'Tablet', 48_000, 'cat-shopping', 'skipped', inCycle(9, 15)),
    wish('demo-w-grinder', 'Coffee grinder', 4_200, 'cat-household', 'bought', inCycle(1, 3)),
  ]

  // Counted a few days ago; deleted decoys aside, everything left is what the screens show.
  data.accounts = data.accounts.map((a) => (a.id === ACCOUNT_IDS.cash ? { ...a, lastCountedAt: `${later(today, -3)}T18:00:00.000Z` } : a))
  // The old account's money moved to the bank before it was closed.
  keep({ id: 'demo-t-ccp', ...stamped(inCycle(20, 3)), type: 'transfer', amount: 12_000, date: inCycle(20, 3), accountId: ccp, toAccountId: ACCOUNT_IDS.bank })

  // Tutoring on the 5th, paid into BaridiMob since spring: smaller in October, and nothing in August.
  const tutoring = 'demo-i-tutor'
  data.incomes = [{ id: tutoring, ...stamped(inCycle(6, 0)), name: 'Tutoring', amount: 12_000, frequency: 'monthly', payday: 5, startDate: inCycle(6, 0), accountId: baridi, categoryId: 'inc-side' }]
  data.transactions = transactions
  for (const pay of expectedPays(data, today)) {
    if (pay.sourceId !== tutoring) continue
    const month = fromISODate(pay.payDate).getMonth()
    keep({ id: pay.id, ...stamped(pay.payDate), type: 'income', amount: month === 9 ? 9_000 : pay.amount, date: pay.payDate, accountId: pay.accountId, categoryId: pay.categoryId, incomeId: tutoring, ...(month === 7 ? { deleted: true } : {}) })
  }

  // One debt of each kind: money lent and partly back, a credit purchase in instalments, an old debt
  // with something added to it, one settled, and one in dollars with a monthly charge.
  const debt = (id: string, person: string, direction: Debt['direction'], startingAmount: number, date: ISODate, extra: Partial<Debt> = {}): Debt => ({
    id,
    ...stamped(date),
    direction,
    person,
    startingAmount,
    date,
    archived: false,
    ...extra,
  })
  const move = (id: string, type: 'debt-in' | 'debt-out', debtId: string, amount: number, date: ISODate, accountId: string = ACCOUNT_IDS.bank, extra: Partial<Transaction> = {}) =>
    keep({ id, ...stamped(date), type, debtId, amount, date, accountId, ...extra })
  data.debts = [
    debt('demo-d-sami', 'Sami', 'lent', 0, inCycle(2, 3), { note: 'Help with his car', dueDate: soon }),
    debt('demo-d-fridge', 'Condor store', 'borrowed', 120_000, inCycle(4, 1), { note: 'Fridge', monthlyPayment: 10_000, firstPaymentDate: inCycle(3, 2) }),
    debt('demo-d-yacine', 'Yacine', 'borrowed', 15_000, inCycle(6, 1), { charges: [{ id: 'demo-dc-yacine', date: inCycle(4, 6), amount: 3_000, note: 'Concert ticket he paid for' }] }),
    debt('demo-d-meriem', 'Meriem', 'lent', 0, inCycle(5, 2), { note: 'Concert tickets' }),
    debt('demo-d-karim', 'Karim', 'borrowed', 0, inCycle(5, 1), { note: 'Music app on his card', currency: 'USD', repeats: [{ id: 'demo-r-music', name: 'Music app', amount: 5.99, startDate: inCycle(5, 1) }] }),
  ]
  move('demo-dm-sami', 'debt-out', 'demo-d-sami', 20_000, inCycle(2, 3))
  move('demo-dm-sami-back', 'debt-in', 'demo-d-sami', 5_000, inCycle(1, 4))
  for (const back of [3, 2, 1, 0]) move(`demo-dm-fridge-${4 - back}`, 'debt-out', 'demo-d-fridge', 10_000, inCycle(back, 2))
  move('demo-dm-meriem', 'debt-out', 'demo-d-meriem', 3_000, inCycle(5, 2))
  move('demo-dm-meriem-back', 'debt-in', 'demo-d-meriem', 3_000, inCycle(4, 5))
  move('demo-dm-karim', 'debt-in', 'demo-d-karim', 100, inCycle(5, 1), usd, { currency: 'USD' })
  move('demo-dm-karim-back', 'debt-out', 'demo-d-karim', 13_500, inCycle(4, 1), ACCOUNT_IDS.bank, { debtAmount: 50 })
  keep({ id: 'demo-t-sub', ...stamped(inCycle(1, 2)), type: 'expense', amount: 15.99, date: inCycle(1, 2), accountId: usd, categoryId: 'cat-subscriptions', note: 'Streaming', currency: 'USD' })
  keep({ id: 'demo-t-change', ...stamped(inCycle(10, 9)), type: 'transfer', amount: 27_000, date: inCycle(10, 9), accountId: ACCOUNT_IDS.bank, toAccountId: usd, toAmount: 100, toCurrency: 'USD' })
  // Every month of the music app said yes to, except the latest, which waits for an OK on Home.
  const karim = data.debts.find((d) => d.id === 'demo-d-karim')!
  const months = dueRepeats(data.debts, today).filter((d) => d.debt.id === karim.id)
  karim.charges = months.slice(0, -1).map(({ repeat, dueDate }, i) => ({ id: `demo-dc-music-${i}`, date: dueDate, amount: repeat.amount, note: repeat.name, repeatId: repeat.id, dueDate }))

  // Tags: a trip's spending across categories, tagged on entries already there so no total changes.
  const tripStart = inCycle(4, 3)
  const tripEnd = inCycle(4, 12)
  for (const tx of transactions) {
    if (tx.type === 'expense' && !tx.deleted && !tx.tags && tx.date >= tripStart && tx.date <= tripEnd && ['cat-eating-out', 'cat-transport', 'cat-shopping'].includes(tx.categoryId ?? '')) tx.tags = ['Trip to Oran']
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date))

  const quick = (id: string, name: string, amount: number, categoryId: string, extra: { cycleLimit?: number } = {}) => ({ id, ...stamped(inCycle(1, 0)), name, amount, categoryId, accountId: ACCOUNT_IDS.cash, ...extra })
  data.quickItems = [
    quick('demo-q-coffee', 'Coffee', 250, 'cat-eating-out', { cycleLimit: 15 }),
    quick('demo-q-bread', 'Bread', 20, 'cat-groceries'),
    quick('demo-q-milk', 'Milk', 160, 'cat-groceries'),
    quick('demo-q-taxi', 'Taxi', 650, 'cat-transport'),
  ]
  // Net worth: gold weighed and revalued now and then, a car losing value, land gaining it, and a phone sold.
  const goldPrice = [19_500, 20_200, 21_000, 22_400, 23_100]
  const firstOf = inCycle(DEMO_CYCLES - 1, 0)
  data.assets = [
    {
      id: 'demo-a-gold',
      ...stamped(firstOf),
      name: 'Gold jewellery',
      kind: 'gold',
      grams: 38,
      values: goldPrice.map((perGram, i) => ({ id: `demo-av-gold-${i}`, date: inCycle(DEMO_CYCLES - 1 - i * 6, 3), value: 38 * perGram, perGram })),
    },
    {
      id: 'demo-a-car',
      ...stamped(firstOf),
      name: 'Car',
      kind: 'vehicle',
      values: [
        { id: 'demo-av-car-0', date: firstOf, value: 1_900_000 },
        { id: 'demo-av-car-1', date: inCycle(12, 0), value: 1_750_000 },
      ],
    },
    {
      id: 'demo-a-land',
      ...stamped(firstOf),
      name: 'Land in Tipaza',
      kind: 'property',
      values: [
        { id: 'demo-av-land-0', date: firstOf, value: 2_600_000 },
        { id: 'demo-av-land-1', date: inCycle(9, 0), value: 2_900_000 },
      ],
    },
    { id: 'demo-a-phone', ...stamped(firstOf), name: 'Old phone', kind: 'other', values: [{ id: 'demo-av-phone-0', date: firstOf, value: 40_000 }], soldAt: inCycle(6, 10) },
  ]
  return data
}
