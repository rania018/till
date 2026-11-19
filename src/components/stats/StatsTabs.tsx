import { t } from '../../i18n'
import { SegmentedLinks } from '../ui/SegmentedControl'

/** Stats' sections side by side in a computer's top bar. Phones reach the other three from buttons at the top of Stats. */
export function StatsTabs() {
  return (
    <SegmentedLinks
      prominent
      label={t.stats.tabsLabel}
      links={[
        { to: '/stats', label: t.stats.tabGeneral, end: true },
        { to: '/review', label: t.stats.tabLastCycle },
        { to: '/report', label: t.report.open },
        { to: '/wallets/net-worth', label: t.netWorth.title },
      ]}
    />
  )
}
