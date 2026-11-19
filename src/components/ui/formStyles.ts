import clsx from 'clsx'

/**
 * Text, amount, date and select fields share this look. Their text is 16px:
 * iPhones zoom the whole page into any smaller field when it's tapped.
 */
export function inputClass(options: { invalid?: boolean; className?: string; /** The main amount of a screen stays large on computers too. */ large?: boolean } = {}): string {
  return clsx(
    'min-h-12 w-full rounded-xl border bg-surface px-3.5 text-base text-ink transition placeholder:text-muted',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50',
    !options.large && 'desk:min-h-10 desk:text-sm',
    options.invalid ? 'border-crit' : 'border-line',
    options.className,
  )
}
