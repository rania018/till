import clsx from 'clsx'
import { categoryColor } from '../../lib/categoryTree'
import type { Category, ID } from '../../types'
import { Icon } from './Icon'

/** A category's swatch: its icon on its main category's pastel. */
export function CategoryBadge({ categories, id, size = 'md' }: { categories: Category[]; id: ID | undefined; size?: 'sm' | 'md' }) {
  const category = categories.find((c) => c.id === id)
  const kindIncome = category?.kind === 'income'
  return (
    <span
      className={clsx('grid shrink-0 place-items-center text-ink', size === 'sm' ? 'size-7 rounded-lg' : 'size-9 rounded-xl')}
      style={{ background: kindIncome ? 'var(--color-accent-soft)' : `color-mix(in oklab, ${categoryColor(categories, id)} 55%, transparent)` }}
    >
      <Icon name={category?.icon ?? 'package'} className={size === 'sm' ? 'size-4' : 'size-[1.125rem]'} />
    </span>
  )
}
