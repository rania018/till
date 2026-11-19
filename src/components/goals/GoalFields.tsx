import clsx from 'clsx'
import { addDays } from 'date-fns'
import { useId, useRef } from 'react'
import { t } from '../../i18n'
import { fromISODate, todayISO, toISODate } from '../../lib/dates'
import { nextHijriDate, occurrenceFrom } from '../../lib/funds'
import { goalForecast, suggestedContribution } from '../../lib/goals'
import { formatMoney } from '../../lib/money'
import { goalRoomError } from '../../lib/validation'
import { AmountInput } from '../ui/AmountInput'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { Icon } from '../ui/Icon'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import type { FundRepeat, ISODate, Salary } from '../../types'
import { draftPreview, GOAL_ICONS, type GoalDraft, type GoalDraftErrors, type GoalKind } from './goalDraft'

type IdeaKey = keyof typeof t.goalForm.ideas
type FundIdeaKey = keyof typeof t.funds.ideas

const IDEAS: { key: IdeaKey; icon: string }[] = [
  { key: 'emergency', icon: 'shield' },
  { key: 'laptop', icon: 'laptop' },
  { key: 'trip', icon: 'plane' },
  { key: 'home', icon: 'house' },
  { key: 'other', icon: 'target' },
]

/** The next 1 September or 1 July. */
function nextDayOfYear(month: number, day: number, today: ISODate): ISODate {
  const year = fromISODate(today).getFullYear()
  const date = toISODate(new Date(year, month - 1, day))
  return date >= today ? date : toISODate(new Date(year + 1, month - 1, day))
}

/** Costs that come back, each with its next date: Ramadan and Eid follow the Islamic calendar. */
const FUND_IDEAS: { key: FundIdeaKey; icon: string; repeat: FundRepeat; next: (today: ISODate) => ISODate | null }[] = [
  { key: 'ramadan', icon: 'moon', repeat: 'hijri-yearly', next: (today) => nextHijriDate(9, 1, today) },
  { key: 'eid', icon: 'gift', repeat: 'hijri-yearly', next: (today) => nextHijriDate(12, 10, today) },
  { key: 'school', icon: 'backpack', repeat: 'yearly', next: (today) => nextDayOfYear(9, 1, today) },
  { key: 'summer', icon: 'sun', repeat: 'yearly', next: (today) => nextDayOfYear(7, 1, today) },
  { key: 'other', icon: 'piggy-bank', repeat: 'yearly', next: () => null },
]

const REPEATS: FundRepeat[] = ['yearly', 'hijri-yearly']

const chip = (selected: boolean) =>
  clsx(
    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors',
    selected ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface hover:bg-surface-2',
  )

interface GoalFieldsProps {
  draft: GoalDraft
  onChange: (patch: Partial<GoalDraft>) => void
  errors: GoalDraftErrors
  currency: string
  /** Paydays the forecast counts on. */
  salary: Pick<Salary, 'frequency' | 'payday'>
  /** The most this goal can plan each month: salary − bills − other goals. `null` without a salary. */
  room: number | null
  /** Name-and-icon shortcuts for a new goal. */
  showIdeas?: boolean
  showIconPicker?: boolean
  /** Put aside minus taken out in the app so far, for an existing goal. */
  tracked?: number
  /** Lets a new goal be a fund instead: something needed again every year. */
  showKind?: boolean
  /** A fund for a bill: the bill's name. Its amount and dates come from the bill. */
  billName?: string
  /** A bill's fund: when it's next due, for the forecast. */
  billDue?: ISODate | null
  /** 1 when this month can still take a fund's share, as for a new fund. */
  slotsNow?: number
}

/** The goal form's fields, shared by setup step 5 and the goal sheet. Shows a live forecast under the monthly amount. */
export function GoalFields({ draft, onChange, errors, currency, salary, room, showIdeas, showIconPicker, tracked = 0, showKind, billName, billDue, slotsNow }: GoalFieldsProps) {
  const id = useId()
  const nameInput = useRef<HTMLInputElement>(null)
  const copy = t.goalForm
  const fundCopy = t.funds
  const today = todayISO()
  const money = (amount: number) => formatMoney(amount, currency)
  const isExisting = !!draft.id
  const isFund = draft.kind === 'fund'
  const forBill = !!draft.billId
  // A fund is forecast to the next time it's needed, which may be a year after the date it was set up with.
  const due = forBill ? (billDue ?? '') : isFund && draft.deadline ? occurrenceFrom(draft.deadline, draft.repeat, today) : draft.deadline

  let hint: string | undefined
  let suggestion: number | null = null
  if (draft.target && draft.target > 0) {
    const forecast = goalForecast({ ...draftPreview(draft), deadline: due || undefined }, (draft.saved ?? 0) + tracked, today, salary, isFund ? (slotsNow ?? 1) : 0)
    if (due && forecast.neededPerMonth !== null && forecast.remaining > 0) {
      suggestion = suggestedContribution(forecast.neededPerMonth)
      hint = (isFund ? fundCopy.neededHint : copy.neededHint)(money(suggestion), isFund ? t.format.date(due) : t.format.monthYear(due))
      if (room !== null && suggestion > room) hint += ` ${copy.overRoom}`
    } else if (forecast.monthsToTarget !== null && forecast.projectedDate) {
      hint = copy.paceHint(forecast.monthsToTarget, t.format.monthYear(forecast.projectedDate))
    }
  }
  // Said as it's typed, not only on save: the amount has to fit the salary after bills and the other goals.
  const monthlyError = errors.monthly ?? goalRoomError(draft.monthly ?? 0, room, currency)
  const canUseSuggestion = suggestion !== null && suggestion !== draft.monthly && (room === null || suggestion <= room)
  const nextAfter = isFund && draft.repeat === 'hijri-yearly' && due ? occurrenceFrom(draft.deadline || due, 'hijri-yearly', toISODate(addDays(fromISODate(due), 1))) : null

  return (
    <>
      {showKind && !forBill && (
        <Field label={fundCopy.kindLabel}>
          <SegmentedControl<GoalKind>
            label={fundCopy.kindLabel}
            value={draft.kind}
            onChange={(kind) => onChange({ kind })}
            options={[
              { value: 'goal', label: fundCopy.kinds.goal },
              { value: 'fund', label: fundCopy.kinds.fund },
            ]}
          />
        </Field>
      )}
      {showKind && isFund && !forBill && <p className="-mt-2 text-sm text-muted">{fundCopy.intro}</p>}
      {forBill && billName && <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-ink-2">{fundCopy.forBill(billName)}</p>}

      {showIdeas && isFund && !forBill && (
        <section>
          <h2 className="mb-2 text-sm font-bold">{copy.ideasLabel}</h2>
          <div className="flex flex-wrap gap-2">
            {FUND_IDEAS.map((idea) => {
              const label = fundCopy.ideas[idea.key]
              const selected = draft.icon === idea.icon && (idea.key === 'other' || draft.name === label)
              return (
                <button
                  key={idea.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    if (idea.key === 'other') {
                      onChange({ icon: idea.icon, name: '', repeat: idea.repeat })
                      nameInput.current?.focus()
                    } else onChange({ icon: idea.icon, name: label, repeat: idea.repeat, deadline: idea.next(today) ?? draft.deadline })
                  }}
                  className={chip(selected)}
                >
                  <Icon name={idea.icon} className="size-4" />
                  {label}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {showIdeas && !isFund && (
        <section>
          <h2 className="mb-2 text-sm font-bold">{copy.ideasLabel}</h2>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((idea) => {
              const label = copy.ideas[idea.key]
              const selected = draft.icon === idea.icon && (idea.key === 'other' || draft.name === label)
              return (
                <button
                  key={idea.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    if (idea.key === 'other') {
                      onChange({ icon: idea.icon, name: '' })
                      nameInput.current?.focus()
                    } else onChange({ icon: idea.icon, name: label })
                  }}
                  className={chip(selected)}
                >
                  <Icon name={idea.icon} className="size-4" />
                  {label}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <Field label={isFund ? fundCopy.nameLabel : copy.nameLabel} htmlFor={`${id}-name`} error={errors.name}>
        <input
          ref={nameInput}
          id={`${id}-name`}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={isFund ? fundCopy.namePlaceholder : copy.namePlaceholder}
          aria-invalid={!!errors.name || undefined}
          className={inputClass({ invalid: !!errors.name })}
        />
      </Field>

      {showIconPicker && (
        <Field label={copy.iconLabel}>
          <div role="radiogroup" aria-label={copy.iconLabel} className="grid grid-cols-6 gap-1.5">
            {GOAL_ICONS.map((name) => {
              const selected = draft.icon === name
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t.icons[name] ?? name}
                  onClick={() => onChange({ icon: name })}
                  className={clsx(
                    'grid h-11 place-items-center rounded-xl transition-colors',
                    selected ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2 hover:bg-line',
                  )}
                >
                  <Icon name={name} className="size-5" />
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {!forBill && (
        <Field label={isFund ? fundCopy.targetLabel : copy.targetLabel} htmlFor={`${id}-target`} error={errors.target}>
          <AmountInput id={`${id}-target`} value={draft.target} onChange={(target) => onChange({ target })} invalid={!!errors.target} currency={currency} />
        </Field>
      )}
      <div className={clsx('grid gap-3', !forBill && 'grid-cols-2')}>
        <Field
          label={isExisting ? copy.startingLabel : isFund ? fundCopy.savedLabel : copy.savedLabel}
          aside={isExisting ? undefined : t.common.optional}
          htmlFor={`${id}-saved`}
        >
          <AmountInput id={`${id}-saved`} value={draft.saved} onChange={(saved) => onChange({ saved })} currency={currency} />
        </Field>
        {!forBill && (
          <Field label={isFund ? fundCopy.dateLabel : copy.deadlineLabel} aside={isFund ? undefined : t.common.optional} htmlFor={`${id}-deadline`} error={errors.deadline}>
            <input
              id={`${id}-deadline`}
              type="date"
              // A fund's date can be its last time: it comes round again from there.
              min={isFund ? undefined : today}
              value={draft.deadline}
              onChange={(e) => onChange({ deadline: e.target.value })}
              aria-invalid={!!errors.deadline || undefined}
              className={inputClass({ invalid: !!errors.deadline })}
            />
          </Field>
        )}
      </div>
      {isFund && !forBill && (
        <Field label={fundCopy.repeatLabel} htmlFor={`${id}-repeat`} hint={nextAfter && due ? fundCopy.hijriHint(t.format.date(due), t.format.date(nextAfter)) : undefined}>
          <Select id={`${id}-repeat`} value={draft.repeat} onChange={(e) => onChange({ repeat: e.target.value as FundRepeat })}>
            {REPEATS.map((repeat) => (
              <option key={repeat} value={repeat}>
                {fundCopy.repeats[repeat]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {isExisting && tracked !== 0 && <p className="-mt-2 text-sm text-muted">{copy.startingHint}</p>}
      <Field
        label={copy.monthlyLabel}
        aside={room !== null ? copy.roomAside(money(Math.max(0, room))) : undefined}
        htmlFor={`${id}-monthly`}
        error={monthlyError}
        hint={
          hint && (
            <>
              {hint}
              {canUseSuggestion && (
                <button type="button" onClick={() => onChange({ monthly: suggestion })} className="ms-1.5 font-bold text-accent underline-offset-2 hover:underline">
                  {copy.useSuggestion(money(suggestion!))}
                </button>
              )}
            </>
          )
        }
      >
        <AmountInput id={`${id}-monthly`} value={draft.monthly} onChange={(monthly) => onChange({ monthly })} invalid={!!monthlyError} currency={currency} />
      </Field>
    </>
  )
}
