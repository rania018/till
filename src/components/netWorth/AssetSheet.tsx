import { Trash2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { formatMoney, formatNumber, roundMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import type { Asset, AssetKind } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button, IconButton } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { toast } from '../ui/toastStore'
import { ASSET_KINDS, weighedValue } from './assetParts'

interface AssetSheetProps {
  /** The asset to edit, `'new'` to add one, or `null` to close the sheet. */
  asset: Asset | 'new' | null
  currency: string
  onClose: () => void
}

/** Add or edit an asset. A new one is given its first value here; later values come from "New value". */
export function AssetSheet({ asset, currency, onClose }: AssetSheetProps) {
  const copy = t.assetSheet
  const existing = asset && asset !== 'new' ? asset : undefined
  return (
    <BottomSheet open={asset !== null} onOpenChange={(open) => !open && onClose()} title={existing ? copy.editTitle : copy.newTitle}>
      {asset && <AssetForm key={existing?.id ?? 'new'} existing={existing} currency={currency} onDone={onClose} />}
    </BottomSheet>
  )
}

function AssetForm({ existing, currency, onDone }: { existing?: Asset; currency: string; onDone: () => void }) {
  const id = useId()
  const copy = t.assetSheet
  const today = todayISO()
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<AssetKind>(existing?.kind ?? 'gold')
  const [assetCurrency, setAssetCurrency] = useState(existing?.currency ?? currency)
  const [grams, setGrams] = useState<number | null>(existing?.grams ?? null)
  const [worth, setWorth] = useState<number | null>(null)
  const [perGram, setPerGram] = useState<number | null>(null)
  const [from, setFrom] = useState(today)
  const [sold, setSold] = useState(!!existing?.soldAt)
  const [soldAt, setSoldAt] = useState(existing?.soldAt ?? today)
  const [error, setError] = useState<string | null>(null)
  // The values shown are the saved ones, so removing one shows straight away.
  const values = useAppStore((s) => s.assets.find((a) => a.id === existing?.id)?.values) ?? []
  const currencyChoices = [...new Set([currency, ...Object.keys(t.settings.currencies), assetCurrency])]
  const weighed = kind === 'gold' && grams !== null && grams > 0
  const value = weighed ? weighedValue(grams, perGram) : worth
  const money = (amount: number) => formatMoney(amount, assetCurrency)

  function save() {
    const store = appStore.getState()
    const fields = { name: name.trim(), kind, currency: assetCurrency, grams: kind === 'gold' ? (grams ?? undefined) : undefined }
    try {
      if (existing) {
        store.updateAsset(existing.id, { ...fields, soldAt: sold ? soldAt : undefined })
        toast(copy.saved, { tone: 'good' })
      } else {
        // In the order of the form, so the first thing to fix is named first.
        if (!fields.name) throw new Error(t.errors.assetName)
        if (value === null) throw new Error(weighed ? t.errors.assetPerGram : t.errors.assetValue)
        store.addAsset({ ...fields, value: { date: from, value, perGram: weighed ? (perGram ?? undefined) : undefined } })
        toast(copy.added(fields.name), { tone: 'good' })
      }
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function removeValue(valueId: string) {
    if (!existing) return
    try {
      appStore.getState().deleteAssetValue(existing.id, valueId)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function remove() {
    if (!existing) return
    const { id: assetId, name: assetName } = existing
    appStore.getState().deleteAsset(assetId)
    onDone()
    toast(copy.removed(assetName), { action: { label: t.common.undo, onClick: () => appStore.getState().restoreAsset(assetId) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={copy.name} htmlFor={`${id}-name`}>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} className={inputClass()} />
      </Field>
      <Field label={copy.kind}>
        <SegmentedControl label={copy.kind} value={kind} onChange={setKind} options={ASSET_KINDS.map((k) => ({ value: k, label: t.netWorth.kinds[k] }))} />
      </Field>
      <Field label={copy.currency} htmlFor={`${id}-currency`}>
        <Select id={`${id}-currency`} value={assetCurrency} onChange={(e) => setAssetCurrency(e.target.value)}>
          {currencyChoices.map((code) => (
            <option key={code} value={code}>
              {t.settings.currencies[code] ?? code}
            </option>
          ))}
        </Select>
      </Field>
      {kind === 'gold' && (
        <Field label={copy.grams} htmlFor={`${id}-grams`} aside={t.common.optional} hint={copy.gramsHint}>
          <AmountInput id={`${id}-grams`} value={grams} onChange={setGrams} unit={copy.gramUnit} />
        </Field>
      )}

      {!existing && (
        <>
          {weighed ? (
            <Field label={copy.perGram} htmlFor={`${id}-value`} hint={value !== null ? copy.total(formatNumber(grams), money(perGram ?? 0), money(value)) : undefined}>
              <AmountInput id={`${id}-value`} value={perGram} onChange={setPerGram} currency={assetCurrency} />
            </Field>
          ) : (
            <Field label={copy.worth} htmlFor={`${id}-value`}>
              <AmountInput id={`${id}-value`} value={worth} onChange={setWorth} currency={assetCurrency} />
            </Field>
          )}
          <Field label={copy.from} htmlFor={`${id}-from`} hint={copy.fromHint}>
            <input id={`${id}-from`} type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputClass()} />
          </Field>
        </>
      )}

      {existing && values.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold">{copy.history}</h3>
          <ul className="divide-y divide-line rounded-xl border border-line px-3">
            {[...values]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((v) => (
                <li key={v.id} className="flex min-h-11 items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{t.format.date(v.date)}</span>
                    {v.perGram !== undefined && <span className="text-muted"> · {t.netWorth.gramsAt(formatNumber(roundMoney(v.value / v.perGram)), money(v.perGram))}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{money(v.value)}</span>
                  {values.length > 1 && <IconButton icon={X} variant="ghost" label={copy.removeValue(t.format.date(v.date))} onClick={() => removeValue(v.id)} className="-me-2" />}
                </li>
              ))}
          </ul>
        </section>
      )}

      {existing &&
        (sold ? (
          <Field label={copy.soldDate} htmlFor={`${id}-sold`} hint={copy.soldHint}>
            <div className="flex items-center gap-2">
              <input id={`${id}-sold`} type="date" value={soldAt} onChange={(e) => e.target.value && setSoldAt(e.target.value)} className={inputClass()} />
              <Button variant="ghost" size="sm" onClick={() => setSold(false)} className="shrink-0">
                {copy.stillMine}
              </Button>
            </div>
          </Field>
        ) : (
          <Button variant="secondary" block onClick={() => setSold(true)}>
            {copy.sold}
          </Button>
        ))}

      {error && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <Button type="submit" block size="lg">
        {copy.save}
      </Button>
      {existing && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" icon={Trash2} onClick={remove}>
            {copy.remove}
          </Button>
        </div>
      )}
    </form>
  )
}
