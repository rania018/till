import type { ISODate } from '../../types'

/**
 * What a cell holds. A plain number is shown as an amount: `1,450`, or `15.99` when it has cents.
 * A month is the first day of it, shown as "November 2026". A signed percent shows its sign: +12%.
 */
export type Value = string | number | null | undefined | { date: ISODate } | { month: ISODate } | { percent: number; signed?: boolean }

/** The app's colours for meaning: green for money in or done, amber for close, red for late or over, grey for closed or a move. */
export type Tone = 'good' | 'warn' | 'crit' | 'muted'

/** A value with a look of its own. Most cells don't need one and stay a bare value. */
export interface Styled {
  value: Value
  /** Coloured text, as the app colours it. */
  tone?: Tone
  /** A status label: the tone's soft colour behind its text. */
  badge?: Tone
  /** A colour behind the text, like a category's pastel (#rrggbb). */
  fill?: string
  /** The line that adds up the ones above it: its whole row in bold, with a line above. */
  total?: boolean
}

export type Cell = Value | Styled

export interface Table {
  /** Shown above the table, on sheets that hold more than one. */
  title?: string
  headers: string[]
  rows: Cell[][]
  /** Columns drawn as bars inside their cells: a percent from 0 to 100%, an amount from 0 to the column's biggest. */
  bars?: number[]
  /**
   * A column, like the currency, whose runs of equal values each get bars of their own scale:
   * amounts in different currencies are never measured against each other.
   */
  scaleBy?: number
  /** An Excel chart of the table, beside it. With `scaleBy`, it shows the first run: the main currency. */
  chart?: Chart
}

/** A column a chart plots, named by its column name. */
export interface ChartSeries {
  column: number
  /** Drawn as a line over the columns, the way the app draws income over spending. */
  line?: boolean
  /** Its own colour (#rrggbb); otherwise the sheet's. */
  color?: string
}

/**
 * A real Excel chart, reading its numbers from the table's cells, so it changes with them.
 * `column` stands up, `bar` lies down with the first row on top, and a doughnut colours each
 * slice like its name's cell, a category on its pastel.
 */
export interface Chart {
  kind: 'column' | 'bar' | 'line' | 'doughnut'
  /** Its title; otherwise the table's, or the sheet's name. */
  title?: string
  /** The column naming each point. */
  labels: number
  series: ChartSeries[]
}

export interface Sheet extends Table {
  name: string
  /**
   * A band at the top naming the page and its dates, for overview sheets. Lists have none, so
   * their column names stay on the first row, where sorting and filtering expect them.
   */
  heading?: { title: string; subtitle?: string }
  /** More tables under the first, each with its own title. */
  more?: Table[]
}

export interface Workbook {
  fileName: string
  sheets: Sheet[]
}

export const dateCell = (date: ISODate | null | undefined): Value => (date ? { date } : null)
export const monthCell = (date: ISODate): Value => ({ month: `${date.slice(0, 7)}-01` })
export const percentCell = (ratio: number | null | undefined, signed = false): Value => (ratio === null || ratio === undefined ? null : signed ? { percent: ratio, signed } : { percent: ratio })

export function isStyled(cell: Cell): cell is Styled {
  return typeof cell === 'object' && cell !== null && 'value' in cell
}

/** What's in a cell, without its look. */
export const plain = (cell: Cell): Value => (isStyled(cell) ? cell.value : cell)

const isEmpty = (value: Value) => value === null || value === undefined || value === ''

/** Coloured text, or the bare value when there's no tone. */
export const toned = (value: Value, tone: Tone | undefined): Cell => (tone && !isEmpty(value) ? { value, tone } : value)

/** A status as a coloured label, or plain text when it has no tone. */
export const badge = (text: string | undefined, tone: Tone | undefined): Cell => (text ? (tone ? { value: text, badge: tone } : text) : null)

/** A name on its colour, like a category on its pastel. */
export const filled = (text: string | undefined, fill: string | undefined): Cell => (text ? (fill ? { value: text, fill } : text) : null)

/** The first cell of a row that adds up the ones above. */
export const totalCell = (value: Value): Styled => ({ value, total: true })

/**
 * The category pastels by slot, as on the app's light theme (`--cat-1` to `--cat-8` in index.css):
 * a file is read on white, whatever theme the app was in.
 */
export const CATEGORY_PASTELS = ['#f8928a', '#a4aafe', '#90c472', '#69bafd', '#ed9f5b', '#24c9d8', '#ccb14b', '#d698e4']
export const OTHER_PASTEL = '#b9b3c0'
/** Income in charts: the app's plum, as on Stats. */
export const INCOME_COLOR = '#5e2b7e'
/** What something is measured against in charts, like the period before or a limit: grey. */
export const BEFORE_COLOR = OTHER_PASTEL

/** The file's bytes. The writer loads only when someone exports, so it doesn't slow down opening the app. */
export async function workbookToBlob(sheets: Sheet[], rightToLeft: boolean): Promise<Blob> {
  const { writeWorkbook } = await import('./xlsx')
  return writeWorkbook(sheets, rightToLeft)
}
