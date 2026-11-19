import clsx from 'clsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110 active:brightness-95',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-crit text-white hover:brightness-110 active:brightness-95',
}

/**
 * Stretches a small control's tap area to 44px tall without changing how it looks
 * (the control needs `relative`). For 36px chips, small buttons and text links.
 */
export const touchArea = "relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"

const sizes: Record<ButtonSize, string> = {
  sm: `min-h-9 px-3 text-sm desk:min-h-9 desk:px-3 desk:text-sm ${touchArea}`,
  md: 'min-h-11 px-4 text-[0.9375rem] desk:min-h-10 desk:px-4 desk:text-sm',
  lg: 'min-h-12 px-5 text-base desk:min-h-11 desk:text-base',
}

/** Classes for anything that should look like a button, including router links. */
export function buttonClass({ variant = 'primary', size = 'md', block = false }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return clsx(
    'inline-flex select-none items-center justify-center gap-2 rounded-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    block && 'w-full',
  )
}

/** Round 44px button for a single icon. */
export function iconButtonClass(variant: 'secondary' | 'ghost' = 'secondary'): string {
  return clsx(
    'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition desk:size-9 desk:rounded-xl',
    variant === 'secondary' ? 'border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  )
}
