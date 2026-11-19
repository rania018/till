/**
 * Chart colors in their fixed order, validated for color blindness against both
 * themes' surfaces (the dataviz palette checks).
 */
export const SERIES = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)'] as const

/** One color for each kind of money, everywhere it shows. The categories use the brand color, one hue each would be too many to tell apart. */
export const FLOW = {
  income: 'var(--color-accent)',
  bills: SERIES[0],
  debts: SERIES[1],
  goals: SERIES[2],
  everyday: SERIES[3],
  other: 'var(--color-series-other)',
} as const

/** Recessive axes: muted text, hairline rules, no tick marks. */
export const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }
export const GRID_STROKE = 'var(--color-line)'
