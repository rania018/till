import clsx from 'clsx'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** What the switch turns on, for screen readers. */
  label: string
}

/** On/off switch with a 44px touch area. */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="group grid size-11 shrink-0 place-items-center rounded-full"
    >
      <span className={clsx('relative h-6 w-10 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}>
        <span
          className={clsx(
            'absolute top-0.5 size-5 rounded-full shadow transition-all',
            checked ? 'start-[1.125rem] bg-on-accent' : 'start-0.5 bg-surface',
          )}
        />
      </span>
    </button>
  )
}
