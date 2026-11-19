import clsx from 'clsx'
import { t } from '../../i18n'
import { entryMoney } from '../../lib/currency'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { direction, type Direction } from '../../lib/transactions'
import type { NoMoneyEntry } from '../../lib/debts'
import type { ID, Transaction } from '../../types'
import { Icon } from '../ui/Icon'
import { describeNoMoneyEntry, describeTransaction, type Description, type TransactionNames } from './describe'
import { editTransaction } from './sheetStore'

interface TransactionRowProps {
  transaction: Transaction
  names: TransactionNames
  currency: string
  /** When listing one wallet, transfers show as money in or out of it. */
  viewAccountId?: ID
  /** On a goal's page: deposits are money in, withdrawals money out. */
  inGoal?: boolean
  /** In the Activity ledger: from `xl` up, details and wallet get their own aligned columns. */
  columns?: boolean
  /** In a list that isn't grouped by day: the date comes first in the details. */
  dated?: boolean
  /** In a narrow card on a computer: the details go under the name instead of beside it. */
  stacked?: boolean
}

/** One line in a list. Tap to edit. */
export function TransactionRow({ transaction, names, currency, viewAccountId, inGoal, columns, dated, stacked }: TransactionRowProps) {
  const way = inGoal ? (transaction.type === 'goal-deposit' ? 'in' : 'out') : direction(transaction, viewAccountId)
  // On a fund's page, an expense shows what the fund paid of it.
  const shown = inGoal && transaction.type === 'expense' ? { amount: transaction.fundAmount ?? 0, currency } : entryMoney(transaction, viewAccountId, currency)
  const amount = way === 'out' ? -shown.amount : shown.amount
  const description = describeTransaction(transaction, names, { inGoal, main: currency })
  const day = dated ? t.format.shortDayOrDate(transaction.date, todayISO()) : ''

  return (
    <EntryRow
      description={dated ? { ...description, subtitle: description.subtitle ? `${day} · ${description.subtitle}` : day } : description}
      amount={formatMoney(amount, shown.currency, { signed: way === 'in' })}
      tone={way}
      columns={columns}
      stacked={stacked}
      onClick={() => editTransaction(transaction)}
    />
  )
}

/** A debt amount with no money moved, in the same list. Grey and unsigned: it never touched a wallet. */
export function NoMoneyRow({ entry, currency, columns, onClick }: { entry: NoMoneyEntry; currency: string; columns?: boolean; onClick: () => void }) {
  return <EntryRow description={describeNoMoneyEntry(entry)} amount={formatMoney(entry.amount, entry.debt.currency ?? currency)} tone="move" columns={columns} onClick={onClick} />
}

interface EntryRowProps {
  description: Description
  amount: string
  tone: Direction
  columns?: boolean
  stacked?: boolean
  onClick: () => void
}

function EntryRow({ description: { title, subtitle, detail, wallet, icon, tint }, amount, tone, columns, stacked, onClick }: EntryRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-surface-2', columns && 'xl:py-1.5', 'desk:py-2')}
    >
      <span
        className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', tint ? 'text-ink' : 'bg-accent-soft text-accent', columns && 'xl:size-9', 'desk:size-9')}
        style={tint ? { background: `color-mix(in oklab, ${tint} 50%, transparent)` } : undefined}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <span className={clsx('min-w-0 flex-1', columns && 'xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] xl:items-center xl:gap-4', !stacked && 'desk:flex desk:items-baseline desk:gap-3')}>
        <span className={clsx('block truncate font-bold desk:font-semibold', !stacked && 'desk:shrink-0')}>{title}</span>
        <span className={clsx('block truncate text-sm text-muted desk:min-w-0', columns && 'xl:hidden')}>{subtitle}</span>
        {columns && <span className="hidden truncate text-sm text-muted xl:block">{detail}</span>}
        {columns && <span className="hidden truncate text-sm text-muted xl:block">{wallet}</span>}
      </span>
      <span className={clsx('shrink-0 font-extrabold tabular-nums', tone === 'in' ? 'text-good-ink' : tone === 'move' ? 'text-muted' : 'text-ink', columns && 'xl:w-28 xl:text-end')}>
        {amount}
      </span>
    </button>
  )
}
