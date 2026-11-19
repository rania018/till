import clsx from 'clsx'
import { Eye, EyeOff } from 'lucide-react'
import { setAmountsHiddenOn, useLock } from '../../app/lock'
import { t } from '../../i18n'
import { iconButtonClass } from '../ui/buttonStyles'

/** One tap to hide every amount before handing the phone over, and to show them again. */
export function HideAmountsButton() {
  const hidden = useLock((s) => s.hidden)
  const label = hidden ? t.lock.showAmounts : t.lock.hideAmountsNow
  return (
    <button type="button" aria-pressed={hidden} aria-label={label} title={label} onClick={() => setAmountsHiddenOn(!hidden)} className={clsx(iconButtonClass(), hidden && 'bg-accent-soft text-accent')}>
      {hidden ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
    </button>
  )
}
