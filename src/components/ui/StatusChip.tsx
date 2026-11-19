import clsx from 'clsx'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusTone = 'good' | 'warn' | 'crit' | 'info'

const styles: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  good: { className: 'bg-good-soft text-good-ink', icon: CircleCheck },
  warn: { className: 'bg-warn-soft text-warn-ink', icon: TriangleAlert },
  crit: { className: 'bg-crit-soft text-crit-ink', icon: CircleAlert },
  info: { className: 'bg-accent-soft text-accent', icon: Info },
}

/** A state label. Always icon + text, so color is never the only signal. */
export function StatusChip({ tone, icon, children }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode }) {
  const Icon = icon ?? styles[tone].icon
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', styles[tone].className)}>
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  )
}
