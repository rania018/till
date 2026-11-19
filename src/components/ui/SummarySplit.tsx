import type { ReactNode } from 'react'

interface SummarySplitProps {
  /** The totals for this page: stays in view in a side rail on larger screens. */
  summary: ReactNode
  children: ReactNode
}

/**
 * Phones: the summary, then the details, in one column. Wider screens: the summary
 * in a sticky rail on the left and the details beside it, starting level with it.
 */
export function SummarySplit({ summary, children }: SummarySplitProps) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)] lg:items-start lg:gap-6 desk:max-[1359px]:block desk:max-[1359px]:space-y-6">
      <div className="lg:sticky lg:top-6 desk:top-[5.5rem] desk:max-[1359px]:static">{summary}</div>
      <div className="min-w-0 lg:[&>:first-child]:mt-0">{children}</div>
    </div>
  )
}
