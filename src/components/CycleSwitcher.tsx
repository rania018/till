import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from './ui/directionalIcons'
import { t } from '../i18n'
import { nextCycle, previousCycle, type Cycle } from '../lib/dates'
import type { ISODate, Salary } from '../types'
import { IconButton } from './ui/Button'

interface CycleSwitcherProps {
  cycle: Cycle
  current: Cycle
  salary: Pick<Salary, 'frequency' | 'payday'>
  /** The start of the chosen cycle, or undefined for the current one. */
  onChange: (start: ISODate | undefined) => void
  /** On a computer: on a card of its own, so it reads as a control beside the others in the top bar. */
  framed?: boolean
}

/** ‹ 25 Oct – 24 Nov › — step through pay cycles, never past the current one. */
export function CycleSwitcher({ cycle, current, salary, onChange, framed }: CycleSwitcherProps) {
  const isCurrent = cycle.start === current.start
  return (
    <div className={clsx('flex items-center justify-between gap-2 desk:gap-1', framed && 'desk:shrink-0 desk:rounded-xl desk:border desk:border-line desk:bg-surface')}>
      <IconButton icon={ChevronLeft} label={t.activity.previousCycle} variant="ghost" onClick={() => onChange(previousCycle(cycle, salary).start)} />
      <p className={clsx('text-center font-extrabold desk:text-base', framed ? 'desk:min-w-36 desk:whitespace-nowrap' : 'desk:min-w-32')}>{t.format.range(cycle.start, cycle.end)}</p>
      <IconButton
        icon={ChevronRight}
        label={t.activity.nextCycle}
        variant="ghost"
        disabled={isCurrent}
        className="disabled:opacity-30"
        onClick={() => {
          const next = nextCycle(cycle, salary)
          onChange(next.start === current.start ? undefined : next.start)
        }}
      />
    </div>
  )
}
