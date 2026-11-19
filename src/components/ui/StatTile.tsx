import clsx from 'clsx'
import type { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
  /** Opens what's behind the number: the whole tile is the button. */
  onClick?: () => void
}

export function StatTile({ label, value, hint, className, onClick }: StatTileProps) {
  const inside = (
    <>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="text-lg font-extrabold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </>
  )
  const frame = 'rounded-xl border border-line bg-surface px-3 py-2.5'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clsx(frame, 'block w-full text-start transition-colors active:bg-surface-2 hover:bg-surface-2', className)}>
        {inside}
      </button>
    )
  }
  return <div className={clsx(frame, className)}>{inside}</div>
}
