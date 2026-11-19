import { Archive } from 'lucide-react'
import { t } from '../../i18n'
import type { GoalStatus } from '../../lib/goals'
import { StatusChip, type StatusTone } from '../ui/StatusChip'

const TONES: Record<GoalStatus, StatusTone> = { reached: 'good', 'on-track': 'good', behind: 'warn', overdue: 'crit' }

/** Reached, On track, Behind or Deadline passed. Nothing for a goal without a deadline. A full fund is Ready. */
export function GoalStatusChip({ status, finished, fund }: { status: GoalStatus | null; finished?: boolean; fund?: boolean }) {
  if (finished) {
    return (
      <StatusChip tone="info" icon={Archive}>
        {t.goals.status.finished}
      </StatusChip>
    )
  }
  if (!status) return null
  return <StatusChip tone={TONES[status]}>{fund && status === 'reached' ? t.funds.ready : t.goals.status[status]}</StatusChip>
}
