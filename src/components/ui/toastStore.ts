import { createStore } from 'zustand/vanilla'

export type ToastTone = 'info' | 'good' | 'warn' | 'crit'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /** e.g. Undo after a delete. */
  action?: { label: string; onClick: () => void }
}

export const toastStore = createStore<{ toasts: Toast[] }>(() => ({ toasts: [] }))

let nextId = 1

export function dismissToast(id: number): void {
  toastStore.setState((s) => ({ toasts: s.toasts.filter((toast) => toast.id !== id) }))
}

/**
 * Shows a short message above the bottom bar. At most three at a time.
 * `duration: null` keeps it until its action is tapped (e.g. "Update").
 */
export function toast(message: string, options: { tone?: ToastTone; action?: Toast['action']; duration?: number | null } = {}): number {
  const id = nextId++
  toastStore.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone: options.tone ?? 'info', action: options.action }] }))
  if (options.duration !== null) setTimeout(() => dismissToast(id), options.duration ?? (options.action ? 7000 : 4000))
  return id
}
