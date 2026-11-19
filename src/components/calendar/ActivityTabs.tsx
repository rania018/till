import { t } from '../../i18n'
import { SegmentedLinks } from '../ui/SegmentedControl'

/** Activity's views side by side: the overview first, then the list, the calendar and tags. On phones the bottom bar has no room for Calendar. */
export function ActivityTabs() {
  return (
    <SegmentedLinks
      prominent
      label={t.calendar.tabsLabel}
      links={[
        { to: '/activity', label: t.insights.overview, end: true },
        { to: '/activity/list', label: t.calendar.list },
        { to: '/calendar', label: t.calendar.calendar },
        { to: '/activity/tags', label: t.tags.title },
      ]}
    />
  )
}
