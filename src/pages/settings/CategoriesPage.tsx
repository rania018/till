import { Plus } from 'lucide-react'
import { ChevronRight } from '../../components/ui/directionalIcons'
import { useState } from 'react'
import { ExportButton } from '../../components/ExportButton'
import { Chip } from '../../components/ui/Chip'
import { toast } from '../../components/ui/toastStore'
import { CategorySheet, type CategoryTarget } from '../../components/settings/CategorySheet'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { PageHeader } from '../../components/ui/PageHeader'
import { Toggle } from '../../components/ui/Toggle'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { categoriesWorkbook } from '../../lib/export/pages'
import { live } from '../../lib/id'
import { CATEGORY_SHORTCUTS, categoryColor, mainCategories, subcategoriesOf } from '../../lib/categoryTree'
import { formatMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import { CATEGORY_IDS } from '../../store/defaults'
import type { Category, CategoryKind } from '../../types'

/** Settings › Categories: rename, change icons, switch on or off, add your own. */
export function CategoriesPage() {
  const categories = useAppStore((s) => s.categories)
  const currency = useAppStore((s) => s.profile.currency)
  const shortcuts = useAppStore((s) => s.settings.categoryShortcuts)
  const [target, setTarget] = useState<CategoryTarget | null>(null)
  const copy = t.categoriesPage
  const list = (kind: CategoryKind) =>
    live(categories)
      .filter((c) => c.kind === kind && !c.system && !c.archived)
      .sort((a, b) => a.order - b.order)

  const offerable = mainCategories(categories).filter((c) => !c.system && c.enabled)
  // Ones switched off or deleted since don't count, and can't be seen to be taken off.
  const picked = (shortcuts ?? []).filter((id) => offerable.some((c) => c.id === id))
  const togglePicked = (id: string) => {
    if (!picked.includes(id) && picked.length >= CATEGORY_SHORTCUTS) return toast(copy.shortcutsFull)
    appStore.getState().updateSettings({ categoryShortcuts: picked.includes(id) ? picked.filter((other) => other !== id) : [...picked, id] })
  }

  const row = (category: Category) => (
    <li key={category.id} className={category.parentId ? 'flex items-center gap-1 pe-1 ps-7' : 'flex items-center gap-1 pe-1'}>
      <button
        type="button"
        onClick={() => setTarget(category)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-surface-2"
      >
        <span
          className={category.enabled ? 'grid size-9 shrink-0 place-items-center rounded-xl text-ink' : 'grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted'}
          style={category.enabled && category.kind === 'expense' ? { background: `color-mix(in oklab, ${categoryColor(categories, category.id)} ${category.parentId ? 35 : 70}%, transparent)` } : category.enabled ? { background: 'var(--color-accent-soft)' } : undefined}
        >
          <Icon name={category.icon} className="size-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={category.enabled ? 'block truncate font-bold' : 'block truncate font-bold text-muted'}>{category.name}</span>
          {category.kind === 'expense' && (
            <span className="block text-xs text-muted">
              {[!category.enabled ? copy.off : category.monthlyBudget ? copy.limit(formatMoney(category.monthlyBudget, currency)) : copy.noLimitShort, !category.parentId && subcategoriesOf(categories, category.id).some((c) => !c.system) && copy.subs(subcategoriesOf(categories, category.id).filter((c) => !c.system).length)].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="sr-only">, {copy.edit}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
      </button>
      <Toggle label={copy.useLabel(category.name)} checked={category.enabled} onChange={(enabled) => appStore.getState().updateCategory(category.id, { enabled })} />
    </li>
  )

  // Spending: each main category with its subcategories under it. Income has no groups.
  const grouped = (kind: CategoryKind) =>
    kind === 'income'
      ? list(kind).map(row)
      : mainCategories(categories)
          .filter((c) => !c.system)
          .flatMap((main) => [row(main), ...subcategoriesOf(categories, main.id).filter((c) => !c.system).map(row)])
  const section = (kind: CategoryKind, title: string, addLabel: string) => (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold">{title}</h2>
        <div className="flex flex-wrap gap-2">
          {kind === 'expense' && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setTarget({ kind, parentId: '' })}>
              {copy.addMain}
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setTarget(kind === 'expense' ? { kind, parentId: CATEGORY_IDS.other } : { kind })}>
            {addLabel}
          </Button>
        </div>
      </div>
      {kind === 'expense' && <p className="mb-2 text-xs text-muted">{copy.groupNote}</p>}
      <ul className="rounded-2xl border border-line bg-surface p-1">{grouped(kind)}</ul>
    </section>
  )

  return (
    <div className="max-w-xl lg:max-w-none">
      <PageHeader title={copy.title} backTo="/settings/money" showSettings={false} actions={<ExportButton workbook={() => categoriesWorkbook(appStore.getState(), todayISO())} />} />
      <p className="-mt-2 mb-5 text-sm text-muted">{copy.offNote}</p>
      <section className="mb-6">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-extrabold">{copy.shortcutsTitle}</h2>
          <span className="shrink-0 text-xs font-bold text-muted">{copy.shortcutsCount(picked.length)}</span>
        </div>
        <p className="mb-2 text-xs text-muted">{copy.shortcutsNote}</p>
        <div className="flex flex-wrap gap-2">
          {offerable.map((c) => (
            <Chip key={c.id} selected={picked.includes(c.id)} onClick={() => togglePicked(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </section>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {section('expense', copy.expenses, copy.add)}
        {section('income', copy.income, copy.addIncome)}
      </div>
      <CategorySheet target={target} onClose={() => setTarget(null)} />
    </div>
  )
}
