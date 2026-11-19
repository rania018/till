import clsx from 'clsx'
import { ChevronDown, ChevronUp, Ellipsis } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { CATEGORY_SHORTCUTS, categoryColor, mainIdOf } from '../../lib/categoryTree'
import { useAppStore } from '../../store'
import type { Category, ID } from '../../types'
import { buttonClass } from '../ui/buttonStyles'
import { ArrowLeft, ChevronRight } from '../ui/directionalIcons'
import { Icon } from '../ui/Icon'

const FIRST_ROWS = 7
const TILE = 'flex flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-center'
const GRID = 'grid grid-cols-4 gap-x-1 gap-y-2'
const LABEL = 'line-clamp-2 text-[0.6875rem] leading-tight desk:text-xs'

/** What the picker shows: the first main categories, the rest of them, or what's under one. */
type View = { kind: 'first' } | { kind: 'more' } | { kind: 'main'; id: ID }
const FIRST: View = { kind: 'first' }
const MORE: View = { kind: 'more' }

/**
 * Tap a category, one level at a time so it stays small: the first main categories and More, then
 * in their place what's under the one tapped, with a way back. `mains` is the main categories in
 * the order to offer them. Without it, or with no subcategories, it's one grid, most used first.
 * Each icon wears its main category's colour.
 */
export function CategoryGrid({ categories, mains, value, onChange }: { categories: Category[]; mains?: ID[]; value?: ID; onChange: (id: ID) => void }) {
  const all = useAppStore((s) => s.categories)
  const [expanded, setExpanded] = useState(false)
  // What was navigated to. Until then, it shows wherever the chosen category is.
  const [view, setView] = useState<View | null>(null)
  const area = useRef<HTMLDivElement>(null)
  // The tapped tile goes away with the view it was in, so keyboard and screen reader users are put in the new one.
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    area.current?.querySelector<HTMLElement>(`[data-focus="${focusNext.current}"]`)?.focus({ preventScroll: true })
    focusNext.current = null
  }, [view])
  const go = (next: View, focus: string) => {
    focusNext.current = focus
    setView(next)
  }

  const selectedIndex = categories.findIndex((c) => c.id === value)
  // Keep a chosen category visible even if it's past the first row.
  const showAll = expanded || selectedIndex >= FIRST_ROWS
  const hasMore = categories.length > FIRST_ROWS + 1

  const tile = (category: Category) => {
    const selected = category.id === value
    const color = categoryColor(all, category.id)
    return (
      <button key={category.id} type="button" data-focus={category.id} aria-pressed={selected} onClick={() => onChange(category.id)} className={TILE}>
        <span
          className={clsx('grid size-11 place-items-center rounded-2xl text-ink transition', selected && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')}
          style={{ background: category.kind === 'expense' ? `color-mix(in oklab, ${color} ${selected ? 90 : 45}%, transparent)` : selected ? 'var(--color-accent)' : 'var(--color-surface-2)' }}
        >
          <Icon name={category.icon} className={clsx('size-5', category.kind !== 'expense' && selected && 'text-on-accent')} />
        </span>
        <span className={clsx(LABEL, selected ? 'font-extrabold text-ink' : 'font-semibold text-ink-2')}>{category.name}</span>
      </button>
    )
  }

  if (mains && categories.some((c) => c.parentId)) {
    const groups = new Map<ID, Category[]>()
    for (const c of categories) {
      const main = mainIdOf(all, c.id)
      groups.set(main, [...(groups.get(main) ?? []), c])
    }
    const offered = mains.filter((id) => groups.has(id))
    const isGroup = (id: ID) => groups.get(id)!.some((c) => c.id !== id)
    // With just one left over, its own tile takes the place of More.
    const first = offered.length > CATEGORY_SHORTCUTS + 1 ? offered.slice(0, CATEGORY_SHORTCUTS) : offered
    const rest = offered.filter((id) => !first.includes(id))
    const parentOf = (id: ID): View => (first.includes(id) ? FIRST : MORE)
    const chosenMain = selectedIndex >= 0 ? mainIdOf(all, value!) : null
    const shown: View = view && (view.kind !== 'main' || (groups.has(view.id) && isGroup(view.id))) ? view : !chosenMain || !groups.has(chosenMain) ? FIRST : isGroup(chosenMain) ? { kind: 'main', id: chosenMain } : parentOf(chosenMain)
    const holdsChoice = (id: ID) => groups.get(id)!.some((c) => c.id === value)

    const mainTile = (id: ID) => {
      if (!isGroup(id)) return tile(groups.get(id)![0])
      const main = all.find((c) => c.id === id)!
      const active = holdsChoice(id)
      return (
        <button key={id} type="button" data-focus={id} onClick={() => go({ kind: 'main', id }, 'back')} className={TILE}>
          <span className="relative grid size-11 place-items-center rounded-2xl text-ink transition" style={{ background: `color-mix(in oklab, ${categoryColor(all, id)} ${active ? 90 : 45}%, transparent)` }}>
            <Icon name={main.icon} className="size-5" />
            <span aria-hidden className="absolute -bottom-1 -end-1 grid size-4 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-line">
              <ChevronRight className="size-3" />
            </span>
          </span>
          <span className={clsx(LABEL, active ? 'font-extrabold text-ink' : 'font-semibold text-ink-2')}>{main.name}</span>
        </button>
      )
    }

    if (shown.kind === 'first') {
      const moreActive = rest.some(holdsChoice)
      return (
        <div ref={area} role="group" aria-label={t.transactions.category} className={clsx('grid gap-x-1 gap-y-2', rest.length > 0 || first.length > 4 ? 'grid-cols-5' : 'grid-cols-4')}>
          {first.map(mainTile)}
          {rest.length > 0 && (
            <button type="button" data-focus="more" onClick={() => go(MORE, 'back')} className={TILE}>
              <span className={clsx('grid size-11 place-items-center rounded-2xl text-ink-2 transition', moreActive ? 'bg-accent text-on-accent' : 'bg-surface-2')}>
                <Ellipsis aria-hidden className="size-5" />
              </span>
              <span className={clsx(LABEL, moreActive ? 'font-extrabold text-ink' : 'font-semibold text-ink-2')}>{t.transactions.moreCategories}</span>
            </button>
          )}
        </div>
      )
    }

    const title = shown.kind === 'more' ? t.transactions.moreCategoriesTitle : all.find((c) => c.id === shown.id)!.name
    const back = () => (shown.kind === 'more' ? go(FIRST, 'more') : go(parentOf(shown.id), shown.id))
    return (
      <div ref={area} role="group" aria-label={t.transactions.category}>
        <div className="mb-2 flex items-center gap-3">
          <button type="button" data-focus="back" onClick={back} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <ArrowLeft aria-hidden className="size-4" />
            {t.common.back}
          </button>
          <h3 className="min-w-0 truncate text-sm font-extrabold">{title}</h3>
        </div>
        <div className={GRID}>{shown.kind === 'more' ? rest.map(mainTile) : [...groups.get(shown.id)!].sort((a, b) => a.order - b.order).map(tile)}</div>
      </div>
    )
  }

  const toggle = hasMore && (
    <button type="button" onClick={() => setExpanded(!showAll)} className={TILE}>
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-ink-2">{showAll ? <ChevronUp aria-hidden className="size-5" /> : <ChevronDown aria-hidden className="size-5" />}</span>
      <span className={clsx(LABEL, 'font-semibold text-ink-2')}>{showAll ? t.transactions.fewerCategories : t.transactions.moreCategories}</span>
    </button>
  )
  const shownTiles = showAll || categories.length <= FIRST_ROWS + 1 ? categories : categories.slice(0, FIRST_ROWS)
  return (
    <div role="group" aria-label={t.transactions.category} className={GRID}>
      {shownTiles.map(tile)}
      {toggle}
    </div>
  )
}
