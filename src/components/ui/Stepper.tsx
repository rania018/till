import { Minus, Plus } from 'lucide-react'
import { IconButton } from './Button'

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  /** Names the value for screen readers, e.g. "Hours a day". */
  label: string
  decreaseLabel: string
  increaseLabel: string
}

/** − value + for small whole numbers. */
export function Stepper({ value, onChange, min, max, label, decreaseLabel, increaseLabel }: StepperProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-1">
      <IconButton icon={Minus} label={decreaseLabel} variant="ghost" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
      <output aria-label={label} aria-live="polite" className="text-lg font-extrabold tabular-nums">
        {value}
      </output>
      <IconButton icon={Plus} label={increaseLabel} variant="ghost" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
    </div>
  )
}
