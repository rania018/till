import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { t } from '../../i18n'
import { currencySymbol, formatCompact, formatMoney } from '../../lib/money'
import type { NetWorthPoint } from '../../lib/netWorth'
import { niceTicks } from '../../lib/stats'
import { ChartCard, TooltipBox } from '../stats/chartParts'
import { AXIS_TICK, FLOW, GRID_STROKE } from '../stats/chartTheme'

/** Net worth at the end of each month, in the main currency. Recharts is big, so only lazily loaded pages use this. */
export function NetWorthChart({ points, currency }: { points: NetWorthPoint[]; currency: string }) {
  const copy = t.netWorth
  const money = (amount: number) => formatMoney(amount, currency)
  const rows = points.map((p) => ({ total: p.row.total, label: t.format.month(p.date), date: t.format.date(p.date) }))
  const totals = rows.map((r) => r.total)
  const yTicks = niceTicks(Math.min(0, ...totals), Math.max(0, ...totals))
  const max = Math.max(...yTicks.map(Math.abs))
  const color = FLOW.income

  return (
    <ChartCard
      title={copy.historyTitle}
      note={copy.historyNote(currencySymbol(currency))}
      summary={copy.historySummary(money(rows[0].total), money(rows[rows.length - 1].total))}
      table={{ caption: copy.historyTitle, columns: [copy.month, copy.title], rows: rows.map((r) => [r.date, money(r.total)]) }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={rows.length > 6 ? 1 : 0} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} ticks={yTicks} domain={[yTicks[0], yTicks[yTicks.length - 1]]} tickFormatter={(v: number) => formatCompact(v, max)} />
          {yTicks[0] < 0 && <ReferenceLine y={0} stroke="var(--color-muted)" />}
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !row) return null
              return <TooltipBox title={row.date} rows={[{ label: copy.title, value: money(row.total), color, mark: 'line' }]} />
            }}
          />
          <Line dataKey="total" name={copy.title} stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color, stroke: 'var(--color-surface)', strokeWidth: 1 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
