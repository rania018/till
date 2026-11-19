import type { Category, CategoryKind, ID } from '../types'
import { live } from './id'

/** How many colours main categories can have: the pastel palette's slots. */
export const CATEGORY_COLORS = 8
/** How many main categories are offered first when adding an expense. */
export const CATEGORY_SHORTCUTS = 4

type Tree = Pick<Category, 'id' | 'parentId'>

/** The main category a category belongs to: its parent, or itself when it has none. */
export function mainIdOf(categories: Tree[], id: ID): ID {
  const category = categories.find((c) => c.id === id)
  return category?.parentId && categories.some((c) => c.id === category.parentId) ? category.parentId : id
}

/** A main category and every subcategory under it. A subcategory is just itself. */
export function familyIds(categories: Tree[], id: ID): Set<ID> {
  return new Set([id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)])
}

/** Main categories of a kind, in their order, living and not archived. */
export function mainCategories(categories: Category[], kind: CategoryKind = 'expense'): Category[] {
  return live(categories)
    .filter((c) => c.kind === kind && !c.archived && !c.parentId)
    .sort((a, b) => a.order - b.order)
}

/** The subcategories under a main one, in their order. */
export function subcategoriesOf(categories: Category[], mainId: ID): Category[] {
  return live(categories)
    .filter((c) => c.parentId === mainId && !c.archived)
    .sort((a, b) => a.order - b.order)
}

/** Whether a main category has any subcategories (archived ones aside). */
export function hasSubcategories(categories: Category[], id: ID): boolean {
  return live(categories).some((c) => c.parentId === id && !c.archived)
}

/** A category's colour slot (1 to `CATEGORY_COLORS`): its main category's, or none. */
export function categorySlot(categories: Pick<Category, 'id' | 'parentId' | 'color'>[], id: ID | undefined): number | undefined {
  if (!id) return undefined
  const slot = categories.find((c) => c.id === mainIdOf(categories, id))?.color
  return slot && slot >= 1 && slot <= CATEGORY_COLORS ? slot : undefined
}

/** The CSS colour of a category: its main category's pastel, or the neutral one. The raw variables, which are always there: Tailwind only keeps the theme colours some class uses. */
export function categoryColor(categories: Pick<Category, 'id' | 'parentId' | 'color'>[], id: ID | undefined): string {
  const slot = categorySlot(categories, id)
  return slot ? `var(--cat-${slot})` : 'var(--cat-other)'
}

/** Amounts per category added up per main category. */
export function rollUp(amounts: Map<ID, number>, categories: Tree[]): Map<ID, number> {
  const out = new Map<ID, number>()
  for (const [id, amount] of amounts) {
    const main = mainIdOf(categories, id)
    out.set(main, (out.get(main) ?? 0) + amount)
  }
  return out
}

/** The first colour slot no main category uses yet, for a new one; the least used once all are taken. */
export function freeColor(categories: Category[]): number {
  const used = new Map<number, number>()
  for (const c of mainCategories(categories)) if (c.color) used.set(c.color, (used.get(c.color) ?? 0) + 1)
  let best = 1
  for (let slot = 1; slot <= CATEGORY_COLORS; slot++) {
    if (!used.has(slot)) return slot
    if ((used.get(slot) ?? 0) < (used.get(best) ?? 0)) best = slot
  }
  return best
}
