import { CalendarDays, ChartColumn, Hourglass, House, LayoutGrid, List, Settings, Wallet, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Only active on this exact path (needed for Home, which every path starts with). */
  end?: boolean
  /** Pages that count as this section in the sidebar, though their paths don't start with it. */
  alsoFor?: string[]
  /** Pages under this path that belong to another section. */
  notFor?: string[]
  /** In the sidebar, a count of what needs you there. */
  attention?: 'home' | 'plan'
}

/** The bottom bar on phones (with the + button in the middle) and the top of the sidebar. */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: t.nav.home, icon: House, end: true, attention: 'home' },
  { to: '/activity', label: t.nav.activity, icon: List },
  { to: '/plan', label: t.nav.plan, icon: LayoutGrid, attention: 'plan' },
  { to: '/stats', label: t.nav.stats, icon: ChartColumn, alsoFor: ['/review', '/report', '/wallets/net-worth'] },
]

/** Its own section in the sidebar. On phones the bottom bar is full: it's a button on Home and a tab in Activity. */
export const CALENDAR_NAV: NavItem = { to: '/calendar', label: t.nav.calendar, icon: CalendarDays }

/** Your money, so with the main sections in the sidebar. On phones it's the Wallets card on Home. */
export const WALLETS_NAV: NavItem = { to: '/wallets', label: t.nav.wallets, icon: Wallet, notFor: ['/wallets/net-worth'] }

/** The top of the sidebar: the bottom bar's sections, with Calendar after Activity and Wallets after Plan. */
export const SIDEBAR_NAV: NavItem[] = [PRIMARY_NAV[0], PRIMARY_NAV[1], CALENDAR_NAV, PRIMARY_NAV[2], WALLETS_NAV, PRIMARY_NAV[3]]

/** Sidebar only, at the bottom: tools and settings. On phones these are reached from the + sheet and the gear icon. */
export const SECONDARY_NAV: NavItem[] = [
  { to: '/worth-it', label: t.nav.worthIt, icon: Hourglass },
  { to: '/settings', label: t.nav.settings, icon: Settings },
]
