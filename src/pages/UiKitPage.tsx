import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AmountInput } from '../components/ui/AmountInput'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button, IconButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressBar } from '../components/ui/ProgressBar'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { StatTile } from '../components/ui/StatTile'
import { StatusChip } from '../components/ui/StatusChip'
import { Stepper } from '../components/ui/Stepper'
import { toast } from '../components/ui/toastStore'
import { Toggle } from '../components/ui/Toggle'
import { formatMoney } from '../lib/money'
import { useAppStore } from '../store'

// Development-only page for checking every building block in both themes.
// Its text isn't translated because users never see it.

const TOKENS = [
  'bg', 'surface', 'surface-2', 'ink', 'ink-2', 'muted', 'line',
  'accent', 'accent-soft', 'on-accent',
  'good', 'good-ink', 'good-soft', 'warn', 'warn-ink', 'warn-soft', 'crit', 'crit-ink', 'crit-soft',
  'series-1', 'series-2', 'series-3', 'series-4', 'series-other',
]

function Demo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  )
}

export default function UiKitPage() {
  const [period, setPeriod] = useState<'cycle' | 'three' | 'year'>('cycle')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const categories = useAppStore((s) => s.categories)
  const [amount, setAmount] = useState<number | null>(60_000)
  const [limit, setLimit] = useState<number | null>(null)
  const [hours, setHours] = useState(8)
  const [petsOn, setPetsOn] = useState(false)

  return (
    <div className="space-y-8">
      <PageHeader title="Design system" subtitle="Development only" backTo="/settings" showSettings={false} />

      <Demo title="Colors (switch the theme in Settings)">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {TOKENS.map((token) => (
            <div key={token} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="h-10" style={{ background: `var(--${token})` }} />
              <p className="px-2 py-1 font-mono text-[0.6875rem] text-ink-2">{token}</p>
            </div>
          ))}
        </div>
      </Demo>

      <Demo title="Type">
        <Card className="space-y-1">
          <p className="text-3xl font-extrabold tracking-tight">{formatMoney(9_700)}</p>
          <p className="text-lg font-extrabold">Left to spend until payday</p>
          <p className="text-[0.9375rem] text-ink-2">Body text in Manrope, the app font.</p>
          <p className="text-sm text-muted">Muted text for hints and dates.</p>
          <p className="tabular-nums text-sm">Aligned columns use tabular figures: 1,450 · 12,000 · 38,300</p>
        </Card>
      </Demo>

      <Demo title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Plus}>Save expense</Button>
          <Button variant="secondary">Add to wishlist</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger" icon={Trash2}>
            Delete
          </Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
          <IconButton icon={Pencil} label="Edit" />
          <IconButton icon={Trash2} label="Delete" variant="ghost" />
        </div>
      </Demo>

      <Demo title="Status (icon and text, never color alone)">
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="good">On track</StatusChip>
          <StatusChip tone="warn">Near limit</StatusChip>
          <StatusChip tone="crit">Over by 400</StatusChip>
          <StatusChip tone="info">Due Tuesday</StatusChip>
        </div>
      </Demo>

      <Demo title="Progress, with the even-pace mark at day 22 of 31">
        <Card className="space-y-4">
          {[
            { name: 'Groceries', value: 0.75, tone: 'accent' as const },
            { name: 'Eating out', value: 0.92, tone: 'warn' as const },
            { name: 'Shopping', value: 1.08, tone: 'crit' as const },
          ].map((bar) => (
            <div key={bar.name}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-bold">{bar.name}</span>
                <span className="text-muted">{Math.round(bar.value * 100)}%</span>
              </div>
              <ProgressBar value={bar.value} tone={bar.tone} marker={22 / 31} label={`${bar.name} budget used`} />
            </div>
          ))}
        </Card>
      </Demo>

      <Demo title="Stat tiles">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Spent" value="38,300" />
          <StatTile label="Income" value="60,000" />
          <StatTile label="Saved" value="8,000" hint="this cycle" />
        </div>
      </Demo>

      <Demo title="Segmented control (arrow keys move the choice)">
        <SegmentedControl
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'cycle', label: 'This cycle' },
            { value: 'three', label: '3 cycles' },
            { value: 'year', label: 'Year' },
          ]}
        />
      </Demo>

      <Demo title="Form fields">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Take-home pay" htmlFor="ui-amount" hint="Big amount field, numeric keypad on phones.">
            <AmountInput id="ui-amount" size="lg" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Amount with an error" htmlFor="ui-amount-error" error="Enter an amount above 0.">
            <AmountInput id="ui-amount-error" value={null} onChange={() => undefined} invalid />
          </Field>
          <Field label="Payday" htmlFor="ui-select">
            <Select id="ui-select" defaultValue="25">
              <option value="1">1st of the month</option>
              <option value="25">25th of the month</option>
            </Select>
          </Field>
          <Field label="Hours a day">
            <Stepper value={hours} onChange={setHours} min={1} max={16} label="Hours a day" decreaseLabel="Fewer hours" increaseLabel="More hours" />
          </Field>
          <div className="flex items-center gap-3">
            <span className="flex-1 font-bold">Pets</span>
            {petsOn && <AmountInput size="sm" className="w-32" value={limit} onChange={setLimit} placeholder="No limit" aria-label="Limit for Pets" />}
            <Toggle checked={petsOn} onChange={setPetsOn} label="Use Pets" />
          </div>
        </Card>
      </Demo>

      <Demo title="Category icons (from the saved categories)">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon name={c.icon} className="size-4" />
              </span>
              <span className="text-xs font-semibold leading-tight">
                {c.name}
                {!c.enabled && <span className="block font-normal text-muted">off</span>}
              </span>
            </div>
          ))}
        </div>
      </Demo>

      <Demo title="Sheets, dialogs and toasts">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Open confirm dialog
          </Button>
          <Button variant="secondary" onClick={() => toast('Settings saved', { tone: 'good' })}>
            Show toast
          </Button>
          <Button variant="secondary" onClick={() => toast('Expense deleted', { action: { label: 'Undo', onClick: () => toast('Restored', { tone: 'good' }) } })}>
            Toast with Undo
          </Button>
        </div>
        <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title="New expense" description="Bottom sheet on phones, centered panel on wider screens." footer={<Button block onClick={() => setSheetOpen(false)}>Save expense</Button>}>
          <p className="text-[0.9375rem] text-ink-2">Content scrolls here while the footer stays put.</p>
        </BottomSheet>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete this expense?"
          body="Coffee, 250 DA, today. You can undo right after."
          confirmLabel="Delete expense"
          onConfirm={() => toast('Expense deleted')}
        />
      </Demo>

      <Demo title="Empty state">
        <EmptyState icon={Wallet} title="No expenses yet" body="Tap + to add your first one. It takes a few seconds." />
      </Demo>
    </div>
  )
}
