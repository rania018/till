import { Cell, Pie, PieChart } from 'recharts'
import { t } from '../../i18n'
import { formatMoney } from '../../lib/money'
import type { CategorySpend } from '../../lib/stats'
import type { Category, ID } from '../../types'

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`

interface ShareRingProps {
  rows: CategorySpend[]
  categories: Category[]
  currency: string
  /** The category pointed at, here or in the ranking beside it. */
  active: ID | null
  onActive: (id: ID | null) => void
  onSelect: (id: ID) => void
  size?: number
  /** Each slice's colour: main categories wear their pastel. One brand colour when left out. */
  colorOf?: (id: ID) => string
}

/**
 * Each category's share of spending as a ring, in the one brand color: the slice pointed at
 * lights up, here and in its row, and the middle says what it is. The ranking beside it carries
 * the exact figures, since slices of close size are hard to compare by eye.
 */
export function ShareRing({ rows, categories, currency, active, onActive, onSelect, size = 220, colorOf }: ShareRingProps) {
  const copy = t.stats.ring
  const total = rows.reduce((sum, r) => sum + r.spent, 0)
  const shown = rows.find((r) => r.categoryId === active)
  const name = (id: ID) => categories.find((c) => c.id === id)?.name ?? ''
  const summary = rows.map((r) => copy.label(name(r.categoryId), percent(r.share), formatMoney(r.spent, currency))).join('. ')

  if (rows.length === 0) return null
  return (
    <figure className="relative mx-auto shrink-0" style={{ width: size, height: size }} onMouseLeave={() => onActive(null)}>
      <div role="img" aria-label={`${copy.title}. ${summary}`} dir="ltr">
        <PieChart width={size} height={size}>
          <Pie
            data={rows}
            dataKey="spent"
            nameKey="categoryId"
            innerRadius={size * 0.34}
            outerRadius={size * 0.48}
            startAngle={90}
            endAngle={-270}
            paddingAngle={rows.length > 1 ? 1.2 : 0}
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
            onMouseEnter={(_, index) => onActive(rows[index]?.categoryId ?? null)}
            onClick={(_, index) => rows[index] && onSelect(rows[index].categoryId)}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {rows.map((r) => (
              <Cell key={r.categoryId} fill={colorOf ? colorOf(r.categoryId) : 'var(--color-accent)'} fillOpacity={active === null || active === r.categoryId ? 1 : 0.28} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <figcaption aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <span className="max-w-[60%]">
          <span className="block truncate text-xs font-semibold text-muted">{shown ? name(shown.categoryId) : copy.total}</span>
          <span className="block text-lg font-extrabold leading-tight">{formatMoney(shown ? shown.spent : total, currency)}</span>
          {shown && <span className="block text-xs font-bold text-muted">{percent(shown.share)}</span>}
        </span>
      </figcaption>
    </figure>
  )
}
