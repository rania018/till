import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'
import { inputClass } from './formStyles'

/** The phone's own picker, styled like the other fields. */
export function Select({ className, children, ...props }: ComponentPropsWithRef<'select'>) {
  return (
    <div className="relative">
      <select {...props} className={inputClass({ className: clsx('appearance-none pe-10 font-semibold', className) })}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  )
}
