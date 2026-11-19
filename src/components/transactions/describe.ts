import { t } from '../../i18n'
import { debtMoveType, type NoMoneyEntry } from '../../lib/debts'
import { categoryColor } from '../../lib/categoryTree'
import { formatMoney, formatQuantity } from '../../lib/money'
import { nameOf, type Names } from '../../lib/transactions'
import type { Account, Category, Debt, Goal, Transaction } from '../../types'

export interface TransactionNames extends Names {
  categories: Category[]
  accounts: Account[]
  goals: Goal[]
  debts: Debt[]
}

export interface Description {
  title: string
  subtitle: string
  /** The subtitle split for a ledger's columns: everything but the wallet, and the wallet. */
  detail: string
  wallet: string
  /** Icon name for <Icon>. */
  icon: string
  /** A spending entry's colour: its main category's pastel. */
  tint?: string
}

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ')

/**
 * How a transaction reads in a list: a title, the details under it, and an icon.
 * On a goal's own page (`inGoal`), goal moves read as "Put aside" and "Taken out".
 */
export function describeTransaction(tx: Transaction, names: TransactionNames, options: { inGoal?: boolean; main?: string } = {}): Description {
  const category = names.categories.find((c) => c.id === tx.categoryId)
  const wallet = nameOf(names.accounts, tx.accountId)
  const extra = tx.source === 'salary' ? t.transactions.onPayday : tx.source === 'cash-count' ? t.transactions.fromCashCount : undefined
  // A note can be a list, one item per line: the first line stands for it, the rest are counted.
  const [firstLine, ...rest] = noteLines(tx.note)
  // Bought several at once: the list says how many.
  const note = firstLine && tx.quantity && tx.quantity !== 1 ? `${firstLine} ×${formatQuantity(tx.quantity)}` : firstLine
  const more = rest.length > 0 ? t.transactions.moreLines(rest.length) : undefined

  if (tx.type === 'transfer') {
    const kindOf = (id: string | undefined) => names.accounts.find((a) => a.id === id)?.kind
    const withdrawal = kindOf(tx.accountId) === 'bank' && kindOf(tx.toAccountId) === 'cash'
    const route = t.transactions.route(wallet, nameOf(names.accounts, tx.toAccountId))
    const arrived = tx.toAmount !== undefined ? t.transactions.arrivedLine(formatMoney(tx.toAmount, tx.toCurrency ?? options.main)) : undefined
    return {
      title: note || (withdrawal ? t.transactions.withdrawal : t.transactions.transfer),
      subtitle: join(route, arrived, more),
      detail: join(arrived, more),
      wallet: route,
      icon: 'arrow-left-right',
    }
  }

  if (tx.type === 'goal-deposit' || tx.type === 'goal-withdrawal') {
    const goal = names.goals.find((g) => g.id === tx.goalId)
    if (options.inGoal) {
      return {
        title: tx.type === 'goal-deposit' ? t.transactions.putAside : t.transactions.takenOut,
        subtitle: join(wallet, note, more),
        detail: join(note, more),
        wallet,
        icon: tx.type === 'goal-deposit' ? 'piggy-bank' : 'arrow-left-right',
      }
    }
    const way = goal?.fund ? (tx.type === 'goal-deposit' ? t.funds.toFund : t.funds.fromFund) : tx.type === 'goal-deposit' ? t.transactions.toGoal : t.transactions.fromGoal
    return {
      title: goal?.name ?? t.transactions.goal,
      subtitle: join(way, wallet, note, more),
      detail: join(way, note, more),
      wallet,
      icon: goal?.icon ?? 'target',
    }
  }

  if (tx.type === 'debt-in' || tx.type === 'debt-out') {
    const debt = names.debts.find((d) => d.id === tx.debtId)
    const way = debt ? t.transactions.debtWays[tx.type][debt.direction] : undefined
    const cleared = tx.debtAmount !== undefined ? t.transactions.clearedLine(formatMoney(tx.debtAmount, debt?.currency ?? options.main)) : undefined
    return {
      title: debt?.person ?? t.transactions.debtEntry,
      subtitle: join(way, cleared, wallet, note, more),
      detail: join(way, cleared, note, more),
      wallet,
      icon: 'hand-coins',
    }
  }

  const categoryName = category?.name ?? ''
  // Paid from a fund: all of it says the fund instead of the wallet, part of it says how much.
  const fund = tx.type === 'expense' && tx.fundAmount ? names.goals.find((g) => g.id === tx.goalId) : undefined
  const fromFund = fund && !options.inGoal ? t.funds.fromLine(formatMoney(tx.fundAmount!, tx.currency ?? options.main), fund.name) : undefined
  // On the fund's own page its name would only repeat the page's title.
  const paidBy = fund && !options.inGoal && tx.fundAmount! >= tx.amount ? fund.name : wallet
  // Money back, or one part of a purchase split across categories: said first, so it isn't read as an ordinary entry.
  const kind = tx.type === 'refund' ? t.refunds.tag : tx.splitId ? t.refunds.splitTag : undefined
  const tagged = tx.tags?.length ? tx.tags.join(', ') : undefined
  return {
    title: note || categoryName,
    subtitle: join(kind, note ? categoryName : undefined, tagged, more, fromFund && paidBy === wallet ? fromFund : undefined, paidBy, extra),
    detail: join(kind, note ? categoryName : undefined, tagged, more, fromFund && paidBy === wallet ? fromFund : undefined, extra),
    wallet: paidBy,
    icon: category?.icon ?? 'package',
    tint: category?.kind === 'expense' ? categoryColor(names.categories, category.id) : undefined,
  }
}

/** How a debt amount with no money moved reads in a list. It has no wallet, and says so. */
export function describeNoMoneyEntry({ debt, charge, note: fullNote }: NoMoneyEntry): Description {
  const way = t.transactions.debtWays[debtMoveType(debt, false)][debt.direction]
  const [note, ...rest] = noteLines(fullNote)
  const more = rest.length > 0 ? t.transactions.moreLines(rest.length) : undefined
  const detail = join(way, note, more, charge ? t.debts.addedNoMoney : t.debtPage.beforeTracking)
  return { title: debt.person, subtitle: detail, detail, wallet: '', icon: 'hand-coins' }
}

/** The non-empty lines of a note, trimmed. */
export function noteLines(note: string | undefined): string[] {
  return (note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
