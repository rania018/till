import clsx from 'clsx'
import { Plus, Settings } from 'lucide-react'
import { ArrowLeft } from './directionalIcons'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { openTransactionSheet } from '../transactions/sheetStore'
import { iconButtonClass } from './buttonStyles'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Shows a back arrow to this path. */
  backTo?: string
  actions?: ReactNode
  /** Beside the title on computers, e.g. a page's tabs or filters. */
  nav?: ReactNode
  /** On computers: the nav in the middle of the bar, with the title on one side and the actions on the other. */
  centerNav?: boolean
  /** The gear on phones; desktop has Settings in the sidebar. */
  showSettings?: boolean
}

/** On phones the title sits at the top of the page. On computers this is the app's top bar: it stays in view and holds the page's controls. */
export function PageHeader({ title, subtitle, backTo, actions, nav, centerNav, showSettings = true }: PageHeaderProps) {
  return (
    <header className="mb-5 flex min-h-11 items-center gap-3 @container md:mb-8 desk:sticky desk:top-0 desk:z-20 desk:-mx-8 desk:mb-6 desk:min-h-16 desk:gap-4 desk:border-b desk:border-line desk:bg-bg desk:px-8 print:static print:mx-0 print:border-0 print:px-0">
      {backTo && (
        <Link to={backTo} aria-label={t.common.back} title={t.common.back} className={clsx(iconButtonClass('ghost'), '-ms-2')}>
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
      )}
      <div className={clsx('min-w-0 flex-1 desk:flex desk:flex-row-reverse desk:items-baseline desk:gap-3', centerNav ? 'desk:min-w-fit desk:justify-end' : 'desk:flex-none')}>
        {subtitle && <p className="text-sm font-semibold text-muted">{subtitle}</p>}
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl desk:text-2xl">{title}</h1>
      </div>
      {/* Short of room, the nav scrolls sideways rather than running under the buttons. */}
      {nav && <div className={clsx('hidden min-w-0 desk:-my-1 desk:block desk:overflow-x-auto desk:py-1 desk:[scrollbar-width:none] print:!hidden', !centerNav && 'desk:ms-4')}>{nav}</div>}
      {!centerNav && <div aria-hidden className="hidden flex-1 desk:block" />}
      {/* With the nav centred, this side takes the same share as the title's, so the nav lands in the middle. Otherwise these are just items of the bar. */}
      <div className={clsx('contents', centerNav && 'desk:flex desk:min-w-fit desk:flex-1 desk:items-center desk:justify-end desk:gap-4')}>
        {actions}
        <button
          type="button"
          onClick={() => openTransactionSheet('expense')}
          title={t.desk.addHint}
          className="hidden min-h-10 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition hover:brightness-110 desk:inline-flex print:!hidden"
        >
          <Plus aria-hidden className="size-4" />
          {t.nav.add}
          <kbd aria-hidden className="ms-0.5 rounded border border-on-accent/30 px-1.5 font-sans text-xs leading-5 opacity-80">
            N
          </kbd>
        </button>
      </div>
      {showSettings && (
        <Link to="/settings" aria-label={t.nav.settings} title={t.nav.settings} className={clsx(iconButtonClass(), 'md:hidden')}>
          <Settings aria-hidden className="size-[1.125rem]" />
        </Link>
      )}
    </header>
  )
}
