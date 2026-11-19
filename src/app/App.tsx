import { useEffect } from 'react'
import { RouterProvider } from 'react-router/dom'
import { InstallPopup } from '../components/InstallPopup'
import { Toaster } from '../components/ui/Toaster'
import { keepStorage } from '../lib/safekeeping'
import { useAppStore, useLoadStatus } from '../store'
import { useCloudSync } from '../sync'
import { LockScreen } from './LockScreen'
import { useAutoLock, useLock } from './lock'
import { router } from './router'
import { LoadError, Splash } from './StatusScreens'
import { useApplyLanguage } from './useApplyLanguage'
import { useApplyTheme } from './useApplyTheme'
import { usePushSync } from './usePushSync'
import { useReminders } from './useReminders'

export function App() {
  const status = useLoadStatus()
  const theme = useAppStore((s) => s.settings.theme)
  // Until saved data loads, `theme` is the default; applying it would undo the
  // theme index.html already restored.
  useApplyTheme(status === 'ready' ? theme : null)
  useApplyLanguage(status === 'ready')
  useReminders(status === 'ready')
  usePushSync(status === 'ready')
  useCloudSync(status === 'ready')
  // Once there's something worth keeping: some browsers ask the person, which would make no sense on the first screen.
  const setUp = useAppStore((s) => s.profile.onboardingCompleted)
  const locked = useLock((s) => s.locked && !!s.config)
  const hidden = useLock((s) => s.hidden)
  useAutoLock()
  useEffect(() => {
    if (status === 'ready' && setUp) void keepStorage()
  }, [status, setUp])

  if (status === 'loading') return <Splash />
  if (status === 'failed') return <LoadError />
  // Locked: nothing of the app is rendered, not even behind the lock screen.
  if (locked) return <LockScreen />
  return (
    <>
      {/* Hiding or showing amounts changes how every amount is written: drawing the app again picks it up everywhere. */}
      <RouterProvider key={hidden ? 'hidden' : 'shown'} router={router} />
      <Toaster />
      <InstallPopup />
    </>
  )
}
