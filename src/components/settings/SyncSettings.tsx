import { CloudOff, Cloud, KeyRound, Lock, LogIn, LogOut, RefreshCw, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { deleteOnlineCopy, signIn, signOut, syncNow, useSyncStatus, type SyncPhase } from '../../sync'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { StatusChip, type StatusTone } from '../ui/StatusChip'
import { toast } from '../ui/toastStore'
import { SettingRow } from './SettingRow'
import { ChangePassphraseSheet, NewRecoveryKeySheet, SyncKeyPanel } from './SyncVault'

const TONES: Partial<Record<SyncPhase, StatusTone>> = { synced: 'good', offline: 'warn', error: 'crit', outdated: 'warn', setup: 'warn', locked: 'warn' }
const ICONS: Partial<Record<SyncPhase, LucideIcon>> = { offline: CloudOff, locked: Lock, setup: KeyRound }

/** Settings › Sync: sign in with Google, the passphrase, then what's happening and the ways out. */
export function SyncSettings() {
  const { phase, email, lastSyncedAt } = useSyncStatus()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [changing, setChanging] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const copy = t.sync

  if (phase === 'off' || phase === 'signing-in') {
    return (
      <Card>
        <SettingRow title={copy.title} hint={copy.hint} />
        <Button block variant="secondary" icon={LogIn} className="mt-3" disabled={phase === 'signing-in'} onClick={() => void signIn()}>
          {phase === 'signing-in' ? copy.signingIn : copy.signIn}
        </Button>
        <p className="mt-3 text-sm text-muted">{copy.privacy}</p>
        <Link to="/privacy" className="mt-2 inline-block text-sm font-bold text-accent underline-offset-2 hover:underline">
          {t.policy.title}
        </Link>
      </Card>
    )
  }

  const keyPhase = phase === 'setup' || phase === 'locked' ? phase : null
  const detail =
    phase === 'offline'
      ? copy.offlineHint
      : phase === 'error'
        ? copy.errorHint
        : phase === 'outdated'
          ? copy.outdatedHint
          : lastSyncedAt && !keyPhase
            ? copy.lastSynced(t.format.relative(lastSyncedAt))
            : undefined

  return (
    <>
      <Card className="divide-y divide-line">
        <SettingRow
          title={email ? copy.signedInAs(email) : copy.signedIn}
          hint={detail}
          control={
            <StatusChip tone={TONES[phase] ?? 'info'} icon={ICONS[phase] ?? Cloud}>
              {copy.phases[phase]}
            </StatusChip>
          }
        />
        {keyPhase ? (
          <div className="py-4">
            <SyncKeyPanel phase={keyPhase} email={email} withTitle />
          </div>
        ) : (
          <>
            <SettingRow
              title={copy.syncNow}
              hint={copy.syncNowHint}
              control={
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={syncNow} aria-label={copy.syncNow}>
                  <span className="sr-only sm:not-sr-only">{copy.syncNow}</span>
                </Button>
              }
            />
            <SettingRow title={t.vault.encrypted} hint={t.vault.encryptedHint} control={<Lock aria-hidden className="size-5 text-good-ink" />} />
            <SettingRow
              title={t.vault.changePassphrase}
              hint={t.vault.changePassphraseHint}
              control={
                <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setChanging(true)} aria-label={t.vault.changePassphrase}>
                  <span className="sr-only sm:not-sr-only">{t.vault.changePassphrase}</span>
                </Button>
              }
            />
            <SettingRow
              title={t.vault.newRecoveryKey}
              hint={t.vault.newRecoveryKeyHint}
              control={
                <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setRenewing(true)} aria-label={t.vault.newRecoveryKey}>
                  <span className="sr-only sm:not-sr-only">{t.vault.newRecoveryKey}</span>
                </Button>
              }
            />
          </>
        )}
        <SettingRow
          title={copy.signOut}
          hint={copy.signOutHint}
          control={
            <Button
              size="sm"
              variant="secondary"
              icon={LogOut}
              aria-label={copy.signOut}
              onClick={() => {
                void signOut().then(() => toast(copy.signedOut))
              }}
            >
              <span className="sr-only sm:not-sr-only">{copy.signOut}</span>
            </Button>
          }
        />
        <SettingRow
          title={copy.deleteOnline}
          hint={copy.deleteOnlineHint}
          control={
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)} aria-label={copy.deleteOnline} className="text-crit-ink">
              <span className="sr-only sm:not-sr-only">{copy.deleteOnline}</span>
            </Button>
          }
        />
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={copy.deleteTitle}
        body={copy.deleteBody}
        confirmLabel={copy.deleteOnline}
        onConfirm={() => {
          deleteOnlineCopy().then(
            () => toast(copy.deleted, { tone: 'good' }),
            (error: Error) => toast(error.message, { tone: 'crit' }),
          )
        }}
      />
      <ChangePassphraseSheet open={changing} onOpenChange={setChanging} email={email} />
      <NewRecoveryKeySheet open={renewing} onOpenChange={setRenewing} email={email} />
    </>
  )
}
