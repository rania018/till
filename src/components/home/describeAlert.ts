import type { ReactNode } from 'react'
import { createElement, Fragment } from 'react'
import { t } from '../../i18n'
import type { Alert } from '../../lib/alerts'
import { formatMoney } from '../../lib/money'
import { nameOf } from '../../lib/transactions'
import type { Bill, Category, ISODate } from '../../types'

export interface AlertContext {
  categories: Category[]
  bills: Bill[]
  currency: string
  today: ISODate
}

/** The sentence, the name in it to show in bold, and where tapping goes. */
export function describeAlert(alert: Alert, { categories, bills, currency, today }: AlertContext): { text: string; subject?: string; to: string } {
  const money = (amount: number) => formatMoney(amount, currency)
  const copy = t.alerts
  switch (alert.kind) {
    case 'category-over': {
      const name = nameOf(categories, alert.categoryId)
      return { text: copy.categoryOver(name, money(alert.overBy)), subject: name, to: `/activity/category/${alert.categoryId}` }
    }
    case 'category-near': {
      const name = nameOf(categories, alert.categoryId)
      return { text: copy.categoryNear(name, alert.percent), subject: name, to: `/activity/category/${alert.categoryId}` }
    }
    case 'budget-over':
      return { text: copy.budgetOver(money(alert.overBy)), to: '/plan/budget' }
    case 'budget-near':
      return { text: copy.budgetNear(alert.percent), to: '/plan/budget' }
    case 'too-fast':
      return { text: copy.tooFast(alert.usedPercent, alert.elapsedPercent), to: '/plan/budget' }
    case 'bill-due':
    case 'bill-overdue': {
      const name = nameOf(bills, alert.billId)
      const describeBill = alert.kind === 'bill-due' ? copy.billDue : copy.billOverdue
      return { text: describeBill(name, money(alert.amount), t.format.nearDay(alert.dueDate, today)), subject: name, to: '/plan/bills' }
    }
    case 'debt-due':
    case 'debt-overdue': {
      const overdue = alert.kind === 'debt-overdue'
      const describeDebt = alert.direction === 'borrowed' ? (overdue ? copy.debtPayOverdue : copy.debtPayDue) : overdue ? copy.debtBackOverdue : copy.debtBackDue
      return { text: describeDebt(alert.person, money(alert.amount), t.format.nearDay(alert.dueDate, today)), subject: alert.person, to: `/plan/debts/${alert.debtId}` }
    }
    case 'cash-check':
      return { text: alert.daysSince === null ? copy.cashNever : copy.cashCheck(alert.daysSince), to: `/wallets?count=${alert.accountId}` }
    case 'wishlist-ready': {
      const name = alert.name || t.worthIt.unnamed
      return { text: copy.wishlistReady(name, alert.count), subject: alert.count === 1 ? name : undefined, to: '/worth-it/wishlist' }
    }
    case 'set-payday':
      return { text: copy.setPayday, to: '/settings/pay' }
  }
}

/** Puts the first `subject` in the sentence in bold. The sentence stays whole, so translations keep their word order. */
export function emphasize(text: string, subject?: string): ReactNode {
  const at = subject ? text.indexOf(subject) : -1
  if (!subject || at === -1) return text
  return createElement(
    Fragment,
    null,
    text.slice(0, at),
    createElement('b', { className: 'font-extrabold' }, subject),
    text.slice(at + subject.length),
  )
}
