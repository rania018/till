import clsx from 'clsx'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useStore } from 'zustand'
import { dismissToast, toastStore, type ToastTone } from './toastStore'

// Toasts use inverted colors, so the "soft" status colors read well on them in both themes.
const icons: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-accent-soft' },
  good: { icon: CircleCheck, className: 'text-good-soft' },
  warn: { icon: TriangleAlert, className: 'text-warn-soft' },
  crit: { icon: CircleAlert, className: 'text-crit-soft' },
}

export function Toaster() {
  const toasts = useStore(toastStore, (s) => s.toasts)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 print:hidden flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
    >
      {toasts.map((toast) => {
        const { icon: Icon, className } = icons[toast.tone]
        return (
          <div key={toast.id} className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-lg">
            <Icon aria-hidden className={clsx('size-5 shrink-0', className)} />
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="-my-1 rounded-lg px-2 py-1 font-extrabold text-accent-soft hover:bg-bg/10"
                onClick={() => {
                  toast.action?.onClick()
                  dismissToast(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
