import clsx from 'clsx'
import { ClipboardCheck } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { SumBand, SumCell } from '../components/desk/Panel'
import { CardHeader, SeeAll } from '../components/home/HomeCards'
import { reviewResult, tipText } from '../components/review/reviewText'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { Button, IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { Card } from '../components/ui/Card'
import { CategoryBadge } from '../components/ui/CategoryBadge'
import { ChevronLeft, ChevronRight } from '../components/ui/directionalIcons'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { toast } from '../components/ui/toastStore'
import { StatsTabs } from '../components/stats/StatsTabs'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { getPayCycle, nextCycle, previousCycle, todayISO } from '../lib/dates'
import { live } from '../lib/id'
import { formatMoney } from '../lib/money'
import { cycleReview, lastEndedCycle, type ReviewTip } from '../lib/review'
import { nameOf } from '../lib/transactions'
import { isValidDate } from '../lib/validation'
import { appStore, useAppStore } from '../store'

const REVIEW_CARD = 'flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5'
const REVIEW_EMPTY = 'flex flex-1 items-center justify-center rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-ink-2'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-extrabold desk:text-base">{title}</h2>
      {children}
    </section>
  )
}

/** A finished pay cycle looked back on: how it ended, what changed, and what to adjust, with a button for each. */
export function ReviewPage() {
  const [params, setParams] = useSearchParams()
  const desktop = useIsDesktop()
  const data = useAppStore(
    useShallow((s) => ({ profile: s.profile, settings: s.settings, categories: s.categories, transactions: s.transactions, bills: s.bills, goals: s.goals, debts: s.debts, incomes: s.incomes, accounts: s.accounts })),
  )
  const today = todayISO()
  const { salary } = data.profile
  const latest = lastEndedCycle(today, salary)
  const asked = params.get('cycle')
  // Only cycles that have ended: today's isn't over yet.
  const cycle = asked && isValidDate(asked) && asked <= latest.start ? getPayCycle(asked, salary) : latest
  const review = useMemo(() => cycleReview(data, getPayCycle(cycle.start, salary)), [data, cycle.start, salary])
  const money = (amount: number) => formatMoney(amount, data.profile.currency)
  const copy = t.review
  const hasGoals = live(data.goals).some((g) => !g.archived)
  const firstEntry = live(data.transactions).reduce<string | null>((first, tx) => (first === null || tx.date < first ? tx.date : first), null)
  const earlier = previousCycle(cycle, salary)
  const canGoBack = firstEntry !== null && earlier.end >= firstEntry
  const statsLink = `/stats?period=custom&from=${cycle.start}&to=${cycle.end}`

  if (firstEntry === null || cycle.end < firstEntry) {
    return (
      <>
        {desktop ? <PageHeader title={copy.title} nav={<StatsTabs />} centerNav /> : <PageHeader title={copy.title} backTo="/" showSettings={false} />}
        <EmptyState icon={ClipboardCheck} title={copy.title} body={copy.empty} />
      </>
    )
  }

  const setLimit = (tip: Extract<ReviewTip, { kind: 'raise-limit' | 'lower-limit' }>) => {
    const store = appStore.getState()
    store.setCategoryBudgets({ [tip.categoryId]: { monthlyBudget: tip.to } })
    toast(copy.limitSet(nameOf(data.categories, tip.categoryId), money(tip.to)), {
      tone: 'good',
      action: { label: t.common.undo, onClick: () => appStore.getState().setCategoryBudgets({ [tip.categoryId]: { monthlyBudget: tip.from } }) },
    })
  }

  const action = (tip: ReviewTip): ReactNode => {
    switch (tip.kind) {
      case 'raise-limit':
        return <Button size="sm" onClick={() => setLimit(tip)}>{copy.raiseAction(money(tip.to))}</Button>
      case 'lower-limit':
        return <Button size="sm" variant="secondary" onClick={() => setLimit(tip)}>{copy.lowerAction(money(tip.to))}</Button>
      case 'put-aside':
        // Dated on the cycle's last day, so it comes out of that cycle, not this one.
        return hasGoals ? (
          <Button size="sm" onClick={() => openTransactionSheet('goal', { amount: tip.amount, date: cycle.end })}>
            {copy.putAsideAction}
          </Button>
        ) : (
          <Link to="/plan/goals?add=1" className={buttonClass({ size: 'sm', variant: 'secondary' })}>
            {t.goals.add}
          </Link>
        )
      case 'over':
        return (
          <Link to={statsLink} className={buttonClass({ size: 'sm', variant: 'secondary' })}>
            {copy.overAction}
          </Link>
        )
    }
  }

  const pick = (start: string) => setParams(start === latest.start ? {} : { cycle: start })
  // In the top bar on a computer; under the title on a phone, which needs the room for it.
  const switcher = (
    <div className="flex items-center gap-1 desk:shrink-0 desk:rounded-xl desk:border desk:border-line desk:bg-surface">
      <IconButton icon={ChevronLeft} label={copy.previous} variant="ghost" disabled={!canGoBack} className="disabled:opacity-30" onClick={() => pick(earlier.start)} />
      <p className="min-w-32 text-center text-sm font-extrabold desk:min-w-36 desk:whitespace-nowrap desk:text-base">{t.format.range(cycle.start, cycle.end)}</p>
      <IconButton icon={ChevronRight} label={copy.next} variant="ghost" disabled={cycle.start === latest.start} className="disabled:opacity-30" onClick={() => pick(nextCycle(cycle, salary).start)} />
    </div>
  )

  if (desktop) {
    const ended = review.left < 0
    return (
      <>
        <PageHeader title={copy.title} nav={<StatsTabs />} centerNav actions={switcher} />
        <div className="space-y-6 @container">
          <div className="grid gap-6 @min-[66rem]:grid-cols-3">
            <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-muted">{copy.resultTitle}</p>
              <p className={clsx('mt-1 text-3xl font-extrabold tracking-tight', ended ? 'text-crit-ink' : 'text-accent')}>{reviewResult(review, money)}</p>
              <div aria-hidden className="min-h-4 grow" />
              <SeeAll to={statsLink} label={copy.stats} />
            </section>
            <SumBand
              label={copy.resultTitle}
              columns={2}
              className="@min-[66rem]:col-span-2"
              secondRow={
                <>
                  <SumCell label={copy.saved} value={money(review.saved)} />
                  <SumCell sign="" label={copy.kept} value={review.savingsRate === null ? '–' : `${Math.round(review.savingsRate * 100)}%`} tone={review.savingsRate !== null && review.savingsRate < 0 ? 'crit' : undefined} />
                </>
              }
            >
              <SumCell label={copy.income} value={money(review.income)} tone={review.income > 0 ? 'good' : undefined} />
              <SumCell sign="" label={copy.spent} value={money(review.spent)} />
            </SumBand>
          </div>

          <div className="grid gap-6 @min-[66rem]:grid-cols-3">
            <section className={clsx(REVIEW_CARD, '@min-[66rem]:col-span-2')}>
              <CardHeader title={copy.tipsTitle} />
              {review.tips.length > 0 ? (
                <ul className="grid flex-1 content-around divide-y divide-line">
                  {review.tips.map((tip) => (
                    <li key={`${tip.kind}-${'categoryId' in tip ? tip.categoryId : ''}`} className="flex items-center justify-between gap-6 py-3 first:pt-1 last:pb-1">
                      <p className="min-w-0 flex-1 text-sm">{tipText(tip, data.categories, money)}</p>
                      <div className="shrink-0">{action(tip)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={REVIEW_EMPTY}>{copy.tipsNone}</p>
              )}
            </section>

            <section className={REVIEW_CARD}>
              <CardHeader title={copy.changesTitle} />
              {review.changes.length > 0 ? (
                <ul className="grid flex-1 content-around divide-y divide-line">
                  {review.changes.map((change) => (
                    <li key={change.categoryId} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                      <CategoryBadge categories={data.categories} id={change.categoryId} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{nameOf(data.categories, change.categoryId)}</span>
                        <span className="block truncate text-xs text-muted">{copy.change(money(change.spent), money(change.previous))}</span>
                      </span>
                      <span className={clsx('shrink-0 text-sm font-extrabold tabular-nums', change.difference > 0 ? 'text-warn-ink' : 'text-good-ink')}>{formatMoney(change.difference, data.profile.currency, { signed: true })}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={REVIEW_EMPTY}>{copy.changesNone}</p>
              )}
            </section>
          </div>

          {review.over.length > 0 && (
            <section className={REVIEW_CARD}>
              <CardHeader title={copy.overTitle} />
              <ul className="grid gap-x-12 gap-y-1 @min-[48rem]:grid-cols-2 @min-[66rem]:grid-cols-3">
                {review.over.map((item) => (
                  <li key={item.categoryId} className="flex items-center gap-3 py-1.5">
                    <CategoryBadge categories={data.categories} id={item.categoryId} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{nameOf(data.categories, item.categoryId)}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-crit-ink">{copy.overLine(money(item.by))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title={copy.title} backTo="/" showSettings={false} />
      <div className="-mt-2 mb-4">{switcher}</div>

      <div className="space-y-6">
        <Card>
          <p className="text-sm font-semibold text-muted">{copy.resultTitle}</p>
          <p className={clsx('text-2xl font-extrabold tracking-tight', review.left < 0 && 'text-crit-ink')}>{reviewResult(review, money)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              [copy.income, money(review.income)],
              [copy.spent, money(review.spent)],
              [copy.saved, money(review.saved)],
              [copy.kept, review.savingsRate === null ? '–' : `${Math.round(review.savingsRate * 100)}%`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="font-extrabold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <Link to={statsLink} className="mt-4 inline-block text-sm font-bold text-accent underline-offset-2 hover:underline">
            {copy.stats}
          </Link>
        </Card>

        <Section title={copy.tipsTitle}>
          {review.tips.length > 0 ? (
            <ul className="space-y-2">
              {review.tips.map((tip) => (
                <li key={`${tip.kind}-${'categoryId' in tip ? tip.categoryId : ''}`} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-[0.9375rem]">{tipText(tip, data.categories, money)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{action(tip)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[0.9375rem] text-ink-2">{copy.tipsNone}</p>
          )}
        </Section>

        <Section title={copy.changesTitle}>
          {review.changes.length > 0 ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
              {review.changes.map((change) => {
                const category = data.categories.find((c) => c.id === change.categoryId)
                const up = change.difference > 0
                return (
                  <li key={change.categoryId} className="flex items-center gap-3 py-3">
                    <Icon name={category?.icon ?? 'package'} className="size-5 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{category?.name}</span>
                      <span className="block text-sm text-muted">{copy.change(money(change.spent), money(change.previous))}</span>
                    </span>
                    <span className={clsx('shrink-0 font-extrabold tabular-nums', up ? 'text-warn-ink' : 'text-good-ink')}>{formatMoney(change.difference, data.profile.currency, { signed: true })}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[0.9375rem] text-ink-2">{copy.changesNone}</p>
          )}
        </Section>

        {review.over.length > 0 && (
          <Section title={copy.overTitle}>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
              {review.over.map((item) => (
                <li key={item.categoryId} className="flex items-baseline justify-between gap-3 py-3">
                  <span className="font-bold">{nameOf(data.categories, item.categoryId)}</span>
                  <span className="text-sm font-semibold text-crit-ink">{copy.overLine(money(item.by))}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}
