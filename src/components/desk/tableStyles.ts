import clsx from 'clsx'

/** Classes shared by the desktop tables. */
export const tableClass = 'w-full border-separate border-spacing-0 text-sm'

/** Columns a narrower computer screen can do without; the row's page has the details. */
export const fromXl = 'hidden xl:table-cell'
export const fromWide = 'hidden min-[1500px]:table-cell'

/** On a narrower screen, the name is what gives way: it shortens rather than pushing the table off the page. */
export const nameGivesWay = 'max-xl:w-full max-xl:max-w-0'

/** Inline row actions: real buttons, comfortably sized for a mouse. */
export const rowButtonClass = 'inline-flex min-h-9 items-center rounded-xl border border-line px-3 text-sm font-bold text-ink transition hover:bg-surface'
export const rowIconButtonClass = 'grid size-9 place-items-center rounded-xl border border-line text-ink-2 transition hover:bg-surface'

/** A column heading. `sticky` keeps it under the page's top bar while a long table scrolls. */
export function thClass({ right, sticky }: { right?: boolean; sticky?: boolean } = {}): string {
  return clsx(
    'whitespace-nowrap border-b border-line bg-surface px-5 py-3 text-xs font-semibold text-muted first:rounded-ss-2xl last:rounded-se-2xl',
    right ? 'text-end' : 'text-start',
    sticky && 'sticky top-16 z-10',
  )
}

export function tdClass({ right, muted, strong }: { right?: boolean; muted?: boolean; strong?: boolean } = {}): string {
  return clsx(
    'border-b border-line px-5 py-3.5 align-middle group-last/row:border-b-0',
    right && 'whitespace-nowrap text-end tabular-nums',
    muted && 'text-muted',
    strong && 'font-bold',
  )
}

/** A row that opens or goes somewhere, by stretching its one link or button over the whole row. */
export const rowClass = 'group/row relative transition-colors hover:bg-surface-2'
export const stretchedClass = 'text-start font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent'
