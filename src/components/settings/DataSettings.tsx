import { Download, FileSpreadsheet, FileUp, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { saveFile } from '../../lib/saveFile'
import { appStore, pickData } from '../../store'
import { BackupError, readBackup, transactionsToCsv } from '../../store/backup'
import { lastBackupAt } from '../../store/deviceState'
import { deleteEverything, SYNC_ENABLED, useSyncStatus } from '../../sync'
import { restoredData } from '../../sync/records'
import type { AppData } from '../../types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { toast } from '../ui/toastStore'
import { saveBackup } from './saveBackup'
import { SettingRow } from './SettingRow'

/** Tells Excel the CSV is UTF-8, so accents and "’" survive. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)

/** Backup, restore, spreadsheet export and a full reset. Without sync the data lives only on this device, so these matter. */
export function DataSettings() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [backedUpAt, setBackedUpAt] = useState(lastBackupAt)
  const [pending, setPending] = useState<{ data: AppData; exportedAt: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const copy = t.data
  const synced = useSyncStatus().phase !== 'off'

  function exportCsv() {
    saveFile(`till-transactions-${todayISO()}.csv`, BYTE_ORDER_MARK + transactionsToCsv(appStore.getState()), 'text/csv')
    toast(copy.exportedCsv, { tone: 'good' })
  }

  async function chooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const data = readBackup(text)
      const exportedAt = (JSON.parse(text) as { exportedAt?: string }).exportedAt ?? new Date(file.lastModified).toISOString()
      setPending({ data, exportedAt })
    } catch (error) {
      toast(error instanceof BackupError ? error.message : String(error), { tone: 'crit' })
    }
  }

  return (
    <>
      <Card className="divide-y divide-line">
        <p className="pb-3 text-sm text-muted">
          {synced ? copy.hintSynced : SYNC_ENABLED ? copy.hint : copy.hintLocal} <span className="font-semibold text-ink-2">{backedUpAt ? copy.lastBackup(t.format.relative(backedUpAt)) : copy.neverBackedUp}</span>
        </p>
        <SettingRow
          title={copy.exportBackup}
          hint={copy.exportBackupHint}
          control={
            <Button size="sm" variant="secondary" icon={Download} title={copy.exportBackup} onClick={() => setBackedUpAt(saveBackup())} aria-label={copy.exportBackup}>
              <span className="sr-only sm:not-sr-only desk:sr-only">{copy.exportBackup}</span>
            </Button>
          }
        />
        <SettingRow
          title={copy.restore}
          hint={copy.restoreHint}
          control={
            <Button size="sm" variant="secondary" icon={Upload} title={copy.restore} onClick={() => fileInput.current?.click()} aria-label={copy.restore}>
              <span className="sr-only sm:not-sr-only desk:sr-only">{copy.restore}</span>
            </Button>
          }
        />
        <SettingRow
          title={copy.exportCsv}
          hint={copy.exportCsvHint}
          control={
            <Button size="sm" variant="secondary" icon={FileSpreadsheet} title={copy.exportCsv} onClick={exportCsv} aria-label={copy.exportCsv}>
              <span className="sr-only sm:not-sr-only desk:sr-only">{copy.exportCsv}</span>
            </Button>
          }
        />
        <SettingRow
          title={t.importCsv.title}
          hint={t.importCsv.settingsHint}
          control={
            <Button size="sm" variant="secondary" icon={FileUp} title={t.importCsv.title} onClick={() => navigate('/settings/import')} aria-label={t.importCsv.title}>
              <span className="sr-only sm:not-sr-only desk:sr-only">{t.importCsv.open}</span>
            </Button>
          }
        />
        <SettingRow
          title={copy.reset}
          hint={copy.resetHint}
          control={
            <Button size="sm" variant="ghost" icon={Trash2} title={copy.reset} onClick={() => setConfirmReset(true)} aria-label={copy.reset} className="text-crit-ink">
              <span className="sr-only sm:not-sr-only desk:sr-only">{copy.reset}</span>
            </Button>
          }
        />
      </Card>
      <input ref={fileInput} type="file" accept="application/json,.json" onChange={chooseBackup} className="hidden" tabIndex={-1} aria-hidden />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={copy.restoreTitle}
        body={pending ? (synced ? copy.restoreBodySynced : copy.restoreBody)(t.format.dateTime(pending.exportedAt)) : ''}
        confirmLabel={copy.restoreConfirm}
        onConfirm={() => {
          if (!pending) return
          // Stamped as changed now, so the restored data also wins over the online copy.
          appStore.getState().replaceData(restoredData(pickData(appStore.getState()), pending.data))
          setPending(null)
          toast(copy.restored, { tone: 'good' })
          navigate('/')
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={synced ? copy.resetTitleSynced : copy.resetTitle}
        body={synced ? copy.resetBodySynced : copy.resetBody}
        confirmLabel={copy.resetConfirm}
        onConfirm={() => {
          deleteEverything().then(
            () => {
              toast(copy.resetDone)
              navigate('/onboarding/1', { replace: true })
            },
            (error: Error) => toast(error.message, { tone: 'crit' }),
          )
        }}
      />
    </>
  )
}
