import { FALLBACK_ICON, ICONS } from './iconMap'

/** A category or goal icon by its saved name, e.g. `shopping-cart`. */
export function Icon({ name, className }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? FALLBACK_ICON
  return <Component aria-hidden className={className} />
}
