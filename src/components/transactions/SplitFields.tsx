import { Plus, Split, X } from 'lucide-react'
import { t } from '../../i18n'
import { formatMoney } from '../../lib/money'
import type { Category } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { Button, IconButton } from '../ui/Button'
import { Select } from '../ui/Select'
import { splitRest, type SplitLine } from './splitDraft'

interface SplitFieldsProps {
  total: number
  currency: string
  /** The category picked in the grid: it gets the rest. */
  firstCategory?: Category
  lines: SplitLine[]
  categories: Category[]
  onChange: (lines: SplitLine[]) => void
  onStop: () => void
}

/** One purchase across several categories: the grid's category takes the rest, each line here takes its amount. */
export function SplitFields({ total, currency, firstCategory, lines, categories, onChange, onStop }: SplitFieldsProps) {
  const copy = t.refunds
  const rest = splitRest(total, lines)
  const update = (index: number, patch: Partial<SplitLine>) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <Split aria-hidden className="size-4 text-muted" />
        {copy.splitTitle}
      </p>
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-semibold">{firstCategory ? firstCategory.name : copy.splitPickFirst}</span>
        <span className={rest > 0 ? 'shrink-0 font-bold tabular-nums' : 'shrink-0 font-bold tabular-nums text-crit-ink'}>{copy.splitRest(formatMoney(Math.max(0, rest), currency))}</span>
      </p>
      {lines.map((line, index) => (
        <div key={line.id ?? `new-${index}`} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select aria-label={copy.splitCategoryLabel(index + 2)} value={line.categoryId ?? ''} onChange={(e) => update(index, { categoryId: e.target.value || undefined })}>
              <option value="">{copy.splitChoose}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <AmountInput aria-label={copy.splitAmountLabel(index + 2)} value={line.amount} onChange={(amount) => update(index, { amount })} currency={currency} className="w-32 shrink-0" />
          <IconButton icon={X} label={copy.splitRemove} variant="ghost" onClick={() => onChange(lines.filter((_, i) => i !== index))} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...lines, { amount: null }])}>
          {copy.splitAdd}
        </Button>
        <Button size="sm" variant="ghost" onClick={onStop}>
          {copy.splitStop}
        </Button>
      </div>
    </div>
  )
}
