import clsx from 'clsx'
import { CircleAlert, Heart, Hourglass, Target, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ExportButton } from '../components/ExportButton'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { AmountInput } from '../components/ui/AmountInput'
import { buttonClass } from '../components/ui/buttonStyles'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { inputClass } from '../components/ui/formStyles'
import { PageHeader } from '../components/ui/PageHeader'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { Stepper } from '../components/ui/Stepper'
import { toast } from '../components/ui/toastStore'
import { t } from '../i18n'
import { todayISO } from '../lib/dates'
import { worthItWorkbook } from '../lib/export/pages'
import { live, nowISO } from '../lib/id'
import { formatDecimal, formatMoney } from '../lib/money'
import { nameOf } from '../lib/transactions'
import { formatWorkTime, monthlySalary } from '../lib/workHours'
import { remindAt, worthItCheck, type BudgetImpact } from '../lib/worthIt'
import { appStore, useAppStore } from '../store'
import type { Profile } from '../types'

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`

function Fact({ icon: Icon, tone, children }: { icon: LucideIcon; tone?: 'warn' | 'crit'; children: ReactNode }) {
  return (
    <li className={clsx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-semibold', tone === 'crit' ? 'bg-crit-soft text-crit-ink' : tone === 'warn' ? 'bg-warn-soft text-warn-ink' : 'bg-surface-2 text-ink')}>
      <Icon aria-hidden className="mt-0.5 size-[1.125rem] shrink-0" />
      <span>{children}</span>
    </li>
  )
}

/** A two-line choice: what it does, and what follows. */
function Choice({ variant, label, hint, onClick }: { variant: 'primary' | 'secondary' | 'ghost'; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={clsx(buttonClass({ variant, size: 'lg', block: true }), 'flex-col gap-0 py-2')}>
      {label}
      {hint && <span className="text-xs font-semibold opacity-80">{hint}</span>}
    </button>
  )
}

/** Turns a price into hours of work, then records the decision: skip, wishlist or buy. */
export function WorthItPage() {
  const id = useId()
  const [params] = useSearchParams()
  const data = useAppStore(
    useShallow((s) => ({
      profile: s.profile,
      settings: s.settings,
      bills: s.bills,
      categories: s.categories,
      transactions: s.transactions,
      goals: s.goals,
      wishlist: s.wishlist,
    })),
  )
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | null>(() => Number(params.get('price')) || null)
  const [categoryId, setCategoryId] = useState(() => params.get('category') ?? '')
  const today = todayISO()
  const { currency } = data.profile
  const money = (amount: number) => formatMoney(amount, currency)
  const copy = t.worthIt
  const check = price && price > 0 ? worthItCheck(price, categoryId || undefined, data, today) : null
  const waiting = live(data.wishlist).filter((w) => w.status === 'thinking').length
  const categoryOptions = live(data.categories)
    .filter((c) => c.kind === 'expense' && c.enabled && !c.system && !c.archived)
    .sort((a, b) => a.order - b.order)

  function reset() {
    setName('')
    setPrice(null)
    setCategoryId('')
  }

  function record(status: 'skipped' | 'thinking') {
    if (!price) return
    const store = appStore.getState()
    const now = new Date()
    const item = store.addWishlistItem({
      name,
      price,
      categoryId: categoryId || undefined,
      status,
      ...(status === 'skipped' ? { decidedAt: now.toISOString() } : { remindAt: remindAt(now, data.settings.coolingOffHours) }),
    })
    reset()
    const undo = { label: t.common.undo, onClick: () => appStore.getState().deleteWishlistItem(item.id) }
    if (status === 'skipped') toast(copy.skipped(money(item.price)), { tone: 'good', action: undo })
    else toast(copy.added(t.format.dateTime(item.remindAt!)), { action: undo })
  }

  function buy() {
    if (!price) return
    const fields = { name, price, categoryId: categoryId || undefined }
    openTransactionSheet('expense', {
      amount: price,
      categoryId: categoryId || undefined,
      note: name.trim() || undefined,
      onSaved: (transaction) => {
        // Switching the sheet to income or a goal isn't buying it.
        if (transaction.type !== 'expense') return
        appStore.getState().addWishlistItem({ ...fields, status: 'bought', decidedAt: nowISO(), transactionId: transaction.id })
        reset()
      },
    })
  }

  return (
    <div className="max-w-xl lg:max-w-none">
      <PageHeader
        title={copy.title}
        actions={
          <Link to="/worth-it/wishlist" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <Heart aria-hidden className="size-4" />
            {copy.wishlistLink}
            {waiting > 0 && (
              <>
                <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-extrabold text-on-accent">{waiting}</span>
                <span className="sr-only">{copy.waiting}</span>
              </>
            )}
          </Link>
        }
      />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div>
          <p className="-mt-3 mb-5 text-[0.9375rem] desk:mt-0 text-ink-2">{copy.intro}</p>

          <div className="space-y-4">
            <Field label={copy.nameLabel} aside={t.common.optional} htmlFor={`${id}-name`}>
              <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} className={inputClass()} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.priceLabel} htmlFor={`${id}-price`}>
                <AmountInput id={`${id}-price`} value={price} onChange={setPrice} currency={currency} />
              </Field>
              <Field label={copy.categoryLabel} aside={t.common.optional} htmlFor={`${id}-category`}>
                <Select id={`${id}-category`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{copy.noCategory}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          {check && !check.work && <SetUpWork profile={data.profile} />}
        </div>

        {!check && <p className="hidden rounded-2xl border border-dashed border-line px-4 py-10 text-center text-[0.9375rem] text-ink-2 lg:block">{copy.resultHint}</p>}

        {check && (
          <section aria-label={copy.resultLabel} aria-live="polite" className="mt-6 lg:sticky lg:top-6 lg:mt-0 desk:top-[5.5rem]">
            {check.work && (
              <div className="flex flex-col items-center rounded-2xl bg-accent-soft px-4 py-5 text-center text-accent">
                <Hourglass aria-hidden className="size-6" />
                <p className="mt-1 text-4xl font-extrabold tracking-tight">{formatWorkTime(check.work)}</p>
                <p className="text-sm font-semibold">
                  {check.work.workDays >= 1 ? copy.ofWork(formatDecimal(check.work.workDays)) : copy.ofWorkShort}
                </p>
              </div>
            )}

            <ul className="mt-3 space-y-2">
              {check.salaryShare !== null && <Fact icon={Wallet}>{copy.salaryShare(percent(check.salaryShare))}</Fact>}
              {check.budget && <BudgetFact impact={check.budget} name={nameOf(data.categories, categoryId)} money={money} />}
              {check.goal && <Fact icon={Target}>{copy.goalDelay(check.goal.goal.name, check.goal.days)}</Fact>}
            </ul>

            {check.work && (
              <div className="mt-4">
                <p className="mb-1.5 text-sm font-bold text-ink-2">{copy.basisLabel}</p>
                <div>
                  <SegmentedControl
                    label={copy.basisLabel}
                    value={data.profile.hourlyRateBasis}
                    onChange={(hourlyRateBasis) => appStore.getState().updateProfile({ hourlyRateBasis })}
                    options={[
                      { value: 'net-salary', label: copy.basis['net-salary'] },
                      { value: 'after-bills', label: copy.basis['after-bills'] },
                    ]}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <Choice variant="primary" label={copy.skip} hint={copy.skipHint(money(price!))} onClick={() => record('skipped')} />
              <Choice variant="secondary" label={copy.wishlist} hint={copy.wishlistHint(data.settings.coolingOffHours)} onClick={() => record('thinking')} />
              <Choice variant="ghost" label={copy.buy} onClick={buy} />
            </div>
            {/* Here, not in the header: a phone's header has no room left for the title. */}
            <div className="mt-3 flex justify-end">
              <ExportButton workbook={() => worthItWorkbook(appStore.getState(), today, { name, price: price!, categoryId: categoryId || undefined }, check)} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function BudgetFact({ impact, name, money }: { impact: BudgetImpact; name: string; money: (amount: number) => string }) {
  const copy = t.worthIt
  if (impact.kind === 'already-over') {
    return (
      <Fact icon={CircleAlert} tone="crit">
        {copy.alreadyOver(name, money(impact.overBy))}
      </Fact>
    )
  }
  if (impact.kind === 'goes-over') {
    return (
      <Fact icon={TriangleAlert} tone="warn">
        {copy.goesOver(name, money(impact.overBy))}
      </Fact>
    )
  }
  return <Fact icon={Wallet}>{copy.fits(percent(impact.share), name, money(impact.remaining))}</Fact>
}

/** Shown instead of hours when the app doesn't know the salary or the working time yet. */
function SetUpWork({ profile }: { profile: Profile }) {
  const copy = t.worthIt
  const salaryCopy = t.onboarding.salary
  if (monthlySalary(profile.salary) <= 0) {
    return (
      <Card className="mt-6">
        <p className="font-bold">{copy.needSalaryTitle}</p>
        <p className="mt-1 text-[0.9375rem] text-ink-2">{copy.needSalaryBody}</p>
        <Link to="/onboarding/2" className={clsx(buttonClass({ variant: 'secondary', size: 'sm' }), 'mt-3')}>
          {copy.needSalaryAction}
        </Link>
      </Card>
    )
  }
  const setWork = (patch: Partial<Profile['work']>) => appStore.getState().updateProfile({ work: { ...profile.work, ...patch } })
  return (
    <Card className="mt-6 space-y-3">
      <div>
        <p className="font-bold">{copy.needHoursTitle}</p>
        <p className="mt-1 text-[0.9375rem] text-ink-2">{copy.needHoursBody}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={salaryCopy.hoursPerDay}>
          <Stepper
            value={profile.work.hoursPerDay}
            onChange={(hoursPerDay) => setWork({ hoursPerDay })}
            min={0}
            max={16}
            label={salaryCopy.hoursPerDay}
            decreaseLabel={salaryCopy.fewerHours}
            increaseLabel={salaryCopy.moreHours}
          />
        </Field>
        <Field label={salaryCopy.daysPerWeek}>
          <Stepper
            value={profile.work.daysPerWeek}
            onChange={(daysPerWeek) => setWork({ daysPerWeek })}
            min={0}
            max={7}
            label={salaryCopy.daysPerWeek}
            decreaseLabel={salaryCopy.fewerDays}
            increaseLabel={salaryCopy.moreDays}
          />
        </Field>
      </div>
    </Card>
  )
}
