import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  body: string
  note?: string
  action?: ReactNode
  /** `h1` when the empty state is the whole page (e.g. 404). */
  headingLevel?: 'h1' | 'h2'
}

export function EmptyState({ icon: Icon, title, body, note, action, headingLevel: Heading = 'h2' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon aria-hidden className="size-6" />
      </span>
      <Heading className="text-lg font-extrabold">{title}</Heading>
      <p className="mt-1 max-w-sm text-[0.9375rem] text-ink-2">{body}</p>
      {note && <p className="mt-3 text-sm font-semibold text-muted">{note}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
