import { Archive } from 'lucide-react'
import { t } from '../../i18n'
import type { DebtStatus } from '../../lib/debts'
import type { DebtDirection } from '../../types'
import { StatusChip, type StatusTone } from '../ui/StatusChip'

/** Late on money you owe is serious; someone late paying you back is only worth a look. */
function tone(status: DebtStatus, direction: DebtDirection): StatusTone {
  if (status === 'overdue') return direction === 'borrowed' ? 'crit' : 'warn'
  if (status === 'due-soon') return 'warn'
  if (status === 'settled') return 'good'
  return 'info'
}

/** Late, Due soon, Settled or Closed. Nothing for a debt that's simply open: that's most of them. */
export function DebtStatusChip({ status, direction }: { status: DebtStatus; direction: DebtDirection }) {
  if (status === 'open') return null
  return (
    <StatusChip tone={tone(status, direction)} icon={status === 'closed' ? Archive : undefined}>
      {t.debts.status[status]}
    </StatusChip>
  )
}
