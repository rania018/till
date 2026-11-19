import { createStore } from 'zustand/vanilla'

/** Chrome and Edge's install prompt; not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhones and iPads (iPadOS reports itself as a Mac with a touch screen). Safari there has no install prompt. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

/** `prompt` is set once the browser offers to install the app. */
export const installStore = createStore<{ prompt: BeforeInstallPromptEvent | null; installed: boolean }>(() => ({ prompt: null, installed: false }))

/** Call before the app renders, so the browser's one-time offer isn't missed. */
export function listenForInstall(): void {
  installStore.setState({ installed: isStandalone() })
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installStore.setState({ prompt: event as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => installStore.setState({ prompt: null, installed: true }))
}

export async function promptInstall(): Promise<void> {
  const { prompt } = installStore.getState()
  if (!prompt) return
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  installStore.setState({ prompt: null, installed: outcome === 'accepted' })
}
