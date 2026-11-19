import clsx from 'clsx'
import { ClipboardCheck, FileText, Landmark, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { iconButtonClass } from '../ui/buttonStyles'

/** Stats' ways to look back: the review of the last pay cycle, the year on one page, and net worth over time. Icons on a phone, with words where there's room, like the Excel button. */
export function LookBackLinks() {
  return (
    <>
      <LookBack to="/review" icon={ClipboardCheck} label={t.review.open} short={t.review.openShort} />
      <LookBack to="/report" icon={FileText} label={t.report.open} short={t.report.openShort} />
      <LookBack to="/wallets/net-worth" icon={Landmark} label={t.netWorth.open} short={t.netWorth.title} />
    </>
  )
}

function LookBack({ to, icon: LinkIcon, label, short }: { to: string; icon: LucideIcon; label: string; short: string }) {
  return (
    <Link to={to} aria-label={label} title={label} className={clsx(iconButtonClass(), 'desk:@min-[64rem]:w-auto desk:@min-[64rem]:gap-2 desk:@min-[64rem]:px-3 desk:@min-[64rem]:text-sm desk:@min-[64rem]:font-bold')}>
      <LinkIcon aria-hidden className="size-[1.125rem] desk:size-4" />
      <span className="hidden desk:@min-[64rem]:inline">{short}</span>
    </Link>
  )
}
