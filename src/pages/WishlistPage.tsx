import { Heart, X } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ExportButton } from '../components/ExportButton'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { Button, IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusChip } from '../components/ui/StatusChip'
import { toast } from '../components/ui/toastStore'
import { t } from '../i18n'
import { totalMonthlyBills } from '../lib/bills'
import { todayISO } from '../lib/dates'
import { wishlistWorkbook } from '../lib/export/pages'
import { live } from '../lib/id'
import { formatMoney, sumAmounts } from '../lib/money'
import { formatWorkTime, hourlyRate, workTimeFor } from '../lib/workHours'
import { appStore, useAppStore } from '../store'
import type { WishlistItem } from '../types'

const newestDecision = (a: WishlistItem, b: WishlistItem) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')

/** Purchases being thought over, and what was decided about the others. */
export function WishlistPage() {
  const { wishlist, categories, profile, bills } = useAppStore(
    useShallow((s) => ({ wishlist: s.wishlist, categories: s.categories, profile: s.profile, bills: s.bills })),
  )
  const items = useMemo(() => live(wishlist), [wishlist])
  const thinking = items.filter((w) => w.status === 'thinking').sort((a, b) => (a.remindAt ?? '').localeCompare(b.remindAt ?? ''))
  const skipped = items.filter((w) => w.status === 'skipped').sort(newestDecision)
  const bought = items.filter((w) => w.status === 'bought').sort(newestDecision)
  const rate = hourlyRate(profile, totalMonthlyBills(bills))
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const now = new Date().toISOString()
  const copy = t.wishlist
  const nameFor = (item: WishlistItem) => item.name || t.worthIt.unnamed
  const iconFor = (item: WishlistItem) => categories.find((c) => c.id === item.categoryId)?.icon ?? 'heart-pulse'

  function skip(item: WishlistItem) {
    appStore.getState().decideWishlistItem(item.id, 'skipped')
    toast(copy.skippedToast(nameFor(item), money(item.price)), { tone: 'good' })
  }

  function buy(item: WishlistItem) {
    openTransactionSheet('expense', {
      amount: item.price,
      categoryId: item.categoryId,
      note: item.name || undefined,
      onSaved: (transaction) => {
        if (transaction.type === 'expense') appStore.getState().decideWishlistItem(item.id, 'bought', transaction.id)
      },
    })
  }

  function remove(item: WishlistItem) {
    appStore.getState().deleteWishlistItem(item.id)
    toast(copy.removed(nameFor(item)), { action: { label: t.common.undo, onClick: () => appStore.getState().restoreWishlistItem(item.id) } })
  }

  const header = (
    <PageHeader
      title={copy.title}
      subtitle={copy.subtitle}
      backTo="/worth-it"
      showSettings={false}
      actions={items.length > 0 && <ExportButton workbook={() => wishlistWorkbook(appStore.getState(), todayISO())} />}
    />
  )
  if (items.length === 0) {
    return (
      <div className="max-w-xl">
        {header}
        <EmptyState
          icon={Heart}
          title={copy.emptyTitle}
          body={copy.emptyBody}
          action={
            <Link to="/worth-it" className={buttonClass()}>
              {copy.check}
            </Link>
          }
        />
      </div>
    )
  }

  const decidedList = (list: WishlistItem[]) => (
    <ul className="rounded-2xl border border-line bg-surface p-1">
      {list.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-2 py-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
            <Icon name={iconFor(item)} className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{nameFor(item)}</span>
            {item.decidedAt && <span className="block text-sm text-muted">{copy.decidedOn(t.format.relative(item.decidedAt))}</span>}
          </span>
          <span className="shrink-0 font-extrabold tabular-nums">{money(item.price)}</span>
          <IconButton icon={X} label={copy.remove(nameFor(item))} variant="ghost" onClick={() => remove(item)} className="-me-1" />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="max-w-xl lg:max-w-none">
      {header}

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        {thinking.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-extrabold">{copy.thinking}</h2>
            <ul className="space-y-3">
              {thinking.map((item) => {
                const ready = !!item.remindAt && item.remindAt <= now
                return (
                  <li key={item.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                        <Icon name={iconFor(item)} className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{nameFor(item)}</p>
                        <p className="text-sm text-muted">
                          {money(item.price)}
                          {rate && ` · ${copy.workTime(formatWorkTime(workTimeFor(item.price, rate, profile.work.hoursPerDay)))}`}
                        </p>
                        <div className="mt-1.5">
                          {ready ? (
                            <StatusChip tone="info">{copy.ready}</StatusChip>
                          ) : (
                            item.remindAt && <span className="text-xs font-semibold text-muted">{copy.askAgain(t.format.dateTime(item.remindAt))}</span>
                          )}
                        </div>
                      </div>
                      <IconButton icon={X} label={copy.remove(nameFor(item))} variant="ghost" onClick={() => remove(item)} className="-me-2 -mt-2" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => buy(item)} aria-label={copy.buyLabel(nameFor(item))}>
                        {copy.buy}
                      </Button>
                      <Button onClick={() => skip(item)} aria-label={copy.skipLabel(nameFor(item))}>
                        {copy.skip}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <div className="lg:[&>:first-child]:mt-0">
          {skipped.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-extrabold">{copy.skippedTitle}</h2>
              <p className="mb-2 text-sm text-good-ink">{copy.skippedTotal(money(sumAmounts(skipped.map((w) => w.price))), skipped.length)}</p>
              {decidedList(skipped)}
            </section>
          )}

          {bought.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-extrabold">{copy.boughtTitle}</h2>
              {decidedList(bought)}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
