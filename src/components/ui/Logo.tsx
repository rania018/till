import clsx from 'clsx'

/**
 * The Till mark: a lowercase t whose crossbar is a budget bar (solid = spent, faint = left).
 * Drawn in `currentColor`, so it takes the color of its parent. See docs/brand/BRAND.md.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={clsx('shrink-0', className)}>
      <g fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 40H84" opacity=".35" />
        <path d="M20 40H58" />
        <path d="M38 18V66q0 16 16 16h8" />
      </g>
    </svg>
  )
}

/** The mark on its plum tile, as in the app icon. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span className={clsx('grid shrink-0 place-items-center rounded-xl bg-accent text-on-accent', className)}>
      <LogoMark className="size-[62%]" />
    </span>
  )
}
