import { BellRing, Plus } from 'lucide-react'
import { useState } from 'react'
import { requestPushSync } from '../../app/push'
import { t } from '../../i18n'
import type { DueReminder } from '../../lib/reminders'
import { dismissReminder, isReminderDismissed } from '../../store/deviceState'
import { openTransactionSheet } from '../transactions/sheetStore'
import { Button } from '../ui/Button'

/** The weekly "nothing logged" reminder, in the app. Shown until something is added or "Nothing to add" is tapped. */
export function ReminderBanner({ reminder }: { reminder: DueReminder }) {
  const [dismissed, setDismissed] = useState(() => isReminderDismissed(reminder.week.end))
  if (dismissed) return null
  return (
    <section role="note" aria-label={t.reminder.title} className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
      <div className="flex gap-3">
        <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
        <div>
          <h2 className="font-extrabold">{t.reminder.title}</h2>
          <p className="text-[0.9375rem] text-ink-2">{t.reminder.body(t.format.range(reminder.week.start, reminder.week.end))}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 ps-8">
        <Button size="sm" icon={Plus} onClick={() => openTransactionSheet('expense')}>
          {t.reminder.add}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissReminder(reminder.week.end)
            // So the server doesn't push the same reminder later tonight.
            requestPushSync()
            setDismissed(true)
          }}
        >
          {t.reminder.dismiss}
        </Button>
      </div>
    </section>
  )
}
