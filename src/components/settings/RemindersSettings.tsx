import { BellRing } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { notificationState, requestNotifications } from '../../app/notifications'
import { disablePush, enablePush, pushState, pushSupported, type PushState } from '../../app/push'
import { t } from '../../i18n'
import { appStore, useAppStore } from '../../store'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { inputClass } from '../ui/formStyles'
import { Select } from '../ui/Select'
import { toast } from '../ui/toastStore'
import { Toggle } from '../ui/Toggle'
import { SettingRow } from './SettingRow'

const WARN_LEVELS = [70, 80, 90]
const BIG_PURCHASE_LEVELS = [5, 10, 15, 20, 25]

/** Weekly reminder, notification permission, push while closed, cash check and budget alerts. */
export function RemindersSettings() {
  const id = useId()
  const settings = useAppStore((s) => s.settings)
  const [permission, setPermission] = useState(notificationState)
  const [push, setPush] = useState<PushState | 'busy'>(() => (pushSupported() ? 'off' : 'unsupported'))
  const copy = t.settings.reminders
  const update = appStore.getState().updateSettings
  const { weeklyReminder, alerts } = settings

  useEffect(() => {
    let cancelled = false
    void pushState().then((state) => {
      if (!cancelled) setPush(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const turnPushOn = async () => {
    setPush('busy')
    const result = await enablePush()
    setPermission(notificationState())
    if (result === 'on') {
      setPush('on')
      toast(copy.pushOn, { tone: 'good' })
    } else {
      setPush(result === 'unsupported' ? 'unsupported' : 'off')
      if (result === 'failed') toast(copy.pushFailed, { tone: 'warn' })
      else if (result === 'unsupported') toast(copy.pushUnsupported, { tone: 'warn' })
    }
  }

  const turnPushOff = async () => {
    setPush('busy')
    await disablePush()
    setPush('off')
    toast(copy.pushOff)
  }

  // Allowing notifications also registers for them while the app is closed: that's what they're for.
  const allow = async () => {
    const granted = await requestNotifications()
    setPermission(granted)
    if (granted === 'granted' && push === 'off') await turnPushOn()
  }

  return (
    <Card className="divide-y divide-line">
      <SettingRow
        title={copy.weekly}
        hint={copy.weeklyHint}
        control={<Toggle label={copy.weekly} checked={weeklyReminder.enabled} onChange={(enabled) => update({ weeklyReminder: { ...weeklyReminder, enabled } })} />}
      >
        {weeklyReminder.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor={`${id}-day`} className="block">
              <span className="mb-1.5 block text-sm font-bold">{copy.day}</span>
              <Select id={`${id}-day`} value={weeklyReminder.weekday} onChange={(e) => update({ weeklyReminder: { ...weeklyReminder, weekday: Number(e.target.value) } })}>
                {t.format.weekdays.map((name, day) => (
                  <option key={name} value={day}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
            <label htmlFor={`${id}-time`} className="block">
              <span className="mb-1.5 block text-sm font-bold">{copy.time}</span>
              <input
                id={`${id}-time`}
                type="time"
                value={weeklyReminder.time}
                onChange={(e) => e.target.value && update({ weeklyReminder: { ...weeklyReminder, time: e.target.value } })}
                className={inputClass()}
              />
            </label>
          </div>
        )}
      </SettingRow>

      <SettingRow title={copy.notifications} hint={copy.notificationsHint}>
        {permission === 'default' ? (
          <Button variant="secondary" size="sm" icon={BellRing} onClick={() => void allow()}>
            {copy.allow}
          </Button>
        ) : (
          <p className={permission === 'granted' ? 'text-sm font-bold text-good-ink' : 'text-sm font-semibold text-ink-2'}>{copy[permission]}</p>
        )}
      </SettingRow>

      {permission === 'granted' && push !== 'unsupported' && (
        <SettingRow
          title={copy.push}
          hint={copy.pushHint}
          control={<Toggle label={copy.push} checked={push === 'on'} onChange={(on) => push !== 'busy' && void (on ? turnPushOn() : turnPushOff())} />}
        />
      )}

      <SettingRow
        title={copy.cashCheck}
        hint={copy.cashCheckHint}
        control={<Toggle label={copy.cashCheck} checked={settings.cashCheck.enabled} onChange={(enabled) => update({ cashCheck: { enabled } })} />}
      />

      <SettingRow
        title={copy.alerts}
        hint={copy.alertsHint}
        control={<Toggle label={copy.alerts} checked={alerts.enabled} onChange={(enabled) => update({ alerts: { ...alerts, enabled } })} />}
      >
        {alerts.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor={`${id}-warn`} className="block">
              <span className="mb-1.5 block text-sm font-bold">{copy.warnAt}</span>
              <Select id={`${id}-warn`} value={alerts.warnAtPercent} onChange={(e) => update({ alerts: { ...alerts, warnAtPercent: Number(e.target.value) } })}>
                {WARN_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {copy.warnAtOption(level)}
                  </option>
                ))}
              </Select>
            </label>
            <label htmlFor={`${id}-big`} className="block">
              <span className="mb-1.5 block text-sm font-bold">{t.settings.bigPurchase}</span>
              <Select id={`${id}-big`} value={alerts.bigPurchasePercent} onChange={(e) => update({ alerts: { ...alerts, bigPurchasePercent: Number(e.target.value) } })}>
                {BIG_PURCHASE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t.settings.bigPurchaseOption(level)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        )}
      </SettingRow>
    </Card>
  )
}
