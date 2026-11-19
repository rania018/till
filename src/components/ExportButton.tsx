import clsx from 'clsx'
import { FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n'
import { direction } from '../i18n/language'
import { workbookToBlob, type Workbook } from '../lib/export/workbook'
import { withAmountsShown } from '../lib/money'
import { saveFile } from '../lib/saveFile'
import { iconButtonClass } from './ui/buttonStyles'
import { toast } from './ui/toastStore'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Saves one page as an Excel file. The workbook is only built when clicked, from the data as it is then. */
export function ExportButton({ workbook, iconOnly }: { workbook: () => Workbook; /** Just the icon, even with room for its name. */ iconOnly?: boolean }) {
  const [busy, setBusy] = useState(false)
  const copy = t.exports

  async function run() {
    // A file saved on purpose has the real amounts, even while they're hidden on screen.
    const { fileName, sheets } = withAmountsShown(workbook)
    if (sheets.length === 0) {
      toast(copy.empty)
      return
    }
    setBusy(true)
    try {
      saveFile(fileName, await workbookToBlob(sheets, direction === 'rtl'), XLSX_TYPE)
      toast(copy.saved, { tone: 'good' })
    } catch (error) {
      console.error(error)
      toast(copy.failed, { tone: 'crit' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-busy={busy}
      aria-label={copy.button}
      title={copy.button}
      className={clsx(iconButtonClass(), 'disabled:opacity-50', !iconOnly && 'desk:@min-[64rem]:w-auto desk:@min-[64rem]:gap-2 desk:@min-[64rem]:px-3 desk:@min-[64rem]:text-sm desk:@min-[64rem]:font-bold')}
    >
      <FileSpreadsheet aria-hidden className="size-[1.125rem] desk:size-4" />
      {/* Only with room to spare: narrow screens need the header's width for the page's own controls. */}
      {!iconOnly && <span className="hidden desk:@min-[64rem]:inline">{copy.short}</span>}
    </button>
  )
}
