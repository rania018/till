import * as Dialog from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { X } from 'lucide-react'
import type { KeyboardEventHandler, ReactNode } from 'react'
import { t } from '../../i18n'
import { IconButton } from './Button'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Stays visible below scrolling content, e.g. a Save button. */
  footer?: ReactNode
  /** Keys pressed anywhere in the sheet, e.g. digits for an amount keypad. */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  /** A wider panel on computers, for a form laid out in columns. */
  wide?: boolean
}

/** Slides up from the bottom on phones; a centered panel on larger screens. Up to a tall phone it can use nearly all the height, clear of a notch: a form under a keypad has none to spare. */
export function BottomSheet({ open, onOpenChange, title, description, children, footer, onKeyDown, wide }: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          {...(!description && { 'aria-describedby': undefined })}
          onKeyDown={onKeyDown}
          className={clsx(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col [@media(max-height:56rem)]:max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:pb-0 md:data-[state=closed]:animate-fade-out md:data-[state=open]:animate-pop-in',
            wide && 'lg:max-w-3xl',
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line md:hidden" />
          <div className="flex items-start gap-3 px-5 pb-2 pt-3 md:pt-5">
            <div className="min-w-0 flex-1 pt-1">
              <Dialog.Title className="text-lg font-extrabold">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton icon={X} label={t.common.close} variant="ghost" className="-me-2" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
