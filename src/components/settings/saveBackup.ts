import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { saveFile } from '../../lib/saveFile'
import { appStore, pickData } from '../../store'
import { backupFileName, createBackup } from '../../store/backup'
import { rememberBackup } from '../../store/deviceState'
import { toast } from '../ui/toastStore'

/** Downloads everything as a file and remembers when. Returns that moment. */
export function saveBackup(): string {
  const now = new Date().toISOString()
  saveFile(backupFileName(todayISO()), createBackup(pickData(appStore.getState()), now), 'application/json')
  rememberBackup(now)
  toast(t.data.exported, { tone: 'good' })
  return now
}
