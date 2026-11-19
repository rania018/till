import { differenceInCalendarDays, subDays } from 'date-fns'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { fromISODate, getPayCycle, previousCycle, todayISO, toISODate, type Cycle } from '../../lib/dates'
import { isValidDate } from '../../lib/validation'
import { useAppStore } from '../../store'
import type { ID, ISODate, PaySchedule } from '../../types'

type Range = { start: ISODate; end: ISODate }

/** The params for some dates: \`cycle\` when they are exactly one pay cycle, so it can be stepped from there, else \`from\` and \`to\`. */
export function periodParams(range: Range, salary: PaySchedule): Record<string, string> {
  const cycle = getPayCycle(range.start, salary)
  return cycle.start === range.start && cycle.end === range.end ? { cycle: cycle.start } : { from: range.start, to: range.end }
}

/** A category's own stats, over these dates. */
export function categoryStatsLink(id: ID, range: Range, salary: PaySchedule): string {
  return `/activity/category/${encodeURIComponent(id)}?${new URLSearchParams(periodParams(range, salary))}`
}

/** The same days just before, or for the pay cycle running now, the same first days of the last one. */
export function previousPeriod(range: Range, today: ISODate, salary: PaySchedule): Range {
  const cycle = getPayCycle(range.start, salary)
  if (cycle.start === range.start && cycle.end === range.end) {
    const last = previousCycle(cycle, salary)
    if (today > cycle.end || today < cycle.start) return { start: last.start, end: last.end }
    const days = differenceInCalendarDays(fromISODate(today), fromISODate(cycle.start))
    return { start: last.start, end: toISODate(new Date(fromISODate(last.start).getTime() + Math.min(days, last.days - 1) * 86_400_000)) }
  }
  const days = differenceInCalendarDays(fromISODate(range.end), fromISODate(range.start))
  const end = subDays(fromISODate(range.start), 1)
  return { start: toISODate(subDays(end, days)), end: toISODate(end) }
}

/** Opens one bought item's own page over these dates. Its back arrow returns to the page it was opened from, through any pay cycle changes. */
export function useOpenItem() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const salary = useAppStore((s) => s.profile.salary)
  return (name: string, range: Range) => navigate(`/activity/item?${new URLSearchParams({ name, back: pathname + search, ...periodParams(range, salary) })}`)
}

/** The list of entries, filtered, over these dates (or every pay cycle with a search). */
export function listLink(filters: Record<string, string | undefined>, range: Range | null, salary: PaySchedule): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  if (range) for (const [key, value] of Object.entries(periodParams(range, salary))) params.set(key, value)
  return `/activity/list?${params}`
}

/**
 * The dates an Activity page shows, from the URL: a pay cycle (\`cycle\`, this one by default)
 * or any dates (\`from\` and \`to\`), with ways to change them.
 */
export function usePeriod() {
  const [params, setParams] = useSearchParams()
  const salary = useAppStore((s) => s.profile.salary)
  const today = todayISO()
  const current = getPayCycle(today, salary)
  const cycleParam = params.get('cycle')
  const cycle: Cycle = cycleParam && isValidDate(cycleParam) ? getPayCycle(cycleParam, salary) : current
  const from = params.get('from')
  const to = params.get('to')
  const custom = from && to && isValidDate(from) && isValidDate(to) && from <= to ? { start: from, end: to } : null
  const range: Range = custom ?? { start: cycle.start, end: cycle.end }

  const set = (next: Record<string, string>) =>
    setParams(
      (now) => {
        const out = new URLSearchParams(now)
        for (const key of ['cycle', 'from', 'to']) out.delete(key)
        for (const [key, value] of Object.entries(next)) out.set(key, value)
        return out
      },
      { replace: true },
    )

  return {
    salary,
    today,
    current,
    cycle,
    custom,
    range,
    setCycle: (start?: ISODate) => set(!start || start === current.start ? {} : { cycle: start }),
    /** Back from any dates to the pay cycle they start in. */
    clearCustom: () => set(custom ? { cycle: getPayCycle(custom.start, salary).start } : {}),
  }
}
