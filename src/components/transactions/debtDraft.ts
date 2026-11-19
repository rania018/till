import type { DebtDirection, ID, ISODate } from '../../types'

/** What the Debt tab is logging: money lent or borrowed, or a payment on a debt that's already there. */
export type DebtAction = DebtDirection | 'repay'

/** The Debt tab's own fields. Amount, wallet, date and note are shared with the rest of the form. */
export interface DebtDraft {
  action: DebtAction
  person: string
  /** Nothing moved through a wallet: an older debt, or something bought on credit. */
  noMoney: boolean
  dueDate: ISODate | ''
  instalments: boolean
  monthly: number | null
  firstPayment: ISODate
  /** Starts something that adds to the debt every month. No money moves. */
  repeats: boolean
  /** Picked from what's already on the debt: another month of it. No money moves. */
  repeatId?: ID
}

export function newDebtDraft(today: ISODate, action: DebtAction = 'lent', person = ''): DebtDraft {
  return { action, person, noMoney: false, dueDate: '', instalments: false, monthly: null, firstPayment: today, repeats: false }
}
