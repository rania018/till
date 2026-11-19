import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { language, t } from '../../i18n'
import { formatCompact, formatMoney } from '../../lib/money'
import { niceTicks, type DebtBalance, type PacePoint, type TrendPoint } from '../../lib/stats'
import { ChartCard, TooltipBox, type LegendItem } from './chartParts'
import { AXIS_TICK, FLOW, GRID_STROKE } from './chartTheme'

// Arabic day labels spell out the month, and the last one mustn't be cut off at the chart's edge.
const LAST_DAY_ROOM = language === 'ar' ? 28 : 12
const axisMax = (values: number[]) => Math.max(0, ...values.map(Math.abs))

/** A point on a line: filled for a pay cycle that has ended, open for the one still running. */
function cycleDot(color: string) {
  return function Dot(props: { cx?: number; cy?: number; index?: number; payload?: { partial?: boolean } }) {
    const { cx, cy, index, payload } = props
    if (cx === undefined || cy === undefined) return <g key={index} />
    return <circle key={index} cx={cx} cy={cy} r={4} fill={payload?.partial ? 'var(--color-surface)' : color} stroke={payload?.partial ? color : 'var(--color-surface)'} strokeWidth={2} />
  }
}

/**
 * Income and spending per pay cycle as two lines, with the gap between them shaded: what was
 * left after spending, or in red how far spending went over. Clicking a pay cycle shows it.
 */
export function TrendChart({ points, currency, height = 210, onSelect }: { points: TrendPoint[]; currency: string; height?: number; onSelect?: (point: TrendPoint) => void }) {
  const copy = t.stats.trend
  const money = (amount: number) => formatMoney(amount, currency)
  const SPENT = 'var(--color-ink-2)'
  const rows = points.map((p) => ({
    ...p,
    label: t.format.month(p.cycle.start),
    range: t.format.range(p.cycle.start, p.cycle.end),
    keptBand: [p.spent, Math.max(p.spent, p.income)],
    overBand: [p.income, Math.max(p.income, p.spent)],
  }))
  const yTicks = niceTicks(0, Math.max(0, ...points.flatMap((p) => [p.income, p.spent])))
  const max = axisMax(yTicks)
  const highest = points.reduce((a, b) => (b.spent > a.spent ? b : a), points[0])
  const pick = (index: unknown) => {
    const point = points[Number(index)]
    if (point && onSelect) onSelect(point)
  }
  const legend: LegendItem[] = [
    { label: copy.income, color: FLOW.income, mark: 'line' },
    { label: copy.spent, color: SPENT, mark: 'line' },
    { label: copy.kept, color: 'color-mix(in oklab, var(--color-accent) 30%, transparent)' },
    { label: copy.over, color: 'color-mix(in oklab, var(--color-crit) 35%, transparent)' },
  ]
  const titleOf = (row: (typeof rows)[number]) => (row.partial ? copy.soFar(row.range) : row.range)

  return (
    <ChartCard
      title={copy.title}
      note={copy.note}
      legend={legend}
      summary={copy.summary(points.length, t.format.range(highest.cycle.start, highest.cycle.end), money(highest.spent))}
      table={{
        caption: copy.title,
        columns: [t.stats.table.cycle, copy.income, copy.spent, copy.kept, copy.saved],
        rows: rows.map((r) => [titleOf(r), money(r.income), money(r.spent), money(r.income - r.spent), money(r.saved)]),
        onRow: onSelect && ((index) => pick(index)),
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: 0 }} onClick={(state) => pick(state.activeTooltipIndex)} style={onSelect && { cursor: 'pointer' }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={rows.length > 6 ? 1 : 0} padding={{ left: 12, right: 4 }} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} tickFormatter={(v: number) => formatCompact(v, max)} />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !row) return null
              const left = row.income - row.spent
              return (
                <TooltipBox
                  title={titleOf(row)}
                  rows={[
                    { label: copy.income, value: money(row.income), color: FLOW.income, mark: 'line' },
                    { label: copy.spent, value: money(row.spent), color: SPENT, mark: 'line' },
                    { label: left >= 0 ? copy.kept : copy.over, value: money(Math.abs(left)), color: left >= 0 ? 'var(--color-accent)' : 'var(--color-crit)' },
                    { label: copy.saved, value: money(row.saved), color: FLOW.goals },
                  ]}
                />
              )
            }}
          />
          <Area dataKey="keptBand" stroke="none" fill="var(--color-accent)" fillOpacity={0.16} activeDot={false} isAnimationActive={false} />
          <Area dataKey="overBand" stroke="none" fill="var(--color-crit)" fillOpacity={0.2} activeDot={false} isAnimationActive={false} />
          <Line dataKey="spent" name={copy.spent} stroke={SPENT} strokeWidth={2} dot={cycleDot(SPENT)} activeDot={{ r: 5, fill: SPENT, stroke: 'var(--color-surface)', strokeWidth: 2 }} isAnimationActive={false} />
          <Line dataKey="income" name={copy.income} stroke={FLOW.income} strokeWidth={2} dot={cycleDot(FLOW.income)} activeDot={{ r: 5, fill: FLOW.income, stroke: 'var(--color-surface)', strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/** Share of income kept after spending and debts, one point per pay cycle that has ended: one still running has its bills to come. */
export function SavingsRateChart({ points, height = 170 }: { points: TrendPoint[]; height?: number }) {
  const copy = t.stats.rate
  const rows = points.filter((p) => !p.partial).map((p) => ({
    label: t.format.month(p.cycle.start),
    range: t.format.range(p.cycle.start, p.cycle.end),
    partial: p.partial,
    rate: p.savingsRate === null ? null : Math.round(p.savingsRate * 100),
  }))
  const known = rows.filter((r) => r.rate !== null)
  const rates = known.map((r) => r.rate ?? 0)
  const yTicks = niceTicks(Math.min(0, ...rates), Math.max(0, ...rates))
  const latest = known[known.length - 1]

  // Nothing to draw: no pay cycle has ended, or none that ended had income.
  if (known.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4 desk:p-6">
        <h2 className="text-sm font-extrabold">{copy.title}</h2>
        <p className="mt-2 text-sm text-ink-2">{rows.length === 0 ? copy.notYet : copy.noIncome}</p>
        <p className="mt-2 text-xs text-muted">{copy.note}</p>
      </section>
    )
  }

  return (
    <ChartCard
      title={copy.title}
      note={copy.note}
      summary={latest ? copy.summary(latest.range, `${latest.rate}%`) : copy.noIncome}
      table={{
        caption: copy.title,
        columns: [t.stats.table.cycle, copy.label],
        rows: rows.map((r) => [r.partial ? t.stats.trend.soFar(r.range) : r.range, r.rate === null ? copy.noIncomeShort : `${r.rate}%`]),
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={rows.length > 6 ? 1 : 0} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            ticks={yTicks}
            domain={[yTicks[0], yTicks[yTicks.length - 1]]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ReferenceLine y={0} stroke="var(--color-muted)" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !row) return null
              return (
                <TooltipBox
                  title={row.partial ? t.stats.trend.soFar(row.range) : row.range}
                  rows={[{ label: copy.label, value: row.rate === null ? copy.noIncomeShort : `${row.rate}%`, color: FLOW.goals }]}
                />
              )
            }}
          />
          <Line
            dataKey="rate"
            name={copy.label}
            stroke={FLOW.goals}
            strokeWidth={2}
            dot={{ r: 4, fill: FLOW.goals, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: FLOW.goals, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/** Flexible spending adding up through the cycle, against the straight line that ends exactly at the budget. */
export function PaceChart({ points, budget, currency, height = 190, onSelectDay }: { points: PacePoint[]; budget: number; currency: string; height?: number; onSelectDay?: (date: string) => void }) {
  const copy = t.stats.pace
  const money = (amount: number) => formatMoney(amount, currency)
  const yTicks = niceTicks(0, Math.max(budget, ...points.map((p) => p.spent ?? 0)))
  const max = axisMax(yTicks)
  const last = points.filter((p) => p.spent !== null).at(-1)
  const ticks = [1, Math.ceil(points.length / 2), points.length]
  const dateOf = (day: number) => points[day - 1]?.date ?? points[0].date
  const shown = points.filter((p) => p.spent !== null)
  const pickDay = (index: unknown) => {
    const point = points[Number(index)]
    if (point && point.spent !== null && onSelectDay) onSelectDay(point.date)
  }
  const legend: LegendItem[] = [
    { label: copy.spent, color: FLOW.everyday, mark: 'line' },
    { label: copy.pace, color: 'var(--color-muted)', mark: 'dash' },
  ]

  return (
    <ChartCard
      title={copy.title}
      note={copy.note}
      legend={legend}
      summary={last ? copy.summary(t.format.dayMonth(last.date), money(last.spent ?? 0), money(last.pace)) : copy.title}
      table={{
        caption: copy.title,
        columns: [t.stats.table.day, copy.spent, copy.pace],
        rows: shown.map((p) => [t.format.shortDay(p.date), money(p.spent ?? 0), money(p.pace)]),
        onRow: onSelectDay && ((index) => onSelectDay(shown[index].date)),
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 10, right: LAST_DAY_ROOM, bottom: 0, left: 0 }} onClick={(state) => pickDay(state.activeTooltipIndex)} style={onSelectDay && { cursor: 'pointer' }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[1, points.length]}
            ticks={ticks}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            tickFormatter={(day: number) => t.format.dayMonth(dateOf(day))}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            ticks={yTicks}
            domain={[0, yTicks[yTicks.length - 1]]}
            tickFormatter={(v: number) => formatCompact(v, max)}
          />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as PacePoint | undefined
              if (!active || !row) return null
              const paceRow = { label: copy.pace, value: money(row.pace), color: 'var(--color-muted)', mark: 'dash' as const }
              const spentRow = { label: copy.spent, value: money(row.spent ?? 0), color: FLOW.everyday, mark: 'line' as const }
              return <TooltipBox title={t.format.shortDay(row.date)} rows={row.spent === null ? [paceRow] : [spentRow, paceRow]} />
            }}
          />
          <Line dataKey="pace" name={copy.pace} stroke="var(--color-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
          <Line
            dataKey="spent"
            name={copy.spent}
            stroke={FLOW.everyday}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: FLOW.everyday, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/** Whether debts are shrinking: what was owed each way at the end of each pay cycle. */
export function OwedChart({ balances, currency, height = 170 }: { balances: DebtBalance[]; currency: string; height?: number }) {
  const copy = t.stats.debts
  const money = (amount: number) => formatMoney(amount, currency)
  const series = [
    { key: 'owed', label: t.debts.iOwe, color: FLOW.debts },
    { key: 'owedToYou', label: t.debts.owedToMe, color: FLOW.income },
  ] as const
  const rows = balances.map((b) => ({ ...b, label: t.format.month(b.cycle.start), range: t.format.range(b.cycle.start, b.cycle.end) }))
  const yTicks = niceTicks(0, Math.max(0, ...balances.flatMap((b) => [b.owed, b.owedToYou])))
  const max = axisMax(yTicks)
  const latest = balances[balances.length - 1]

  return (
    <ChartCard
      title={copy.trendTitle}
      note={copy.trendNote}
      legend={series.map((s): LegendItem => ({ label: s.label, color: s.color, mark: 'line' }))}
      summary={copy.trendSummary(money(latest.owed), money(latest.owedToYou))}
      table={{
        caption: copy.trendTitle,
        columns: [t.stats.table.cycle, t.debts.iOwe, t.debts.owedToMe],
        rows: rows.map((r) => [r.range, money(r.owed), money(r.owedToYou)]),
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={rows.length > 6 ? 1 : 0} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[yTicks[0], yTicks[yTicks.length - 1]]} tickFormatter={(v: number) => formatCompact(v, max)} />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !row) return null
              return <TooltipBox title={row.range} rows={series.map((s) => ({ label: s.label, value: money(row[s.key]), color: s.color, mark: 'line' as const }))} />
            }}
          />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 1 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
