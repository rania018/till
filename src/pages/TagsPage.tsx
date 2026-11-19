import { Pencil, Tag, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ActivityTabs } from '../components/calendar/ActivityTabs'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { inputClass } from '../components/ui/formStyles'
import { PageHeader } from '../components/ui/PageHeader'
import { toast } from '../components/ui/toastStore'
import { ChevronRight } from '../components/ui/directionalIcons'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { formatMoney } from '../lib/money'
import { MAX_TAG_LENGTH, tagSummaries, type TagSummary } from '../lib/tags'
import { appStore, useAppStore } from '../store'

/** Every tag with what it adds up to over all pay cycles. A tag opens Activity filtered to it. */
export function TagsPage() {
  const { transactions, currency } = useAppStore(useShallow((s) => ({ transactions: s.transactions, currency: s.profile.currency })))
  const desktop = useIsDesktop()
  const summaries = useMemo(() => tagSummaries(transactions, currency), [transactions, currency])
  const [editing, setEditing] = useState<TagSummary | null>(null)
  const copy = t.tags

  return (
    <>
      {/* On a computer this is one of Activity's tabs, with the same top bar as the others. */}
      {desktop ? <PageHeader title={t.activity.title} nav={<ActivityTabs />} centerNav /> : <PageHeader title={copy.title} subtitle={copy.subtitle} />}
      <div className="space-y-4">
        {!desktop && (
          <div className="lg:max-w-xs">
            <ActivityTabs />
          </div>
        )}
        {summaries.length === 0 ? (
          <EmptyState icon={Tag} title={copy.emptyTitle} body={copy.emptyBody} />
        ) : (
          <ul className="max-w-2xl divide-y divide-line rounded-2xl border border-line bg-surface px-2">
            {summaries.map((summary) => (
              <li key={summary.name} className="flex items-center gap-1">
                <Link to={`/activity/list?tag=${encodeURIComponent(summary.name)}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Tag className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{summary.name}</span>
                    <span className="block text-sm text-muted">{copy.entriesOver(summary.count, summary.first === summary.last ? t.format.date(summary.first) : t.format.range(summary.first, summary.last))}</span>
                  </span>
                  <span className="shrink-0 text-end font-extrabold tabular-nums">{formatMoney(summary.spent, currency)}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                </Link>
                <IconButton icon={Pencil} variant="ghost" label={copy.edit(summary.name)} onClick={() => setEditing(summary)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomSheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={copy.editTitle}>
        {editing && <TagForm key={editing.name} summary={editing} onDone={() => setEditing(null)} />}
      </BottomSheet>
    </>
  )
}

function TagForm({ summary, onDone }: { summary: TagSummary; onDone: () => void }) {
  const id = useId()
  const copy = t.tags
  const [name, setName] = useState(summary.name)
  const [error, setError] = useState<string | null>(null)

  function rename() {
    try {
      const undo = appStore.getState().renameTag(summary.name, name)
      onDone()
      toast(copy.renamed(name.trim()), { tone: 'good', action: { label: t.common.undo, onClick: undo } })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function remove() {
    const undo = appStore.getState().deleteTag(summary.name)
    onDone()
    toast(copy.removed(summary.name, summary.count), { action: { label: t.common.undo, onClick: undo } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        rename()
      }}
    >
      <Field label={copy.name} htmlFor={`${id}-name`} hint={copy.renameHint(summary.count)} error={error}>
        <input id={`${id}-name`} value={name} maxLength={MAX_TAG_LENGTH} onChange={(e) => setName(e.target.value)} className={inputClass()} />
      </Field>
      <Button type="submit" block size="lg">
        {copy.save}
      </Button>
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" icon={Trash2} onClick={remove}>
          {copy.deleteTag}
        </Button>
      </div>
    </form>
  )
}
