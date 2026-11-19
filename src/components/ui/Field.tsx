import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  /** The input's id. Without it the label is plain text, for groups like segmented controls. */
  htmlFor?: string
  hint?: ReactNode
  /** Replaces the hint and is announced to screen readers. */
  error?: string | null
  /** Shown after the label, e.g. "Optional". */
  aside?: string
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, aside, children }: FieldProps) {
  const labelContent = (
    <>
      {label}
      {aside && <span className="ms-1.5 font-semibold text-muted">{aside}</span>}
    </>
  )
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-ink">
          {labelContent}
        </label>
      ) : (
        <p className="mb-1.5 text-sm font-bold text-ink">{labelContent}</p>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-semibold text-crit-ink">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>
      )}
    </div>
  )
}
