import { Database } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { appStore, pickData } from '../../store'
import { useSyncStatus } from '../../sync'
import { restoredData } from '../../sync/records'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { toast } from '../ui/toastStore'

/** Fills the app with made-up history, to try every screen. Settings only shows this in development builds. */
export function DemoDataRow() {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  // Signed in, a replace would sync: made-up data must never reach a real account.
  const synced = useSyncStatus().phase !== 'off'
  const copy = t.settings

  async function load() {
    // Loaded on demand, so it stays out of the app's bundle.
    const { demoData } = await import('../../test/demoData')
    appStore.getState().replaceData(restoredData(pickData(appStore.getState()), demoData(todayISO())))
    toast(copy.demoLoaded, { tone: 'good' })
    navigate('/stats')
  }

  return (
    <>
      <div className="flex items-center gap-3 px-0 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Database aria-hidden className="size-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{copy.demo}</span>
          <span className="block text-sm text-muted">{synced ? copy.demoSynced : copy.demoHint}</span>
        </span>
        <Button size="sm" variant="secondary" disabled={synced} onClick={() => setConfirming(true)}>
          {copy.demo}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={copy.demoConfirmTitle}
        body={copy.demoConfirmBody}
        confirmLabel={copy.demoConfirm}
        onConfirm={() => void load()}
      />
    </>
  )
}
