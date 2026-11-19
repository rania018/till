import clsx from 'clsx'
import { subDays } from 'date-fns'
import { CalendarDays, Check, PiggyBank, Plus, Receipt, Split, StickyNote, Trash2, TriangleAlert, Undo2, Zap } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { isBigPurchase, newBudgetAlerts } from '../../lib/alerts'
import { pressKeypadKey, type KeypadKey } from '../../lib/amountText'
import { billChoices, totalMonthlyBills } from '../../lib/bills'
import { budgetSummary, type BudgetSummary } from '../../lib/budget'
import { debtItems, debtMoveType, debtOwed, findDebtWith, isRepayment } from '../../lib/debts'
import { fromISODate, planMonth, toISODate, todayISO } from '../../lib/dates'
import { live } from '../../lib/id'
import { fundForBill, fundSeason } from '../../lib/funds'
import { goalSaved } from '../../lib/goals'
import { currencySymbol, formatMoney, roundMoney, sumAmounts, usesCents } from '../../lib/money'
import { isQuickItemUsable, quickItemsByUse, quickSuggestions, sameName, type QuickSuggestion } from '../../lib/quickItems'
import { categoriesByUsage, mainsByUsage, nameOf, recentNotes } from '../../lib/transactions'
import { knownTags, normalizeTags } from '../../lib/tags'
import { formatWorkTime, hourlyRate, monthlySalary, workTimeFor } from '../../lib/workHours'
import { appStore, useAppStore } from '../../store'
import { ACCOUNT_IDS } from '../../store/defaults'
import type { Bill, Debt, Goal, ID, QuickItem, Transaction, TransactionType } from '../../types'
import { describeAlert } from '../home/describeAlert'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { Icon } from '../ui/Icon'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import { toast } from '../ui/toastStore'
import { WalletPicker } from '../wallets/WalletPicker'
import { AmountDisplay, AmountKeypad, CurrencyPill } from './AmountKeypad'
import { CategoryGrid } from './CategoryGrid'
import { QuantityField } from './QuantityField'
import { newDebtDraft, type DebtDraft } from './debtDraft'
import { DebtFields, DebtOptions } from './DebtFields'
import { noteLines } from './describe'
import { TagField } from './TagField'
import { closeTransactionSheet, openTransactionSheet, transactionSheet, type SheetMode, type SheetPrefill } from './sheetStore'
import { splitProblem, splitRest, type SplitLine } from './splitDraft'
import { SplitFields } from './SplitFields'

/** The app's one add/edit form for expenses, income, goal savings, debts and cash withdrawals. Rendered once in the layout. */
export function TransactionSheet() {
  const state = useStore(transactionSheet)
  // A new session remounts the form, so every open starts clean.
  return <TransactionForm key={state.session} open={state.open} mode={state.mode} editing={state.editing} prefill={state.prefill} />
}

const USAGE_WINDOW_DAYS = 90

/** A pill that's picked or not: goals and bills. */
const chipClass = (selected: boolean) =>
  clsx(
    'inline-flex min-h-11 items-center gap-2 rounded-full border px-4',
    selected ? 'border-accent bg-accent-soft font-bold text-accent' : 'border-line bg-surface font-semibold hover:bg-surface-2',
  )

function TransactionForm({ open, mode, editing, prefill }: { open: boolean; mode: SheetMode; editing?: Transaction; prefill?: SheetPrefill }) {
  const navigate = useNavigate()
  const { categories, accounts, goals, debts, transactions, bills, quickItems, profile, settings } = useAppStore(
    useShallow((s) => ({
      categories: s.categories,
      accounts: s.accounts,
      goals: s.goals,
      debts: s.debts,
      transactions: s.transactions,
      bills: s.bills,
      quickItems: s.quickItems,
      profile: s.profile,
      settings: s.settings,
    })),
  )
  // A wallet that has closed since this entry was logged still shows as the one it used.
  const wallets = live(accounts).filter((a) => !a.archived || a.id === editing?.accountId || a.id === editing?.toAccountId)
  const activeGoals = live(goals).filter((g) => !g.archived)
  const walletOr = (id: ID) => (wallets.some((w) => w.id === id) ? id : (wallets[0]?.id ?? id))
  const defaultWallet = (m: SheetMode) => walletOr(m === 'expense' || m === 'debt' ? ACCOUNT_IDS.cash : m === 'transfer' ? ACCOUNT_IDS.bank : profile.salary.accountId)
  const main = profile.currency
  const walletsIn = (code: string) => wallets.filter((w) => (w.currency ?? main) === code)
  /** Where a move goes by default: cash if it can, and never the wallet the money leaves. */
  const destinationFor = (from: ID) => (walletOr(ACCOUNT_IDS.cash) !== from ? walletOr(ACCOUNT_IDS.cash) : (wallets.find((w) => w.id !== from)?.id ?? from))

  // From a debt's page: its currency, unless a payment has no wallet in it, as with a USD debt paid back in dinars.
  const prefillDebt = prefill?.debtId ? debts.find((d) => d.id === prefill.debtId) : undefined
  const debtCurrency = prefillDebt ? (prefillDebt.currency ?? main) : main
  // Money back for a purchase, started from that purchase: its category, wallet, bill and name carry over.
  const refundFor = prefill?.refundOf
  /** What's left to give back for a purchase: its amount less refunds so far, not counting this one. */
  const refundLeft = (bought: Transaction) =>
    roundMoney(bought.amount - sumAmounts(live(transactions).filter((other) => other.type === 'refund' && other.refundOf === bought.id && other.id !== editing?.id).map((other) => other.amount)))
  // One purchase split across categories: every part, oldest first. The first takes what the others leave.
  const splitParts = editing?.splitId ? live(transactions).filter((tx) => tx.splitId === editing.splitId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []
  const startCurrency = editing ? (editing.currency ?? main) : refundFor ? (refundFor.currency ?? main) : prefill?.grow || walletsIn(debtCurrency).length > 0 ? debtCurrency : main
  const [currency, setCurrency] = useState(startCurrency)
  const startAmount = splitParts.length > 1 ? sumAmounts(splitParts.map((p) => p.amount)) : (editing?.amount ?? (refundFor ? refundLeft(refundFor) : startCurrency === debtCurrency ? prefill?.amount : undefined))
  const [digits, setDigits] = useState(startAmount ? String(startAmount) : '')
  const [categoryId, setCategoryId] = useState<ID | undefined>(splitParts[0]?.categoryId ?? editing?.categoryId ?? prefill?.categoryId ?? refundFor?.categoryId)
  const [accountId, setAccountId] = useState<ID>(editing?.accountId ?? refundFor?.accountId ?? defaultWallet(mode))
  const [refund, setRefund] = useState(editing ? editing.type === 'refund' : !!refundFor)
  const refundOfId = editing?.type === 'refund' ? editing.refundOf : refundFor?.id
  const refundedPurchase = refundOfId ? transactions.find((tx) => tx.id === refundOfId) : undefined
  const [splitLines, setSplitLines] = useState<SplitLine[] | null>(splitParts.length > 1 ? splitParts.slice(1).map((p) => ({ id: p.id, categoryId: p.categoryId, amount: p.amount })) : null)
  const [toAccountId, setToAccountId] = useState<ID>(() => editing?.toAccountId ?? destinationFor(accountId))
  const [goalId, setGoalId] = useState<ID | undefined>(editing?.goalId ?? prefill?.goalId ?? activeGoals[0]?.id)
  const [billId, setBillId] = useState<ID | undefined>(editing?.billId ?? refundFor?.billId)
  // An expense paid from a fund: the fund pays what it can, the wallet the rest.
  const [fundId, setFundId] = useState<ID | undefined>(mode === 'expense' ? (editing ? (editing.fundAmount ? editing.goalId : undefined) : prefill?.goalId) : undefined)
  const openDebts = live(debts).filter((d) => !d.archived && debtOwed(d, transactions) > 0)
  const [debtId, setDebtId] = useState<ID | undefined>(editing?.debtId ?? prefill?.debtId ?? openDebts[0]?.id)
  const selectedDebt = debts.find((d) => d.id === debtId)
  const [repay, setRepay] = useState(editing && selectedDebt ? isRepayment(selectedDebt, editing.type) : !prefill?.grow)
  // From a debt's page: a payment on it, or lending or borrowing more from the same person.
  const [debtDraft, setDebtDraft] = useState<DebtDraft>(() =>
    newDebtDraft(todayISO(), prefill?.debtId && selectedDebt ? (prefill.grow ? selectedDebt.direction : 'repay') : 'lent', prefill?.grow && selectedDebt ? selectedDebt.person : ''),
  )
  const [debtErrors, setDebtErrors] = useState<{ person?: string; monthly?: string }>({})
  // Across currencies a move has two amounts, both of them facts: there's no rate to work one out from the other.
  const [toAmount, setToAmount] = useState<number | null>(editing?.toAmount ?? null)
  const [debtClears, setDebtClears] = useState<number | null>(editing?.debtAmount ?? null)
  const [clearsTouched, setClearsTouched] = useState(editing?.debtAmount !== undefined)
  const [withdraw, setWithdraw] = useState(editing ? editing.type === 'goal-withdrawal' : !!prefill?.withdraw)
  /** What a fund can pay: what it holds, counting back what this entry took from it before. */
  const fundHolds = (fund: Goal) => Math.max(0, goalSaved(fund, transactions.filter((other) => other.id !== editing?.id)))
  const formId = useId()
  const [date, setDate] = useState(editing?.date ?? prefill?.date ?? todayISO())
  const [note, setNote] = useState(editing?.note ?? prefill?.note ?? refundFor?.note ?? '')
  // Money back for a purchase belongs to the same event as the purchase.
  const [tags, setTags] = useState<string[]>(editing?.tags ?? prefill?.tags ?? refundFor?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  /** The tags to save, with anything typed and not added yet. */
  const savedTags = () => normalizeTags([...tags, tagDraft], knownTags(transactions))
  const [error, setError] = useState<string | null>(null)
  const [saveAsItem, setSaveAsItem] = useState(false)
  // How many: one to start with on a new entry, and nothing on an old entry that never said.
  const [quantity, setQuantity] = useState<number | null>(editing ? (editing.quantity ?? null) : 1)
  // The last real number, for working out a new total: typing 25 passes through an empty field and 2.
  const lastQuantity = useRef(quantity)

  // A computer has a keyboard: a plain field replaces the phone's on-screen keypad. Touchscreens keep the keypad.
  const typing = useIsDesktop()
  // The sheet's two columns start at Tailwind's `lg`. Below that it's one column under a keypad that never scrolls away.
  const stacked = !useMediaQuery('(min-width: 64rem)')
  const amount = Number(digits || 0)
  const copy = t.transactions
  const codeOfWallet = (id: ID) => wallets.find((w) => w.id === id)?.currency ?? main
  // What the form's amount is in, and the wallets it can come from: an entry's currency is always its wallet's.
  const amountCurrency = mode === 'transfer' ? codeOfWallet(accountId) : mode === 'goal' ? main : currency
  const pickable = mode === 'transfer' ? wallets : walletsIn(amountCurrency)
  const walletId = pickable.some((w) => w.id === accountId) ? accountId : pickable[0]?.id
  const inMain = amountCurrency === main
  const money = (value: number) => formatMoney(value, amountCurrency)
  const debtMoney = (debt: Debt, value: number) => formatMoney(value, debt.currency ?? main)
  const exchanging = mode === 'transfer' && codeOfWallet(accountId) !== codeOfWallet(toAccountId)

  function switchMode(next: SheetMode) {
    transactionSheet.setState({ mode: next })
    setCategoryId(undefined)
    setBillId(undefined)
    setFundId(undefined)
    setAccountId(defaultWallet(next))
    setToAccountId(destinationFor(defaultWallet(next)))
    if (next === 'goal' || next === 'transfer') setCurrency(main)
    setError(null)
  }

  /** An expense that pays a bill: the bill fills in whatever hasn't been typed yet. Tapping it again unlinks. */
  function pickBill(bill: Bill) {
    setError(null)
    const billFund = fundForBill(goals, bill.id)
    if (bill.id === billId) {
      if (billFund && fundId === billFund.id) setFundId(undefined)
      return setBillId(undefined)
    }
    setBillId(bill.id)
    // A bill with a fund is paid from it, as far as it goes.
    if (billFund && fundHolds(billFund) > 0) setFundId(billFund.id)
    else if (fundId && goals.find((g) => g.id === fundId)?.fund?.billId) setFundId(undefined)
    setCurrency(main)
    setCategoryId(bill.categoryId)
    setAccountId(walletOr(bill.accountId))
    if (!digits) setDigits(String(Math.round(bill.amount)))
    if (!note.trim()) setNote(bill.name)
  }

  /** Fills the form, for a saved item that can't be logged as it is, or a suggestion to check first. */
  function fillFrom(item: Pick<QuickItem, 'name' | 'amount' | 'accountId' | 'categoryId' | 'currency'>) {
    setDigits(String(item.amount))
    setNote(item.name)
    if (categories.some((c) => c.id === item.categoryId && !c.deleted)) setCategoryId(item.categoryId)
    const wallet = wallets.find((w) => w.id === item.accountId)
    if (wallet) {
      setAccountId(wallet.id)
      setCurrency(wallet.currency ?? main)
    } else setCurrency(item.currency ?? main)
  }

  /** One tap: logged right away, with Undo in the toast. If its wallet or category has gone, it fills the form and says so instead. */
  function logQuickItem(item: QuickItem) {
    if (!isQuickItemUsable(item, { accounts, categories })) {
      fillFrom(item)
      return setError(copy.quickCheck)
    }
    const store = appStore.getState()
    const before = budgetSummary(store, todayISO())
    try {
      const saved = store.addTransaction({ type: 'expense', amount: item.amount, date, accountId: item.accountId, categoryId: item.categoryId, note: item.name, quantity: 1 })
      closeTransactionSheet()
      toast(copy.saved.quick(item.name, formatMoney(item.amount, item.currency ?? main)), { tone: 'good', action: { label: t.common.undo, onClick: () => appStore.getState().deleteTransaction(saved.id) } })
      announceCrossedLimits(before)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /** The currency a payment on this debt starts in: the debt's own, if there's a wallet to pay from. */
  const paymentCurrency = (debt: Debt) => (walletsIn(debt.currency ?? main).length > 0 ? (debt.currency ?? main) : main)

  function chooseCurrency(next: string) {
    setCurrency(next)
    setClearsTouched(false)
    setError(null)
  }

  function pickDebt(id: ID) {
    setDebtId(id)
    setClearsTouched(false)
    setError(null)
    const debt = debts.find((d) => d.id === id)
    if (debt && !editing) setCurrency(paymentCurrency(debt))
  }

  /** A wallet in the chosen currency, made on the spot and selected. Rename it or set its balance later. */
  function addWalletHere() {
    const added = appStore.getState().addAccount({ name: currencySymbol(amountCurrency), kind: 'bank', currency: amountCurrency, startingBalance: 0, startDate: date, archived: false })
    setAccountId(added.id)
    toast(t.walletSheet.added(added.name), { tone: 'good' })
  }

  // A payment in another currency than the debt also says what it cleared: all of it, unless changed.
  const paidDebt = mode === 'debt' && selectedDebt && (editing ? repay : debtDraft.action === 'repay') ? selectedDebt : undefined
  const clearsNeeded = !!paidDebt && (paidDebt.currency ?? main) !== amountCurrency
  const clearsValue = !clearsNeeded || !paidDebt ? null : clearsTouched ? debtClears : debtOwed(paidDebt, transactions.filter((other) => other.id !== editing?.id))

  function updateDebtDraft(patch: Partial<DebtDraft>) {
    if (patch.action === 'repay' && selectedDebt) setCurrency(paymentCurrency(selectedDebt))
    setDebtDraft((d) => ({ ...d, ...patch }))
    setDebtErrors({})
    setError(null)
  }

  /** The Debt tab, for a new entry: a payment on a debt, or money lent or borrowed. */
  function saveDebtEntry() {
    if (!amount) return setError(copy.enterAmount)
    const store = appStore.getState()
    const before = budgetSummary(store, todayISO())
    const { action, person, noMoney, dueDate, instalments, monthly, firstPayment, repeats, repeatId } = debtDraft
    const noteText = note.trim() || undefined
    try {
      if (action === 'repay') {
        if (!selectedDebt) return setError(t.errors.debtPick)
        if (!walletId) return setError(copy.noWalletIn(currencySymbol(amountCurrency)))
        const saved = store.addTransaction({ type: debtMoveType(selectedDebt, true), amount, date, accountId: walletId, debtId: selectedDebt.id, note: noteText, debtAmount: clearsValue ?? undefined })
        closeTransactionSheet()
        const cleared = clearsValue !== null ? ` · ${copy.clearedLine(debtMoney(selectedDebt, clearsValue))}` : ''
        const left = debtOwed(selectedDebt, appStore.getState().transactions)
        const stillOwed = left > 0 ? ` · ${copy.stillOwed(debtMoney(selectedDebt, left))}` : ''
        toast(`${copy.saved.debt(money(amount), selectedDebt.person)}${cleared}${stillOwed}`, { tone: 'good', action: { label: t.common.undo, onClick: () => appStore.getState().deleteTransaction(saved.id) } })
      } else {
        const plan = action === 'borrowed' && instalments
        const errors = { person: person.trim() ? undefined : t.debtSheet.personError, monthly: plan && !((monthly ?? 0) > 0) ? t.debtSheet.monthlyError : undefined }
        if (errors.person || errors.monthly) return setDebtErrors(errors)
        const { debt, undo } = store.recordDebt({
          direction: action,
          person,
          amount,
          date,
          note: noteText,
          currency: amountCurrency,
          // With no wallet in this currency, the debt is recorded with no money moved.
          accountId: noMoney || repeats || repeatId ? undefined : walletId,
          repeats,
          repeatId,
          dueDate: dueDate || undefined,
          monthlyPayment: plan ? (monthly ?? undefined) : undefined,
          firstPaymentDate: plan ? firstPayment : undefined,
        })
        closeTransactionSheet()
        toast(copy.saved.debt(money(amount), debt.person), { tone: 'good', action: { label: t.common.undo, onClick: undo } })
      }
      announceCrossedLimits(before)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function press(key: KeypadKey) {
    setDigits((d) => pressKeypadKey(d, key))
    setError(null)
  }

  const categoryKind = mode === 'income' ? 'income' : 'expense'
  const since = toISODate(subDays(fromISODate(todayISO()), USAGE_WINDOW_DAYS))
  let choices = categoriesByUsage(categories, transactions, categoryKind, since)
  // A hidden category that's already picked (untracked cash when editing, a bill's switched-off category): keep it selectable.
  const current = categories.find((c) => c.id === categoryId)
  if (current && !choices.includes(current)) choices = [current, ...choices]
  const today = todayISO()
  const cycleChoices = mode === 'expense' ? billChoices(bills, planMonth(today, profile.salary), transactions, today) : []
  // A bill that was deleted or paused since this payment was logged still shows as the one it paid.
  const linked = billId && !cycleChoices.some((b) => b.bill.id === billId) ? bills.find((b) => b.id === billId) : undefined
  const billOptions = linked ? [{ bill: linked, paid: false }, ...cycleChoices] : cycleChoices
  // Same for a goal that was finished since.
  const selectedGoal = goals.find((g) => g.id === goalId)
  const goalChoices = selectedGoal && !activeGoals.includes(selectedGoal) ? [selectedGoal, ...activeGoals] : activeGoals

  // Funds to pay from: the ones in season that hold money, the picked bill's, and the one already chosen.
  const selectedFund = fundId ? goals.find((g) => g.id === fundId) : undefined
  const fundChoices =
    mode === 'expense' && currency === main && !refund && !splitLines
      ? live(goals).filter((g) => g.fund && (g.id === fundId || (!g.archived && fundHolds(g) > 0 && (g.fund.billId ? g.fund.billId === billId : !!fundSeason(g, today)))))
      : []
  const fundPays = selectedFund && mode === 'expense' && currency === main && !refund && !splitLines ? Math.min(amount, fundHolds(selectedFund)) : 0

  // Hours of work and big-purchase checks need the salary's currency.
  const rate = inMain ? hourlyRate(profile, totalMonthlyBills(bills)) : null
  const workTime = rate && amount > 0 ? formatWorkTime(workTimeFor(amount, rate, profile.work.hoursPerDay)) : null
  const salary = monthlySalary(profile.salary)
  // A big purchase always shows its cost in work, even with work hours hidden elsewhere.
  const big = mode === 'expense' && !refund && inMain && settings.alerts.enabled && isBigPurchase(amount, salary, settings.alerts.bigPurchasePercent)
  const share = `${Math.round((amount / salary) * 100)}%`
  // Under the amount: for money back, what it's for and what can still come back. It's what the amount is checked against, so it's never out of view.
  const refundText =
    mode === 'expense' && refund && refundedPurchase
      ? `${t.refunds.forPurchase(noteLines(refundedPurchase.note)[0] || nameOf(categories, refundedPurchase.categoryId), formatMoney(refundedPurchase.amount, refundedPurchase.currency ?? main), t.format.shortDayOrDate(refundedPurchase.date, today))} · ${t.refunds.upTo(formatMoney(refundLeft(refundedPurchase), refundedPurchase.currency ?? main))}`
      : null
  const workHint =
    refundText ??
    (big
      ? workTime
        ? t.alerts.bigPurchase(share, workTime)
        : t.alerts.bigPurchaseNoHours(share)
      : mode === 'expense' && !refund && settings.showWorkHours && workTime
        ? copy.workHint(workTime)
        : null)

  /** After saving: a toast for each limit this change just reached or passed. */
  function announceCrossedLimits(before: BudgetSummary) {
    const state = appStore.getState()
    if (!state.settings.alerts.enabled) return
    const today = todayISO()
    const crossed = newBudgetAlerts(before, budgetSummary(state, today), state.settings.alerts.warnAtPercent)
    const context = { categories: state.categories, bills: state.bills, currency: state.profile.currency, today }
    for (const alert of crossed.slice(0, 2)) toast(describeAlert(alert, context).text, { tone: alert.tone === 'crit' ? 'crit' : 'warn' })
  }

  /** A purchase split across categories, new or changed. A part of one being edited always comes here, so the other parts change with it. */
  function saveSplitEntry() {
    if (!amount) return setError(copy.enterAmount)
    if (!walletId) return setError(copy.noWalletIn(currencySymbol(amountCurrency)))
    const lines = splitLines ?? []
    const problem = lines.length > 0 ? splitProblem(amount, categoryId, lines) : categoryId ? null : t.errors.category
    if (problem) return setError(problem)
    const store = appStore.getState()
    const before = budgetSummary(store, todayISO())
    try {
      const { undo } = store.saveSplit({
        splitId: editing?.splitId,
        date,
        accountId: walletId,
        note: note.trim() || undefined,
        tags: savedTags(),
        parts: [{ id: splitParts[0]?.id ?? editing?.id, categoryId: categoryId!, amount: splitRest(amount, lines) }, ...lines.map((line) => ({ id: line.id, categoryId: line.categoryId!, amount: line.amount! }))],
      })
      closeTransactionSheet()
      toast(lines.length > 0 ? t.refunds.splitSaved(money(amount), lines.length + 1) : editing ? copy.updated : copy.saved.expense(money(amount), nameOf(categories, categoryId)), { tone: 'good', action: { label: t.common.undo, onClick: undo } })
      announceCrossedLimits(before)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function save() {
    if (mode === 'debt' && !editing) return saveDebtEntry()
    if (mode === 'expense' && !refund && (splitLines || editing?.splitId)) return saveSplitEntry()
    if (!amount) return setError(copy.enterAmount)
    if (!walletId) return setError(copy.noWalletIn(currencySymbol(amountCurrency)))
    if (mode === 'debt' && !selectedDebt) return setError(t.errors.debtPick)
    const type: TransactionType = mode === 'debt' ? debtMoveType(selectedDebt!, repay) : mode === 'goal' ? (withdraw ? 'goal-withdrawal' : 'goal-deposit') : mode === 'expense' && refund ? 'refund' : mode
    const fields = {
      type,
      amount,
      date,
      accountId: mode === 'transfer' ? accountId : walletId,
      toAmount: exchanging ? (toAmount ?? undefined) : undefined,
      debtAmount: mode === 'debt' ? (clearsValue ?? undefined) : undefined,
      note: note.trim() || undefined,
      categoryId: mode === 'expense' || mode === 'income' ? categoryId : undefined,
      toAccountId: mode === 'transfer' ? toAccountId : undefined,
      goalId: mode === 'goal' ? goalId : fundPays > 0 ? fundId : undefined,
      fundAmount: fundPays > 0 ? fundPays : undefined,
      billId: mode === 'expense' ? billId : undefined,
      debtId: mode === 'debt' ? debtId : undefined,
      refundOf: type === 'refund' ? refundOfId : undefined,
      // Saved as an item now, what this cost is the price of one.
      quantity: quantityOn ? (quantity ?? undefined) : saveAsItem && canSaveItem ? 1 : undefined,
      tags: mode === 'expense' || mode === 'income' ? savedTags() : undefined,
    }
    const store = appStore.getState()
    const before = budgetSummary(store, todayISO())
    try {
      if (editing) {
        store.updateTransaction(editing.id, fields)
        closeTransactionSheet()
        toast(copy.updated, { tone: 'good' })
        announceCrossedLimits(before)
        return
      }
      const saved = store.addTransaction(fields)
      if (saveAsItem && canSaveItem && categoryId) {
        store.addQuickItem({ name: note, amount, accountId: fields.accountId, categoryId })
        toast(copy.quickSaved(note.trim()), { tone: 'good' })
      }
      closeTransactionSheet()
      prefill?.onSaved?.(saved)
      const fromFund = fundPays > 0 && selectedFund ? ` · ${t.funds.fromLine(money(fundPays), selectedFund.name)}` : ''
      const message =
        type === 'refund'
          ? t.refunds.saved(money(amount), nameOf(categories, categoryId))
          : mode === 'expense'
          ? (billId ? t.billsTab.markedPaid(nameOf(bills, billId), money(amount)) : copy.saved.expense(money(amount), nameOf(categories, categoryId))) + fromFund
          : mode === 'income'
            ? copy.saved.income(money(amount))
            : mode === 'goal'
              ? (withdraw ? copy.saved.goalOut : copy.saved.goal)(money(amount), nameOf(goals, goalId))
              : mode === 'debt'
                ? copy.saved.debt(money(amount), selectedDebt?.person ?? '')
                : copy.saved.transfer(money(amount), nameOf(accounts, toAccountId))
      toast(message, { tone: 'good', action: { label: t.common.undo, onClick: () => appStore.getState().deleteTransaction(saved.id) } })
      announceCrossedLimits(before)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function remove() {
    if (!editing) return
    // A part of a split purchase goes with the rest of it.
    if (editing.splitId) {
      const undo = appStore.getState().deleteSplit(editing.splitId)
      closeTransactionSheet()
      return toast(copy.deleted, { action: { label: t.common.undo, onClick: undo } })
    }
    const id = editing.id
    appStore.getState().deleteTransaction(id)
    closeTransactionSheet()
    toast(copy.deleted, { action: { label: t.common.undo, onClick: () => appStore.getState().restoreTransaction(id) } })
  }

  // Typing on a physical keyboard: digits, the decimal point and Backspace edit the amount, Enter saves.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    // A field used the key itself, like Enter adding a tag.
    if (event.defaultPrevented) return
    if (event.key === 'Enter' && target.tagName === 'INPUT') {
      save()
      event.preventDefault()
      return
    }
    if (target.closest('input, textarea, select')) return
    if (/^\d$/.test(event.key)) press(event.key as KeypadKey)
    else if ((event.key === '.' || event.key === ',') && usesCents(amountCurrency)) press('.')
    else if (event.key === 'Backspace') press('back')
    else if (event.key === 'Enter' && target.tagName !== 'BUTTON' && target.tagName !== 'A') save()
    else return
    event.preventDefault()
  }

  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }))
  // What a new entry on the Debt tab is about: the debt picked for a payment, or the one already there with this person.
  const newDebtTarget = debtDraft.action === 'repay' ? selectedDebt : findDebtWith(debts, debtDraft.person, debtDraft.action, amountCurrency === main ? undefined : amountCurrency)
  const debtArrives = editing
    ? !!selectedDebt && debtMoveType(selectedDebt, repay) === 'debt-in'
    : debtDraft.action === 'borrowed' || (debtDraft.action === 'repay' && selectedDebt?.direction === 'lent')
  const moneyArrives = mode === 'income' || (mode === 'expense' && refund) || (mode === 'goal' && withdraw) || (mode === 'debt' && debtArrives)
  const newDebtEntry = mode === 'debt' && !editing && debtDraft.action !== 'repay'
  const noWalletNeeded = newDebtEntry && (debtDraft.noMoney || debtDraft.repeats || !!debtDraft.repeatId)
  const noWalletYet = mode !== 'transfer' && !noWalletNeeded && pickable.length === 0
  // Every currency is on offer: the main one, the ones with wallets, then the rest.
  const currencyChoices = [...new Set([main, ...wallets.map((w) => w.currency ?? main), ...Object.keys(t.settings.currencies)])]
  const canChooseCurrency = !editing && !billId && !refundedPurchase && (mode === 'expense' || mode === 'income' || mode === 'debt')
  const walletLabel = moneyArrives ? copy.receivedIn : paidDebt ? copy.paidFrom : mode === 'goal' || mode === 'debt' ? copy.takenFrom : copy.paidWith
  // A debt this entry belongs to stays a choice even once it's settled or closed.
  const debtChoices = selectedDebt && !openDebts.includes(selectedDebt) ? [selectedDebt, ...openDebts] : openDebts

  // Names given before in this category, offered until something is typed.
  const recentNames = (mode === 'expense' || mode === 'income') && categoryId && !note ? recentNotes(transactions, mode, categoryId, 5) : []
  const newDebtNote = mode === 'debt' && !editing && debtDraft.action !== 'repay'
  const noteField = (
    <div>
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
          <StickyNote aria-hidden className="size-4 text-muted" />
          {newDebtNote ? t.debtSheet.note : copy.noteLabel[mode]}
          <span className="font-semibold text-muted">{copy.noteAside[mode]}</span>
        </span>
        {/* Grows a line at a time: the first line names the entry in lists, the rest show as "+N more". */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={newDebtNote ? t.debtSheet.notePlaceholder : copy.notePlaceholder[mode]}
          rows={Math.min(4, Math.max(1, note.split('\n').length))}
          className={inputClass({ className: 'min-h-11 resize-none py-2.5 leading-snug' })}
        />
      </label>
      {recentNames.length > 0 && (
        <div role="group" aria-label={copy.recentNames} className="mt-2 flex flex-wrap gap-1.5">
          {recentNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setNote(name)}
              className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // A day picked in the calendar is still a plain new entry: one tap and suggestions stay.
  const logsNew = mode === 'expense' && !editing && (!prefill || Object.keys(prefill).every((key) => key === 'date' || key === 'tags'))
  const tagField = <TagField tags={tags} onChange={setTags} draft={tagDraft} onDraft={setTagDraft} known={knownTags(transactions)} />
  // One tap is for before anything's typed. Once an amount is in, a phone's row gives its room back to the categories.
  const showQuick = logsNew && digits === '' && !billId && !refund && !splitLines
  const quickRow = showQuick ? quickItemsByUse(quickItems, transactions, today) : []
  const suggestions = showQuick ? quickSuggestions(quickItems, transactions, { accounts, categories }, today) : []
  const canSaveItem = logsNew && !billId && !refund && !splitLines && amount > 0 && !!categoryId && !!note.trim() && !note.trim().includes('\n') && !live(quickItems).some((item) => sameName(item.name, note))

  // How many applies to one thing bought on its own: something saved as an item, or an entry that already says.
  const quantityItem = mode === 'expense' && note.trim() && !note.trim().includes('\n') ? live(quickItems).find((item) => sameName(item.name, note)) : undefined
  const quantityOn = mode === 'expense' && !refund && !splitLines && !editing?.splitId && !billId && (!!quantityItem || editing?.quantity !== undefined)
  const unitPrice = editing?.quantity ? editing.amount / editing.quantity : quantityItem && (quantityItem.currency ?? main) === amountCurrency ? quantityItem.amount : null

  /** The total follows the number, unless it's been typed: then it's a price that was really paid, and it stays. */
  function changeQuantity(next: number | null) {
    setError(null)
    setQuantity(next)
    if (next === null) return
    const before = lastQuantity.current
    lastQuantity.current = next
    if (before !== null && unitPrice !== null && (digits === '' || Math.abs(amount - unitPrice * before) < 0.005)) setDigits(String(roundMoney(unitPrice * next)))
  }

  /** The end of a saved chip: the form, ready to say how many. */
  function chooseQuantity(item: QuickItem) {
    fillFrom(item)
    setQuantity(1)
    lastQuantity.current = 1
    setError(null)
  }

  const quantityField = quantityOn && <QuantityField value={quantity} onChange={changeQuantity} hint={quantity && quantity !== 1 && amount > 0 ? copy.quantityEach(money(roundMoney(amount / quantity))) : undefined} />

  // A saved item: the chip logs one, and its end asks how many first.
  const savedChip = (item: QuickItem) => (
    <span key={item.id} className={clsx('inline-flex min-h-11 items-stretch rounded-full border border-accent bg-accent-soft text-sm text-accent', stacked && 'shrink-0 whitespace-nowrap')}>
      <button type="button" aria-label={copy.quickLog(item.name, formatMoney(item.amount, item.currency ?? main))} onClick={() => logQuickItem(item)} className="inline-flex items-center gap-1.5 rounded-s-full pe-2.5 ps-3.5 font-bold">
        <Zap aria-hidden className="size-4" />
        {item.name}
        <span className="font-semibold tabular-nums text-accent/80">{formatMoney(item.amount, item.currency ?? main)}</span>
      </button>
      <button type="button" aria-label={copy.quickHowMany(item.name)} onClick={() => chooseQuantity(item)} className="rounded-e-full border-s border-accent/40 pe-3.5 ps-2.5 font-bold">
        {copy.quantityShort}
      </button>
    </span>
  )

  const quickChip = (name: string, value: number, code: string | undefined, label: string, onClick: () => void, suggested: boolean) => (
    <button
      key={`${suggested ? 's' : 'q'}${name}${value}`}
      type="button"
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm',
        stacked && 'shrink-0 whitespace-nowrap',
        suggested ? 'border-dashed border-muted bg-surface font-semibold' : 'border-accent bg-accent-soft font-bold text-accent',
      )}
    >
      {suggested ? <Plus aria-hidden className="size-4 text-muted" /> : <Zap aria-hidden className="size-4" />}
      {name}
      <span className={clsx('font-semibold tabular-nums', suggested ? 'text-muted' : 'text-accent/80')}>{formatMoney(value, code ?? main)}</span>
    </button>
  )
  const quickField = (quickRow.length > 0 || suggestions.length > 0) && (
    <div role="group" aria-label={copy.quickLabel} className={clsx('flex gap-2', stacked ? '-mx-5 overflow-x-auto px-5' : 'flex-wrap')}>
      {quickRow.map(savedChip)}
      {suggestions.map((s: QuickSuggestion) =>
        quickChip(s.name, s.amount, s.currency, copy.quickFill(s.name, formatMoney(s.amount, s.currency ?? main)), () => {
          fillFrom(s)
          setSaveAsItem(true)
        }, true),
      )}
    </div>
  )

  const saveItemField = canSaveItem && (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{copy.saveForTap}</span>
        <span className="block text-xs text-muted">{copy.saveForTapHint}</span>
      </span>
      <Toggle label={copy.saveForTap} checked={saveAsItem} onChange={setSaveAsItem} />
    </div>
  )

  const categoryField = (mode === 'expense' || mode === 'income') && (
    <CategoryGrid
      key={categoryKind}
      categories={choices}
      mains={categoryKind === 'expense' ? mainsByUsage(choices, categories, transactions, since, settings.categoryShortcuts) : undefined}
      value={categoryId}
      onChange={(id) => {
        setCategoryId(id)
        setError(null)
      }}
    />
  )

  const billChips = (options: typeof billOptions, compact: boolean) =>
    options.map(({ bill, paid }) => (
      <button
        key={bill.id}
        type="button"
        aria-pressed={bill.id === billId}
        aria-label={paid ? copy.billPaid(bill.name) : undefined}
        onClick={() => pickBill(bill)}
        className={clsx(chipClass(bill.id === billId), compact && 'shrink-0 whitespace-nowrap')}
      >
        {paid && <Check aria-hidden className="size-4 text-good-ink" />}
        {bill.name}
      </button>
    ))

  // A refund keeps the bill of what it's for; it isn't paying one. A split purchase isn't a bill either.
  const showBills = mode === 'expense' && currency === main && billOptions.length > 0 && !refund && !splitLines
  // One row on a phone, so bills never push the categories out of view. A payment being edited starts the row, or it could sit out of sight.
  const billRow = showBills && (
    <div role="group" aria-label={copy.billLabel} className="-mx-5 flex items-center gap-2 overflow-x-auto px-5">
      <p className="flex shrink-0 items-center gap-1.5 text-sm font-bold">
        <Receipt aria-hidden className="size-4 text-muted" />
        {copy.billLabel}
      </p>
      {billChips(editing?.billId ? [...billOptions.filter((o) => o.bill.id === editing.billId), ...billOptions.filter((o) => o.bill.id !== editing.billId)] : billOptions, true)}
    </div>
  )
  const billList = showBills && (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
        <Receipt aria-hidden className="size-4 text-muted" />
        {copy.billLabel}
        <span className="font-semibold text-muted">{copy.billAside}</span>
      </p>
      <div role="group" aria-label={copy.billLabel} className="flex flex-wrap gap-2">
        {billChips(billOptions, false)}
      </div>
    </div>
  )

  const walletName = nameOf(wallets, walletId)
  const fundRow = fundChoices.length > 0 && (
    <div>
      <div role="group" aria-label={t.funds.payLabel} className={clsx('flex items-center gap-2', stacked ? '-mx-5 overflow-x-auto px-5' : 'flex-wrap')}>
        <p className="flex shrink-0 items-center gap-1.5 text-sm font-bold">
          <PiggyBank aria-hidden className="size-4 text-muted" />
          {t.funds.payLabel}
          {!stacked && <span className="font-semibold text-muted">{t.funds.payAside}</span>}
        </p>
        {fundChoices.map((fund) => (
          <button
            key={fund.id}
            type="button"
            aria-pressed={fund.id === fundId}
            aria-label={t.funds.chip(fund.name, money(fundHolds(fund)))}
            onClick={() => {
              setFundId(fund.id === fundId ? undefined : fund.id)
              setError(null)
            }}
            className={clsx(chipClass(fund.id === fundId), stacked && 'shrink-0 whitespace-nowrap')}
          >
            <Icon name={fund.icon} className="size-4" />
            {fund.name}
            <span className="font-semibold tabular-nums opacity-80">{money(fundHolds(fund))}</span>
          </button>
        ))}
      </div>
      {selectedFund && fundPays > 0 && (
        <p className="mt-1.5 text-sm font-semibold text-accent">
          {fundPays >= amount ? t.funds.all(money(amount), selectedFund.name) : t.funds.split(money(fundPays), selectedFund.name, money(amount - fundPays), walletName)}
        </p>
      )}
    </div>
  )

  // A new entry can be money back without knowing which purchase it was for.
  const refundToggle = mode === 'expense' && !editing && !refundFor && !splitLines && (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{t.refunds.toggle}</span>
        <span className="block text-xs text-muted">{t.refunds.toggleHint}</span>
      </span>
      <Toggle
        label={t.refunds.toggle}
        checked={refund}
        onChange={(on) => {
          setRefund(on)
          setError(null)
          if (on) {
            setBillId(undefined)
            setFundId(undefined)
          }
        }}
      />
    </div>
  )
  const expenseCategories = live(categories)
    .filter((c) => c.kind === 'expense' && c.enabled && !c.system && !c.archived)
    .sort((a, b) => a.order - b.order)
  // One receipt, several categories. Not for a bill, a fund or money back.
  const canSplit = mode === 'expense' && !refund && !billId && !fundId && (!editing || editing.type === 'expense')
  const splitField =
    canSplit &&
    (splitLines ? (
      <SplitFields
        total={amount}
        currency={amountCurrency}
        firstCategory={categories.find((c) => c.id === categoryId)}
        lines={splitLines}
        categories={expenseCategories}
        onChange={(lines) => {
          setSplitLines(lines)
          setError(null)
        }}
        onStop={() => setSplitLines(null)}
      />
    ) : (
      amount > 0 &&
      !!categoryId && (
        <Button size="sm" variant="secondary" icon={Split} onClick={() => setSplitLines([{ amount: null }])}>
          {t.refunds.splitStart}
        </Button>
      )
    ))

  // Money back for this purchase: a new refund, with what it was carried over. In the form, not the footer, which has no room on a phone.
  const moneyBack = editing?.type === 'expense' && !editing.splitId && refundLeft(editing) > 0 && (
    <Button size="sm" variant="secondary" icon={Undo2} onClick={() => openTransactionSheet('expense', { refundOf: editing })}>
      {t.refunds.moneyBack}
    </Button>
  )

  const footer = (
    <div className="space-y-3">
      {noWalletYet ? (
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{copy.noWalletIn(currencySymbol(amountCurrency))}</span>
            <Button variant="secondary" size="sm" onClick={addWalletHere}>
              {copy.addWalletIn(currencySymbol(amountCurrency))}
            </Button>
          </div>
          {newDebtEntry && <p className="mt-1 text-xs text-muted">{copy.noWalletDebt}</p>}
        </div>
      ) : (
        mode !== 'transfer' &&
        !noWalletNeeded &&
        walletId && (
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-sm font-bold">{walletLabel}</span>
            <div className="min-w-0 flex-1">
              <WalletPicker label={walletLabel} value={walletId} onChange={setAccountId} wallets={pickable} />
            </div>
          </div>
        )
      )}
      {/* Beside the wallet, so it can't be missed: it starts at all of the debt. */}
      {paidDebt && clearsNeeded && (
        <label className="flex items-center gap-3">
          <span className="shrink-0 text-sm font-bold">{copy.debtClears}</span>
          <AmountInput
            value={clearsValue}
            onChange={(next) => {
              setDebtClears(next)
              setClearsTouched(true)
              setError(null)
            }}
            currency={paidDebt.currency ?? main}
            className="min-w-0 flex-1"
          />
        </label>
      )}
      {!typing && <AmountKeypad onKey={press} cents={usesCents(amountCurrency)} />}
      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {editing && (
          <Button variant="ghost" icon={Trash2} onClick={remove} className="text-crit-ink">
            {copy.delete}
          </Button>
        )}
        <Button block size="lg" onClick={save}>
          {mode === 'expense' && refund && !editing ? t.refunds.save : editing ? copy.saveChanges : mode === 'expense' && splitLines ? t.refunds.splitSave : mode === 'goal' && withdraw ? copy.saveWithdraw : mode === 'debt' ? (debtDraft.action === 'repay' ? copy.saveDebtPayment : copy.saveNewDebt) : copy.save[mode]}
        </Button>
      </div>
    </div>
  )

  const shortcuts = !editing && (
    <div className="flex flex-wrap justify-center gap-x-4 text-sm font-bold">
      {mode === 'transfer' ? (
        <button type="button" onClick={() => switchMode('expense')} className="min-h-9 text-accent">
          {copy.newTitle.expense}
        </button>
      ) : (
        <button type="button" onClick={() => switchMode('transfer')} className="min-h-9 text-accent">
          {copy.withdrawShortcut}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          closeTransactionSheet()
          // Carry over what's been typed, so the price doesn't need entering twice.
          const query = new URLSearchParams()
          if (amount > 0) query.set('price', String(amount))
          if (mode === 'expense' && categoryId) query.set('category', categoryId)
          navigate(`/worth-it${query.size ? `?${query}` : ''}`)
        }}
        className="min-h-9 text-accent"
      >
        {copy.worthItShortcut}
      </button>
    </div>
  )

  return (
    <BottomSheet
      open={open}
      onOpenChange={(isOpen) => !isOpen && closeTransactionSheet()}
      title={mode === 'expense' && refund ? (editing ? t.refunds.editTitle : t.refunds.newTitle) : editing ? (editing.splitId ? t.refunds.splitEditTitle : copy.editTitle[mode]) : mode === 'goal' && withdraw ? copy.withdrawTitle : mode === 'debt' && debtDraft.action === 'repay' ? t.debts.logPayment : copy.newTitle[mode]}
      footer={footer}
      onKeyDown={onKeyDown}
      wide
    >
      {/* On a phone the keypad leaves little room, so what every entry needs comes first: the category, then the bill row and note. From `lg` the sheet opens up into two columns and everything is in view. */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:space-y-0">
        <div className="min-w-0 space-y-4">
          {!editing && mode !== 'transfer' && (
            <SegmentedControl
              label={copy.tabsLabel}
              value={mode}
              onChange={switchMode}
              options={[
                { value: 'expense', label: copy.tabs.expense },
                { value: 'income', label: copy.tabs.income },
                { value: 'goal', label: copy.tabs.goal },
                { value: 'debt', label: copy.tabs.debt },
              ]}
            />
          )}

          {stacked && quickField}

          <div>
            {typing ? (
              <AmountInput
                autoFocus
                size="lg"
                aria-label={copy.amount}
                placeholder="0"
                value={digits === '' ? null : Number(digits)}
                onChange={(next) => {
                  setDigits(next === null ? '' : String(next))
                  setError(null)
                }}
                currency={amountCurrency}
                className="mb-1.5"
              />
            ) : (
              <AmountDisplay digits={digits} currency={amountCurrency} picker={canChooseCurrency && <CurrencyPill value={currency} choices={currencyChoices} onChange={chooseCurrency} />} />
            )}
            <p className={clsx('flex min-h-5 items-start justify-center gap-1.5 text-center text-sm font-bold', big ? 'text-warn-ink' : 'text-accent')}>
              {big && <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
              {workHint}
            </p>
          </div>

          {/* A phone has the pill beside the amount; the typed amount on a computer shows its currency inside the field. */}
          {canChooseCurrency && typing && (
            <div className="mx-auto w-52 max-w-full">
              <Select aria-label={copy.currency} value={currency} onChange={(e) => chooseCurrency(e.target.value)}>
                {currencyChoices.map((code) => (
                  <option key={code} value={code}>
                    {t.settings.currencies[code] ?? code}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {quantityField}

          {stacked ? (
            <>
              {categoryField}
              {billRow}
              {fundRow}
            </>
          ) : (
            <>
              {billList}
              {fundRow}
            </>
          )}

          {mode === 'debt' && !editing && (
            <DebtFields
              draft={debtDraft}
              onChange={updateDebtDraft}
              openDebts={openDebts}
              debtId={debtId}
              onPickDebt={pickDebt}
              people={live(debts).filter((d) => !d.archived && (debtOwed(d, transactions) > 0 || d.repeats?.some((r) => !r.stoppedAt)))}
              onPickPerson={(debt) => {
                updateDebtDraft({ person: debt.person, repeatId: undefined })
                setCurrency(debt.currency ?? main)
              }}
              items={
                newDebtTarget && debtDraft.action !== 'repay'
                  ? debtItems(newDebtTarget).map((item) => ({
                      name: item.name,
                      amount: debtMoney(newDebtTarget, item.amount),
                      onPick: () => {
                        setDigits(String(item.amount))
                        setNote(item.name)
                        updateDebtDraft({ repeatId: item.repeatId, repeats: false })
                      },
                    }))
                  : []
              }
              payAll={
                paidDebt && !clearsNeeded && debtOwed(paidDebt, transactions) > 0
                  ? {
                      label: copy.payAll(debtMoney(paidDebt, debtOwed(paidDebt, transactions))),
                      onClick: () => {
                        setDigits(String(debtOwed(paidDebt, transactions)))
                        setError(null)
                      },
                    }
                  : undefined
              }
              owedLine={newDebtTarget && debtOwed(newDebtTarget, transactions) > 0 ? copy.debtOwed[newDebtTarget.direction](newDebtTarget.person, debtMoney(newDebtTarget, debtOwed(newDebtTarget, transactions))) : null}
              personError={debtErrors.person}
            />
          )}

          {(mode === 'expense' || mode === 'income') && noteField}
          {(mode === 'expense' || mode === 'income') && tagField}
          {saveItemField}
          {refundToggle}
          {/* Side by side while the split is closed, so neither ends up under the keypad's edge. */}
          {splitLines ? splitField : (splitField || moneyBack) && <div className="flex flex-wrap gap-2">{splitField}{moneyBack}</div>}
        </div>

        <div className="min-w-0 space-y-4">
          {!stacked && quickField}
          {!stacked && categoryField}

          {mode === 'goal' &&
            (goalChoices.length > 0 ? (
              <div className="space-y-3">
                <SegmentedControl
                  label={copy.goalDirectionLabel}
                  value={withdraw ? 'out' : 'in'}
                  onChange={(direction) => {
                    setWithdraw(direction === 'out')
                    setError(null)
                  }}
                  options={[
                    { value: 'in', label: copy.goalDirections.in },
                    { value: 'out', label: copy.goalDirections.out },
                  ]}
                />
                <div role="group" aria-label={copy.goal} className="flex flex-wrap gap-2">
                  {goalChoices.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      aria-pressed={goal.id === goalId}
                      onClick={() => {
                        setGoalId(goal.id)
                        setError(null)
                      }}
                      className={chipClass(goal.id === goalId)}
                    >
                      <Icon name={goal.icon} className="size-4" />
                      {goal.name}
                    </button>
                  ))}
                </div>
                {selectedGoal && (
                  <p className="text-sm text-muted">{copy.goalHolds(money(goalSaved(selectedGoal, transactions)), selectedGoal.name)}</p>
                )}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-[0.9375rem] text-ink-2">
                {copy.noGoals}{' '}
                <Link to="/plan/goals?add=1" onClick={closeTransactionSheet} className="font-bold text-accent">
                  {copy.addGoal}
                </Link>
              </p>
            ))}

          {mode === 'debt' &&
            editing &&
            (debtChoices.length > 0 ? (
              <div className="space-y-3">
                <div role="group" aria-label={copy.debtLabel} className="flex flex-wrap gap-2">
                  {debtChoices.map((debt) => (
                    <button
                      key={debt.id}
                      type="button"
                      aria-pressed={debt.id === debtId}
                      onClick={() => pickDebt(debt.id)}
                      className={chipClass(debt.id === debtId)}
                    >
                      {debt.person}
                    </button>
                  ))}
                </div>
                {selectedDebt && (
                  <>
                    <SegmentedControl
                      label={copy.debtMoveLabel}
                      value={repay ? 'repay' : 'grow'}
                      onChange={(move) => {
                        setRepay(move === 'repay')
                        setError(null)
                      }}
                      options={[
                        { value: 'repay', label: copy.debtMoves[selectedDebt.direction].repay },
                        { value: 'grow', label: copy.debtMoves[selectedDebt.direction].grow },
                      ]}
                    />
                    <p className="text-sm text-muted">{copy.debtOwed[selectedDebt.direction](selectedDebt.person, debtMoney(selectedDebt, debtOwed(selectedDebt, transactions)))}</p>
                  </>
                )}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-[0.9375rem] text-ink-2">
                {copy.noDebts}
              </p>
            ))}

          {mode === 'transfer' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{copy.from}</span>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {walletOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{copy.to}</span>
                <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {walletOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          ) : null}
          {exchanging && (
            <Field label={copy.arrived(currencySymbol(codeOfWallet(toAccountId)))} htmlFor={`${formId}-arrived`}>
              <AmountInput
                id={`${formId}-arrived`}
                value={toAmount}
                onChange={(next) => {
                  setToAmount(next)
                  setError(null)
                }}
                currency={codeOfWallet(toAccountId)}
              />
            </Field>
          )}

          {mode !== 'expense' && mode !== 'income' && noteField}
          <label className="relative block">
            <span className="sr-only">{copy.date}</span>
            <CalendarDays aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass({ className: 'min-h-11 ps-9' })} />
          </label>
          {mode === 'debt' && !editing && debtDraft.action !== 'repay' && <DebtOptions draft={debtDraft} onChange={updateDebtDraft} currency={profile.currency} monthlyError={debtErrors.monthly} />}
          {shortcuts}
        </div>
      </div>
    </BottomSheet>
  )
}
