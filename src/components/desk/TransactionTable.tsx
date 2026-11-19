import clsx from 'clsx'
import { t } from '../../i18n'
import { entryMoney } from '../../lib/currency'
import { formatMoney } from '../../lib/money'
import type { NoMoneyEntry } from '../../lib/debts'
import { direction, groupByDay } from '../../lib/transactions'
import type { ID, ISODate, Transaction } from '../../types'
import { Icon } from '../ui/Icon'
import { describeNoMoneyEntry, describeTransaction, type TransactionNames } from '../transactions/describe'
import { editTransaction } from '../transactions/sheetStore'
import { fromXl, rowClass, stretchedClass, tableClass, tdClass, thClass } from './tableStyles'

interface TransactionTableProps {
  /** Newest first. */
  transactions: Transaction[]
  names: TransactionNames
  currency: string
  /** When listing one wallet, transfers show as money in or out of it. */
  viewAccountId?: ID
  today: ISODate
  yesterday: ISODate
  /** Adds the day's total, for a full ledger. Short lists leave it out. */
  dayTotals?: boolean
  stickyHeader?: boolean
  /** Debt amounts with no money moved, listed under their day. */
  noMoney?: NoMoneyEntry[]
  onOpenNoMoney?: (entry: NoMoneyEntry) => void
}

/** Entries in columns, one line each. The date shows once per day. Click a row to edit it. */
export function TransactionTable({ transactions, names, currency, viewAccountId, today, yesterday, dayTotals, stickyHeader, noMoney, onOpenNoMoney }: TransactionTableProps) {
  const copy = t.desk.table
  const th = (right?: boolean) => thClass({ right, sticky: stickyHeader })
  const dayLabel = (date: ISODate) => (date === today ? t.activity.today : date === yesterday ? t.activity.yesterday : t.format.shortDayOrDate(date, today))

  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th scope="col" className={th()}>
            {copy.date}
          </th>
          <th scope="col" className={th()}>
            {copy.description}
          </th>
          <th scope="col" className={th()}>
            {copy.details}
          </th>
          <th scope="col" className={th()}>
            {copy.wallet}
          </th>
          <th scope="col" className={th(true)}>
            {copy.amount}
          </th>
          {dayTotals && (
            <th scope="col" className={clsx(th(true), fromXl)}>
              {copy.dayTotal}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {groupByDay(transactions, currency, noMoney).flatMap((group) => {
          const rows = [
            ...group.transactions.map((tx) => {
              const way = direction(tx, viewAccountId)
              const shown = entryMoney(tx, viewAccountId, currency)
              return {
                id: tx.id,
                description: describeTransaction(tx, names, { main: currency }),
                way,
                amount: formatMoney(way === 'out' ? -shown.amount : shown.amount, shown.currency, { signed: way === 'in' }),
                open: () => editTransaction(tx),
              }
            }),
            ...group.noMoney.map((entry) => ({
              id: entry.id,
              description: describeNoMoneyEntry(entry),
              way: 'move' as const,
              amount: formatMoney(entry.amount, entry.debt.currency ?? currency),
              open: () => onOpenNoMoney?.(entry),
            })),
          ]
          return rows.map(({ id, description: { title, detail, wallet, icon, tint }, way, amount, open }, index) => {
            const last = index === rows.length - 1
            // Only the end of a day gets a rule, so a day's entries read as one block.
            const cell = (options: Parameters<typeof tdClass>[0] = {}) => clsx(tdClass(options), !last && 'border-b-transparent')
            return (
              <tr key={id} className={rowClass}>
                <td className={clsx(cell({ muted: true }), 'w-32 whitespace-nowrap font-semibold')}>{index === 0 && dayLabel(group.date)}</td>
                <td className={clsx(cell(), 'max-w-0')}>
                  <button type="button" onClick={open} className={clsx(stretchedClass, 'flex w-full min-w-0 items-center gap-3')}>
                    <span className="shrink-0 text-accent" style={tint ? { color: tint } : undefined}>
                      <Icon name={icon} className="size-[1.125rem]" />
                    </span>
                    <span className="truncate">{title}</span>
                  </button>
                </td>
                <td className={clsx(cell({ muted: true }), 'max-w-0 truncate')}>{detail}</td>
                <td className={clsx(cell({ muted: true }), 'w-32 whitespace-nowrap xl:w-48')}>{wallet}</td>
                <td className={clsx(cell({ right: true, strong: true }), 'w-36', way === 'in' ? 'text-good-ink' : way === 'move' && 'text-muted')}>
                  {amount}
                </td>
                {dayTotals && (
                  <td className={clsx(cell({ right: true, muted: true }), fromXl, 'w-36')}>{index === 0 && group.transactions.length > 1 && group.spent > 0 && formatMoney(group.spent, currency)}</td>
                )}
              </tr>
            )
          })
        })}
      </tbody>
    </table>
  )
}
