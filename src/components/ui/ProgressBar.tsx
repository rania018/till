import clsx from 'clsx'

/** `inverse` is for bars on an accent-colored card. */
type Tone = 'accent' | 'good' | 'warn' | 'crit' | 'inverse'

const tones: Record<Tone, string> = {
  accent: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  crit: 'bg-crit',
  inverse: 'bg-on-accent',
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

interface ProgressBarProps {
  /** Share filled, 0–1. Values over 1 show a full bar. */
  value: number
  tone?: Tone
  /** Thin mark at this share, e.g. how much of the pay cycle has gone. */
  marker?: number
  /** Names the bar for screen readers. */
  label: string
  className?: string
}

export function ProgressBar({ value, tone = 'accent', marker, label, className }: ProgressBarProps) {
  const percent = Math.round(value * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.max(0, percent))}
      aria-valuetext={`${percent}%`}
      className={clsx('relative h-2 rounded-full', tone === 'inverse' ? 'bg-on-accent/25' : 'bg-line', className)}
    >
      <div className={clsx('h-full rounded-full transition-[width] duration-500', tones[tone])} style={{ width: `${clamp(value) * 100}%` }} />
      {marker !== undefined && (
        <span aria-hidden className={clsx('absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full rtl:translate-x-1/2', tone === 'inverse' ? 'bg-on-accent' : 'bg-ink/60')} style={{ insetInlineStart: `${clamp(marker) * 100}%` }} />
      )}
    </div>
  )
}
