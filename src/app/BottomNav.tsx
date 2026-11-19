import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { NavLink } from 'react-router'
import { t } from '../i18n'
import { PRIMARY_NAV, type NavItem } from './nav'

function Tab({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        clsx('flex flex-col items-center justify-center gap-0.5 text-[0.6875rem]', isActive ? 'font-extrabold text-accent' : 'font-semibold text-muted hover:text-ink')
      }
    >
      <Icon aria-hidden className="size-[1.375rem]" />
      {item.label}
    </NavLink>
  )
}

/** Phones only: Home · Activity · (+) · Plan · Stats. */
export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const [home, activity, plan, stats] = PRIMARY_NAV
  return (
    <nav aria-label={t.nav.label} className="fixed inset-x-0 bottom-0 z-30 print:hidden border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5">
        <Tab item={home} />
        <Tab item={activity} />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label={t.nav.add}
            className="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-lg shadow-accent/30 ring-4 ring-bg transition-transform active:scale-95"
          >
            <Plus aria-hidden className="size-7" />
          </button>
        </div>
        <Tab item={plan} />
        <Tab item={stats} />
      </div>
    </nav>
  )
}
