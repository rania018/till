import clsx from 'clsx'
import { CalendarClock, CircleAlert, Coins, Gauge, Heart, TriangleAlert, type LucideIcon } from 'lucide-react'
import { ChevronRight } from '../ui/directionalIcons'
import { Link } from 'react-router'
import { t } from '../../i18n'
import type { Alert, AlertTone } from '../../lib/alerts'
import { describeAlert, emphasize, type AlertContext } from './describeAlert'

const TONES: Record<AlertTone, { className: string; icon: LucideIcon }> = {
  crit: { className: 'bg-crit-soft text-crit-ink', icon: CircleAlert },
  warn: { className: 'bg-warn-soft text-warn-ink', icon: TriangleAlert },
  info: { className: 'bg-accent-soft text-accent', icon: CalendarClock },
}

const ICONS: Partial<Record<Alert['kind'], LucideIcon>> = { 'too-fast': Gauge, 'cash-check': Coins, 'wishlist-ready': Heart }

/**
 * Two columns, or three where Home has three: on six tracks, so a last row that's short shares the full width instead of leaving a hole.
 * The horizontal gap is Home's own, which puts these on the same column edges as the cards below.
 */
const COLUMNS =
  'grid gap-x-6 gap-y-2 @min-[48rem]:grid-cols-2 @min-[48rem]:@max-[66rem]:[&>:nth-child(odd):last-child]:col-span-2 ' +
  '@min-[66rem]:grid-cols-6 @min-[66rem]:*:col-span-2 @min-[66rem]:[&>:nth-child(3n+1):last-child]:col-span-6 ' +
  '@min-[66rem]:[&>:nth-child(3n+1):nth-last-child(2)]:col-span-3 @min-[66rem]:[&>:nth-child(3n+2):last-child]:col-span-3'

/** Home's "needs attention" cards. Each one links to where you can act on it. With `columns`, a wide container lays them out across its width, to keep what's under them in view. */
export function AlertList({ alerts, columns, ...context }: { alerts: Alert[]; columns?: boolean } & AlertContext) {
  if (alerts.length === 0) return null
  return (
    <section aria-label={t.alerts.label}>
      <ul className={columns ? COLUMNS : 'space-y-2'}>
        {alerts.map((alert) => {
          const { text, subject, to } = describeAlert(alert, context)
          const Icon = ICONS[alert.kind] ?? TONES[alert.tone].icon
          return (
            <li key={alert.id}>
              <Link to={to} className={clsx('flex h-full items-center gap-3 rounded-2xl px-4 py-3 text-[0.9375rem] font-semibold transition hover:brightness-[0.97] desk:px-4 desk:py-2.5 desk:text-sm', TONES[alert.tone].className)}>
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">{emphasize(text, subject)}</span>
                <ChevronRight aria-hidden className="size-4 shrink-0 opacity-70" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
