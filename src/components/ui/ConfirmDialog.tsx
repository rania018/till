import * as Dialog from '@radix-ui/react-dialog'
import { t } from '../../i18n'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  /** Say exactly what happens, e.g. "Delete expense". */
  confirmLabel: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
}

export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, tone = 'danger', onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-5 shadow-2xl outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in"
        >
          <Dialog.Title className="text-lg font-extrabold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[0.9375rem] text-ink-2">{body}</Dialog.Description>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{t.common.cancel}</Button>
            </Dialog.Close>
            <Button
              variant={tone}
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
