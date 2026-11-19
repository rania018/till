import { Building2, Car, Gem, Package, type LucideIcon } from 'lucide-react'
import { roundMoney } from '../../lib/money'
import type { AssetKind } from '../../types'

export const ASSET_KINDS: AssetKind[] = ['gold', 'property', 'vehicle', 'other']

export const ASSET_ICONS: Record<AssetKind, LucideIcon> = { gold: Gem, property: Building2, vehicle: Car, other: Package }

/** Weighed gold: its weight times the price of a gram, or `null` until a price is typed. */
export function weighedValue(grams: number, perGram: number | null): number | null {
  return perGram === null ? null : roundMoney(grams * perGram)
}
