import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { NavLink } from 'react-router'
import { direction } from '../../i18n/language'

const trackLook = 'gap-1 rounded-xl bg-surface-2 p-1'
const segment = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors desk:min-h-9 desk:text-sm'
const selectedSegment = 'bg-surface font-extrabold text-ink shadow-sm'
const idleSegment = 'font-semibold text-ink-2 hover:text-ink'

interface Option<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** Names the group for screen readers. */
  label: string
}

/** Pick one of a few options. Works like a radio group: arrow keys move the choice. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent) {
    // The first option sits on the right in Arabic, so the right arrow goes back.
    const forward = direction === 'rtl' ? -1 : 1
    const step = { ArrowRight: forward, ArrowDown: 1, ArrowLeft: -forward, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const index = (options.findIndex((o) => o.value === value) + step + options.length) % options.length
    onChange(options[index].value)
    buttons.current[index]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={clsx('grid auto-cols-fr grid-flow-col', trackLook)} onKeyDown={onKeyDown}>
      {options.map((option, i) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={clsx(segment, 'px-3', selected ? selectedSegment : idleSegment)}
          >
            {Icon && <Icon aria-hidden className="size-4" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

interface SegmentLink {
  to: string
  label: string
  /** A count that needs attention, e.g. goals behind. `label` is what a screen reader hears. */
  badge?: { count: number; label: string }
  /** Only active on this exact path, for a link whose path starts the others (Activity, then Activity › Calendar). */
  end?: boolean
}

/** Same look, for switching between pages (e.g. Plan › Budget / Bills / Goals). */
export function SegmentedLinks({ links, label, prominent }: { links: SegmentLink[]; label: string; /** On a computer: roomier, on a card, with the current page filled in. */ prominent?: boolean }) {
  return (
    // Each link takes the room its text needs: a badge or a long translation mustn't spill out of an equal share.
    <nav aria-label={label} className={clsx('flex', trackLook, prominent && 'desk:border desk:border-line desk:bg-surface')}>
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => clsx(segment, 'flex-auto whitespace-nowrap px-1.5', prominent && 'desk:min-w-24 desk:px-5', isActive ? selectedSegment : idleSegment, isActive && prominent && 'desk:bg-accent desk:text-on-accent desk:shadow-none')}>
          {link.label}
          {link.badge && link.badge.count > 0 && (
            <>
              <span aria-hidden className="grid min-w-5 place-items-center rounded-full bg-warn-soft px-1.5 text-xs font-extrabold text-warn-ink">
                {link.badge.count}
              </span>
              <span className="sr-only">, {link.badge.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
