import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { CATEGORY_COLORS, freeColor, hasSubcategories, mainCategories } from '../../lib/categoryTree'
import { live } from '../../lib/id'
import { appStore, useAppStore } from '../../store'
import { BUILT_IN_CATEGORY_IDS } from '../../store/defaults'
import type { Category, CategoryKind } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { Icon } from '../ui/Icon'
import { toast } from '../ui/toastStore'
import { EXPENSE_ICONS, INCOME_ICONS } from './categoryIcons'

/** A category to edit, or `{ kind }` to add one, under `parentId` when given (`''` for a main category). */
export type CategoryTarget = Category | { kind: CategoryKind; parentId?: string }

export function CategorySheet({ target, onClose }: { target: CategoryTarget | null; onClose: () => void }) {
  const editing = target && 'id' in target ? target : undefined
  return (
    <BottomSheet open={target !== null} onOpenChange={(open) => !open && onClose()} title={editing ? t.categoriesPage.editTitle : t.categoriesPage.newTitle}>
      {target && <CategoryForm key={editing?.id ?? `${target.kind}-${'parentId' in target ? target.parentId : ''}`} target={target} onDone={onClose} />}
    </BottomSheet>
  )
}

function CategoryForm({ target, onDone }: { target: CategoryTarget; onDone: () => void }) {
  const id = useId()
  const editing = 'id' in target ? target : undefined
  const kind = target.kind
  const currency = useAppStore((s) => s.profile.currency)
  const [name, setName] = useState(editing?.name ?? '')
  const icons = kind === 'expense' ? EXPENSE_ICONS : INCOME_ICONS
  const [icon, setIcon] = useState(editing?.icon ?? icons[icons.length - 1])
  const [limit, setLimit] = useState<number | null>(editing?.monthlyBudget ?? null)
  const categories = useAppStore((s) => s.categories)
  const [parentId, setParentId] = useState(editing ? (editing.parentId ?? '') : 'parentId' in target ? (target.parentId ?? '') : '')
  const [color, setColor] = useState(editing?.color ?? freeColor(categories))
  // A main category with subcategories can't go under another one.
  const leadsGroup = !!editing && hasSubcategories(categories, editing.id)
  const mains = mainCategories(categories).filter((c) => c.id !== editing?.id)
  const [error, setError] = useState<string | null>(null)
  const copy = t.categoriesPage
  const builtIn = !!editing && BUILT_IN_CATEGORY_IDS.has(editing.id)
  // An icon the category already has stays pickable even if it isn't in the usual list.
  const choices = editing && !icons.includes(editing.icon) ? [editing.icon, ...icons] : icons

  function save() {
    if (!name.trim()) return setError(copy.nameError)
    const store = appStore.getState()
    const fields = {
      name: name.trim(),
      icon,
      ...(kind === 'expense' && { monthlyBudget: limit && limit > 0 ? limit : undefined, parentId: parentId || undefined, color: parentId ? undefined : color }),
    }
    try {
      if (editing) {
        store.updateCategory(editing.id, fields)
        toast(copy.saved, { tone: 'good' })
      } else {
        const order = Math.max(0, ...live(store.categories).map((c) => c.order)) + 1
        store.addCategory({ ...fields, kind, optional: false, enabled: true, system: false, archived: false, order })
        toast(copy.added(fields.name), { tone: 'good' })
      }
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function remove() {
    if (!editing) return
    if (hasSubcategories(categories, editing.id)) return setError(t.errors.categoryHasSubs)
    const categoryId = editing.id
    appStore.getState().updateCategory(categoryId, { archived: true })
    onDone()
    toast(copy.deleted(editing.name), { action: { label: t.common.undo, onClick: () => appStore.getState().updateCategory(categoryId, { archived: false }) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={copy.name} htmlFor={`${id}-name`} error={error}>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder={copy.namePlaceholder}
          aria-invalid={!!error || undefined}
          className={inputClass({ invalid: !!error })}
        />
      </Field>
      <Field label={copy.icon}>
        <div role="radiogroup" aria-label={copy.icon} className="grid grid-cols-6 gap-1.5">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={icon === choice}
              aria-label={t.icons[choice] ?? choice}
              onClick={() => setIcon(choice)}
              className={clsx('grid h-11 place-items-center rounded-xl transition-colors', icon === choice ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2 hover:bg-line')}
            >
              <Icon name={choice} className="size-5" />
            </button>
          ))}
        </div>
      </Field>
      {kind === 'expense' && (
        <Field label={copy.main} htmlFor={`${id}-main`}>
          <select id={`${id}-main`} value={parentId} disabled={leadsGroup} onChange={(e) => setParentId(e.target.value)} className={inputClass()}>
            <option value="">{copy.mainNone}</option>
            {mains.map((main) => (
              <option key={main.id} value={main.id}>
                {main.name}
              </option>
            ))}
          </select>
          {leadsGroup && <p className="mt-1 text-xs text-muted">{copy.mainNote}</p>}
        </Field>
      )}
      {kind === 'expense' && !parentId && (
        <Field label={copy.color}>
          <div role="radiogroup" aria-label={copy.color} className="flex flex-wrap gap-2">
            {Array.from({ length: CATEGORY_COLORS }, (_, i) => i + 1).map((slot) => (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={color === slot}
                aria-label={copy.colors[slot - 1]}
                title={copy.colors[slot - 1]}
                onClick={() => setColor(slot)}
                className={clsx('size-9 rounded-full ring-offset-2 ring-offset-surface transition', color === slot ? 'ring-2 ring-ink' : 'hover:scale-105')}
                style={{ background: `var(--cat-${slot})` }}
              />
            ))}
          </div>
        </Field>
      )}
      {kind === 'expense' && (
        <Field label={copy.limitLabel} aside={t.common.optional} htmlFor={`${id}-limit`}>
          <AmountInput id={`${id}-limit`} value={limit} onChange={setLimit} currency={currency} placeholder={copy.noLimit} />
        </Field>
      )}
      {builtIn && <p className="text-sm text-muted">{copy.builtInNote}</p>}
      <Button type="submit" block size="lg">
        {copy.save}
      </Button>
      {editing && !builtIn && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" icon={Trash2} onClick={remove} className="text-crit-ink">
            {copy.delete}
          </Button>
        </div>
      )}
    </form>
  )
}
