import clsx from 'clsx'
import type { ReactNode } from 'react'
import { touchArea } from './buttonStyles'

/** A filter that's on or off, in a row of filters. */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm transition-colors desk:min-h-9 desk:rounded-xl desk:px-3.5 desk:text-sm',
        touchArea,
        selected ? 'border-ink bg-ink font-bold text-bg' : 'border-line bg-surface font-semibold text-ink-2 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}
