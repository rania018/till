import { useId, useState } from 'react'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { formatMoney, formatNumber, roundMoney } from '../../lib/money'
import { latestAssetValue } from '../../lib/netWorth'
import { appStore } from '../../store'
import type { Asset } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { toast } from '../ui/toastStore'
import { weighedValue } from './assetParts'

/** What an asset is worth now, or from another day. Weighed gold asks for the price of a gram. */
export function AssetValueSheet({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  return (
    <BottomSheet open={asset !== null} onOpenChange={(open) => !open && onClose()} title={asset ? t.assetSheet.valueTitle(asset.name) : ''}>
      {asset && <ValueForm key={asset.id} asset={asset} onDone={onClose} />}
    </BottomSheet>
  )
}

function ValueForm({ asset, onDone }: { asset: Asset; onDone: () => void }) {
  const id = useId()
  const copy = t.assetSheet
  const today = todayISO()
  const latest = latestAssetValue(asset)
  const grams = asset.kind === 'gold' && asset.grams ? asset.grams : null
  const [perGram, setPerGram] = useState<number | null>(grams ? (latest.perGram ?? roundMoney(latest.value / grams)) : null)
  const [worth, setWorth] = useState<number | null>(latest.value)
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const currency = asset.currency ?? appStore.getState().profile.currency
  const money = (amount: number) => formatMoney(amount, currency)
  const value = grams ? weighedValue(grams, perGram) : worth

  function save() {
    try {
      if (value === null) throw new Error(grams ? t.errors.assetPerGram : t.errors.assetValue)
      const undo = appStore.getState().setAssetValue(asset.id, { date, value, perGram: grams ? (perGram ?? undefined) : undefined })
      onDone()
      toast(copy.valueSaved, { tone: 'good', action: { label: t.common.undo, onClick: undo } })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      {grams ? (
        <Field label={copy.perGram} htmlFor={`${id}-value`} hint={value !== null ? copy.total(formatNumber(grams), money(perGram ?? 0), money(value)) : undefined}>
          <AmountInput id={`${id}-value`} value={perGram} onChange={setPerGram} currency={currency} size="lg" autoFocus />
        </Field>
      ) : (
        <Field label={copy.worth} htmlFor={`${id}-value`}>
          <AmountInput id={`${id}-value`} value={worth} onChange={setWorth} currency={currency} size="lg" autoFocus />
        </Field>
      )}
      <Field label={copy.valueDate} htmlFor={`${id}-date`} hint={copy.valueDateHint}>
        <input id={`${id}-date`} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass()} />
      </Field>
      {error && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <Button type="submit" block size="lg">
        {copy.saveValue}
      </Button>
    </form>
  )
}
