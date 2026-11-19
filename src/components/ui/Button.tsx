import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'
import { buttonClass, iconButtonClass, type ButtonSize, type ButtonVariant } from './buttonStyles'

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: LucideIcon
}

export function Button({ variant, size, block, icon: Icon, className, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={clsx(buttonClass({ variant, size, block }), className)} {...props}>
      {Icon && <Icon aria-hidden className="size-[1.125rem] shrink-0" />}
      {children}
    </button>
  )
}

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: LucideIcon
  /** Read out by screen readers and shown as a tooltip. */
  label: string
  variant?: 'secondary' | 'ghost'
}

export function IconButton({ icon: Icon, label, variant, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={clsx(iconButtonClass(variant), className)} {...props}>
      <Icon aria-hidden className="size-[1.125rem]" />
    </button>
  )
}
