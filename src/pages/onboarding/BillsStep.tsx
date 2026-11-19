import { Plus } from 'lucide-react'
import { ChevronRight } from '../../components/ui/directionalIcons'
import { useState } from 'react'
import { billToDraft, newBillDraft, type BillDraft } from '../../components/billDraft'
import { BillSheet } from '../../components/BillSheet'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { t } from '../../i18n'
import { totalMonthlyBills } from '../../lib/bills'
import { todayISO } from '../../lib/dates'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { useAppStore } from '../../store'
import type { Bill, BillFrequency } from '../../types'
import { StepFrame, type StepProps } from './StepFrame'

type SuggestionKey = keyof typeof t.onboarding.bills.suggestions

const SUGGESTIONS: { key: SuggestionKey; categoryId: string; frequency: BillFrequency }[] = [
  { key: 'rent', categoryId: 'cat-housing', frequency: 'monthly' },
  { key: 'internet', categoryId: 'cat-bills', frequency: 'monthly' },
  { key: 'phone', categoryId: 'cat-bills', frequency: 'monthly' },
  { key: 'power', categoryId: 'cat-bills', frequency: 'quarterly' },
  { key: 'water', categoryId: 'cat-bills', frequency: 'quarterly' },
  { key: 'transport', categoryId: 'cat-transport', frequency: 'monthly' },
  { key: 'gym', categoryId: 'cat-health', frequency: 'monthly' },
  { key: 'streaming', categoryId: 'cat-subscriptions', frequency: 'monthly' },
]

function dueText(bill: Bill, today: string): string {
  if (bill.frequency === 'monthly') return t.billSheet.dueOnDay(bill.dueDay)
  if (bill.frequency === 'weekly') return t.billSheet.dueOnWeekday(bill.dueDay)
  return t.billSheet.dueFrom(billToDraft(bill, today).nextDue)
}

export function BillsStep({ step, next }: StepProps) {
  const bills = live(useAppStore((s) => s.bills))
  const categories = useAppStore((s) => s.categories)
  const currency = useAppStore((s) => s.profile.currency)
  const [draft, setDraft] = useState<BillDraft | null>(null)
  const today = todayISO()
  const copy = t.onboarding.bills

  const names = new Set(bills.map((b) => b.name.toLowerCase()))
  const suggestions = SUGGESTIONS.filter((s) => !names.has(copy.suggestions[s.key].toLowerCase()))
  const iconFor = (categoryId: string) => categories.find((c) => c.id === categoryId)?.icon ?? 'package'

  return (
    <StepFrame step={step} title={copy.title} intro={copy.intro} onContinue={next}>
      {bills.length > 0 ? (
        <ul className="space-y-2">
          {bills.map((bill) => (
            <li key={bill.id}>
              <button
                type="button"
                onClick={() => setDraft(billToDraft(bill, today))}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-start transition-colors hover:bg-surface-2"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={iconFor(bill.categoryId)} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{bill.name}</span>
                  <span className="block text-sm text-muted">
                    {t.billSheet.summary(formatMoney(bill.amount, currency), t.format.frequency[bill.frequency], dueText(bill, today))}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </button>
            </li>
          ))}
          <li className="px-1 pt-1 text-sm font-semibold text-muted">{copy.monthlyTotal(formatMoney(totalMonthlyBills(bills), currency))}</li>
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.9375rem] text-ink-2">{copy.none}</p>
      )}

      {suggestions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold">{copy.suggestionsLabel}</h2>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setDraft(newBillDraft({ name: copy.suggestions[s.key], categoryId: s.categoryId, frequency: s.frequency }, today))}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold transition-colors hover:bg-surface-2"
              >
                <Plus aria-hidden className="size-4 text-accent" />
                {copy.suggestions[s.key]}
              </button>
            ))}
          </div>
        </section>
      )}

      <Button variant="secondary" icon={Plus} block onClick={() => setDraft(newBillDraft({}, today))}>
        {copy.addOther}
      </Button>

      <BillSheet draft={draft} onClose={() => setDraft(null)} />
    </StepFrame>
  )
}
