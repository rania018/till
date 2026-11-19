import { Download, KeyRound, LogIn, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../i18n'
import { live } from '../../lib/id'
import { formatNumber } from '../../lib/money'
import { needsSafekeeping } from '../../lib/safekeeping'
import { useAppStore } from '../../store'
import { isSyncOn, lastBackupAt, safekeepingSnoozedAt, snoozeSafekeeping } from '../../store/deviceState'
import { signIn, SYNC_ENABLED, useSyncStatus } from '../../sync'
import { saveBackup } from '../settings/saveBackup'
import { SyncKeySheet } from '../settings/SyncVault'
import { Button } from '../ui/Button'

/** Home's reminder that everything is on this device only, with the two ways to fix that right here. */
export function SafekeepingCard() {
  const entries = useAppStore((s) => live(s.transactions).length)
  const { phase } = useSyncStatus()
  const [lastBackup, setLastBackup] = useState(lastBackupAt)
  const [snoozedAt, setSnoozedAt] = useState(safekeepingSnoozedAt)
  const [keyLater, setKeyLater] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const copy = t.data

  // Signed in, but sync can't run until the passphrase is chosen or typed on this device.
  if ((phase === 'setup' || phase === 'locked') && !keyLater) {
    return (
      <section className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn-ink">
          <KeyRound aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{phase === 'setup' ? t.vault.setupTitle : t.vault.lockedTitle}</h2>
          <p className="text-sm text-muted">{phase === 'setup' ? t.vault.homeSetup : t.vault.homeLocked}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" icon={KeyRound} onClick={() => setKeyOpen(true)}>
              {t.vault.finish}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setKeyLater(true)}>
              {t.install.later}
            </Button>
          </div>
        </div>
        <SyncKeySheet open={keyOpen} onOpenChange={setKeyOpen} />
      </section>
    )
  }

  // While sync starts up its phase is still off, and the card would flash on a signed-in device.
  const synced = phase !== 'off' || isSyncOn()
  if (!needsSafekeeping({ entries, synced, lastBackup, snoozedAt, now: new Date() })) return null

  return (
    <section className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn-ink">
        <ShieldAlert aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">{copy.safeTitle}</h2>
        <p className="text-sm text-muted">{lastBackup ? copy.safeBodyOld(t.format.relative(lastBackup)) : copy.safeBody(formatNumber(entries))}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SYNC_ENABLED && (
            <Button size="sm" icon={LogIn} onClick={() => void signIn()}>
              {t.sync.signIn}
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={Download} onClick={() => setLastBackup(saveBackup())}>
            {copy.exportBackup}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const now = new Date().toISOString()
              snoozeSafekeeping(now)
              setSnoozedAt(now)
            }}
          >
            {t.install.later}
          </Button>
        </div>
      </div>
    </section>
  )
}
