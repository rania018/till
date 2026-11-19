import { Plus, Tag, X } from 'lucide-react'
import { t } from '../../i18n'
import { formatMoney } from '../../lib/money'
import type { TagSummary } from '../../lib/tags'
import type { Category } from '../../types'
import { openTransactionSheet } from '../transactions/sheetStore'
import { Button, IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'

const TOP = 5

/** What a tag adds up to, over every pay cycle: the answer to "what did the wedding cost?". */
export function TagCard({ summary, categories, currency, showCategories = true, onClose }: { summary: TagSummary; categories: Category[]; currency: string; showCategories?: boolean; /** Back to the whole list. */ onClose?: () => void }) {
  const copy = t.tags
  const money = (amount: number) => formatMoney(amount, currency)
  const span = summary.first === summary.last ? t.format.date(summary.first) : t.format.range(summary.first, summary.last)
  const top = summary.byCategory.slice(0, TOP)
  const peak = top[0]?.spent ?? 0
  const others = summary.otherCurrencies.filter((row) => row.spent !== 0 || row.received !== 0)

  return (
    <section aria-label={summary.name} className="rounded-2xl border border-line bg-surface p-4 desk:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Tag className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold">{summary.name}</h2>
          <p className="text-sm text-muted">{copy.entriesOver(summary.count, span)}</p>
        </div>
        {onClose && <IconButton icon={X} variant="ghost" label={copy.clear(summary.name)} onClick={onClose} className="-me-2 -mt-1" />}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs font-semibold text-muted">{copy.spent}</dt>
          <dd className="text-2xl font-extrabold tracking-tight tabular-nums">{money(summary.spent)}</dd>
        </div>
        {summary.received > 0 && (
          <div>
            <dt className="text-xs font-semibold text-muted">{copy.received}</dt>
            <dd className="text-2xl font-extrabold tracking-tight tabular-nums text-good-ink">{money(summary.received)}</dd>
          </div>
        )}
      </dl>
      {summary.received > 0 && <p className="mt-1 text-sm font-semibold text-ink-2">{copy.net(money(summary.spent - summary.received))}</p>}
      {others.length > 0 && <p className="mt-1 text-sm text-muted">{copy.otherCurrencies(others.map((row) => formatMoney(row.spent, row.currency)).join(' · '))}</p>}

      {showCategories && top.length > 1 && (
        <ul aria-label={copy.byCategory} className="mt-4 space-y-2.5">
          {top.map((row) => {
            const category = categories.find((c) => c.id === row.categoryId)
            return (
              <li key={row.categoryId}>
                <span className="flex items-center gap-2 text-sm">
                  <Icon name={category?.icon ?? 'package'} className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{category?.name}</span>
                  <span className="shrink-0 font-bold tabular-nums">{money(row.spent)}</span>
                </span>
                <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${peak > 0 ? (row.spent / peak) * 100 : 0}%` }} />
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <Button variant="secondary" size="sm" icon={Plus} className="mt-4" onClick={() => openTransactionSheet('expense', { tags: [summary.name] })}>
        {copy.addTo(summary.name)}
      </Button>
    </section>
  )
}
