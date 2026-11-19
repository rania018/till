import { differenceInCalendarDays, format, formatDistanceToNow, type Locale } from 'date-fns'
import { fromISODate } from '../lib/dates'
import type { ISODate } from '../types'

interface DateWords {
  today: string
  tomorrow: string
  yesterday: string
  /** date-fns pattern for a day and time, e.g. `EEE d MMM 'at' HH:mm`. */
  dateTime: string
  /** Arabic doesn't shorten day and month names, and date-fns' short forms are cut off. */
  fullNames?: boolean
}

/** The date helpers every language has, in that language. Lives under `t.format`. */
export function createDateFormat(locale: Locale, words: DateWords) {
  const month = words.fullNames ? 'MMMM' : 'MMM'
  const weekday = words.fullNames ? 'EEEE' : 'EEE'
  const show = (date: ISODate, pattern: string) => format(fromISODate(date), pattern, { locale })
  // 1 January 2023 was a Sunday.
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((day) => format(new Date(2023, 0, 1 + day), 'EEEE', { locale }))

  return {
    /** Sunday first, to match Date.getDay(). */
    weekdays,
    /** Sunday first: one letter, for a calendar's narrow columns (Arabic's single letters too). */
    weekdaysNarrow: [0, 1, 2, 3, 4, 5, 6].map((day) => format(new Date(2023, 0, 1 + day), 'EEEEE', { locale })),
    /** Sunday first: Sun, Mon… Arabic keeps the whole name. */
    weekdaysShort: [0, 1, 2, 3, 4, 5, 6].map((day) => format(new Date(2023, 0, 1 + day), weekday, { locale })),
    /** The day a week starts on in this language (0 = Sunday), as calendars there show it. */
    weekStartsOn: locale.options?.weekStartsOn ?? 0,
    /** 6 */
    dayNumber: (date: ISODate) => show(date, 'd'),
    /** today, tomorrow, yesterday, a weekday within the week either side, or 17 Nov. */
    nearDay(date: ISODate, today: ISODate): string {
      const days = differenceInCalendarDays(fromISODate(date), fromISODate(today))
      if (days === 0) return words.today
      if (days === 1) return words.tomorrow
      if (days === -1) return words.yesterday
      if (Math.abs(days) < 7) return weekdays[fromISODate(date).getDay()]
      return show(date, `d ${month}`)
    },
    /** 25 Oct */
    dayMonth: (date: ISODate) => show(date, `d ${month}`),
    /** Tue 17 Nov */
    shortDay: (date: ISODate) => show(date, `${weekday} d ${month}`),
    /** Tue 17 Nov, or 5 Sep 2027 when it's not in this year: "Sun 5 Sep" would read as one already gone. */
    shortDayOrDate: (date: ISODate, today: ISODate) => (date.slice(0, 4) === today.slice(0, 4) ? show(date, `${weekday} d ${month}`) : show(date, `d ${month} yyyy`)),
    /** Sunday 15 November */
    longDay: (date: ISODate) => show(date, 'EEEE d MMMM'),
    /** Sunday 15 November 2026 */
    longDayWithYear: (date: ISODate) => show(date, 'EEEE d MMMM yyyy'),
    /** Mon 2 Nov at 20:00 */
    dateTime: (moment: string) => format(new Date(moment), words.dateTime, { locale }),
    /** 3 days ago */
    relative: (moment: string) => formatDistanceToNow(new Date(moment), { addSuffix: true, locale }),
    /** 15 Dec 2027 */
    date: (date: ISODate) => show(date, `d ${month} yyyy`),
    /** Nov, for chart labels. */
    month: (date: ISODate) => show(date, month),
    /** March 2027 */
    monthYear: (date: ISODate) => show(date, 'MMMM yyyy'),
    /** 25 Oct – 24 Nov. Over two months and across a new year: 25 Nov 2025 – 3 Nov 2026. */
    range(start: ISODate, end: ISODate): string {
      const years = start.slice(0, 4) !== end.slice(0, 4) && differenceInCalendarDays(fromISODate(end), fromISODate(start)) > 62
      const shape = years ? `d ${month} yyyy` : `d ${month}`
      return `${show(start, shape)} – ${show(end, shape)}`
    },
  }
}
