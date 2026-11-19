import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ExportButton } from '../components/ExportButton'
import { ASSET_ICONS } from '../components/netWorth/assetParts'
import { AssetSheet } from '../components/netWorth/AssetSheet'
import { AssetValueSheet } from '../components/netWorth/AssetValueSheet'
import { NetWorthChart } from '../components/netWorth/NetWorthChart'
import { StatsTabs } from '../components/stats/StatsTabs'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SummarySplit } from '../components/ui/SummarySplit'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { formatAmounts } from '../lib/currency'
import { todayISO } from '../lib/dates'
import { netWorthWorkbook } from '../lib/export/pages'
import { live } from '../lib/id'
import { formatMoney, formatNumber } from '../lib/money'
import { assetValueAt, latestAssetValue, netWorthChange, netWorthHistory, netWorthOn, type NetWorthPart } from '../lib/netWorth'
import { appStore, useAppStore } from '../store'
import type { Asset } from '../types'

const PART_ORDER: NetWorthPart[] = ['wallets', 'goals', 'owedToYou', 'assets', 'youOwe']

/** Everything you have minus what you owe, per currency, how it has changed, and the assets that count in it. */
export function NetWorthPage() {
  const data = useAppStore(useShallow((s) => ({ profile: s.profile, accounts: s.accounts, transactions: s.transactions, goals: s.goals, debts: s.debts, assets: s.assets })))
  const desktop = useIsDesktop()
  const today = todayISO()
  const main = data.profile.currency
  const copy = t.netWorth
  const rows = useMemo(() => netWorthOn(data, today), [data, today])
  const history = useMemo(() => netWorthHistory(data, today), [data, today])
  const [editing, setEditing] = useState<Asset | 'new' | null>(null)
  const [valuing, setValuing] = useState<Asset | null>(null)

  const [mainRow, ...others] = rows
  const previous = history.length >= 2 ? history[history.length - 2] : null
  const change = previous ? netWorthChange(mainRow, previous.row).total : null
  const assets = live(data.assets)
  const owned = assets.filter((a) => !a.soldAt || a.soldAt > today).sort((a, b) => latestAssetValue(b).value - latestAssetValue(a).value)
  const sold = assets.filter((a) => a.soldAt && a.soldAt <= today)
  const money = (amount: number, currency = main) => formatMoney(amount, currency)
  const partAmounts = (part: NetWorthPart) => rows.filter((r) => r[part] !== 0).map((r) => ({ currency: r.currency, amount: part === 'youOwe' ? -r[part] : r[part] }))

  return (
    <>
      {desktop ? (
        <PageHeader title={copy.title} nav={<StatsTabs />} centerNav actions={<ExportButton iconOnly workbook={() => netWorthWorkbook(appStore.getState(), today)} />} />
      ) : (
        <PageHeader title={copy.title} subtitle={copy.subtitle} backTo="/wallets" showSettings={false} actions={<ExportButton workbook={() => netWorthWorkbook(appStore.getState(), today)} />} />
      )}
      <SummarySplit
        summary={
          <>
            <Card>
              <p className="text-sm font-semibold text-muted">{copy.total}</p>
              <p className={clsx('text-3xl font-extrabold tracking-tight tabular-nums', mainRow.total < 0 && 'text-crit-ink')}>{money(mainRow.total)}</p>
              {change !== null && previous && (
                <p className={clsx('mt-0.5 text-sm font-bold', change > 0 ? 'text-good-ink' : change < 0 ? 'text-crit-ink' : 'text-muted')}>
                  {change === 0 ? copy.unchanged(t.format.date(previous.date)) : copy.since(formatMoney(change, main, { signed: true }), t.format.date(previous.date))}
                </p>
              )}
              {others.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-sm font-semibold text-muted">{copy.otherTotals}</p>
                  <p className="text-lg font-extrabold tracking-tight tabular-nums text-ink-2">{formatAmounts(others.map((r) => ({ currency: r.currency, amount: r.total })), main)}</p>
                  <p className="mt-1 text-xs text-muted">{copy.otherNote}</p>
                </div>
              )}
            </Card>

            <Card className="mt-3">
              <h2 className="mb-1 text-sm font-extrabold">{copy.partsTitle}</h2>
              <dl className="divide-y divide-line">
                {PART_ORDER.map((part) => (
                  <div key={part} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-sm font-semibold text-ink-2">{copy.parts[part]}</dt>
                    <dd className="text-end font-extrabold tabular-nums">
                      {/* One amount never breaks across lines; several break between currencies. */}
                      {partAmounts(part).length === 0
                        ? money(0)
                        : partAmounts(part).map(({ currency, amount }, i) => (
                            <span key={currency} className="whitespace-nowrap">
                              {i > 0 && ' · '}
                              {money(amount, currency)}
                            </span>
                          ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        }
      >
        <div className="mt-6 space-y-6 lg:mt-0">
          {history.length >= 2 ? (
            <NetWorthChart points={history} currency={main} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.9375rem] text-ink-2">{copy.historySoon}</p>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold">{copy.assetsTitle}</h2>
              {owned.length > 0 && (
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
                  {copy.addAsset}
                </Button>
              )}
            </div>
            {owned.length > 0 ? (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                {owned.map((asset) => (
                  <AssetRow key={asset.id} asset={asset} today={today} main={main} onEdit={() => setEditing(asset)} onValue={() => setValuing(asset)} />
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
                <p className="mx-auto max-w-md text-[0.9375rem] text-ink-2">{copy.assetsHint}</p>
                <Button icon={Plus} onClick={() => setEditing('new')} className="mt-4">
                  {copy.addAsset}
                </Button>
              </div>
            )}
          </section>

          {sold.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-extrabold">{copy.soldTitle}</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                {sold.map((asset) => (
                  <li key={asset.id}>
                    <button type="button" onClick={() => setEditing(asset)} aria-label={copy.edit(asset.name)} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-start">
                      <span className="min-w-0 truncate font-semibold">{asset.name}</span>
                      <span className="shrink-0 text-sm text-muted">{copy.soldOn(t.format.date(asset.soldAt!))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SummarySplit>

      <AssetSheet asset={editing} currency={main} onClose={() => setEditing(null)} />
      <AssetValueSheet asset={valuing} onClose={() => setValuing(null)} />
    </>
  )
}

function AssetRow({ asset, today, main, onEdit, onValue }: { asset: Asset; today: string; main: string; onEdit: () => void; onValue: () => void }) {
  const copy = t.netWorth
  const KindIcon = ASSET_ICONS[asset.kind]
  const value = assetValueAt(asset, today) ?? latestAssetValue(asset)
  const details = [asset.kind === 'gold' && asset.grams ? copy.grams(formatNumber(asset.grams)) : null, copy.valuedOn(t.format.date(value.date))].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <KindIcon className="size-5" />
      </span>
      <button type="button" onClick={onEdit} aria-label={copy.edit(asset.name)} className="min-w-0 flex-1 text-start">
        <span className="block truncate font-bold">{asset.name}</span>
        <span className="block text-sm text-muted">{details}</span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-extrabold tabular-nums">{formatMoney(value.value, asset.currency ?? main)}</span>
        <Button variant="ghost" size="sm" onClick={onValue} aria-label={copy.newValueFor(asset.name)} className="-me-2">
          {copy.newValue}
        </Button>
      </span>
    </li>
  )
}
