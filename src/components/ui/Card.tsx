import clsx from 'clsx'
import type { ComponentPropsWithRef } from 'react'

export function Card({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={clsx('rounded-2xl border border-line bg-surface p-4', className)} {...props} />
}
