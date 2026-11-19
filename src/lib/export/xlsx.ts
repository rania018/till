import writeXlsxFile, { type CellObject, type Feature, type Row as XlsxRow, type Sheet as XlsxSheet } from 'write-excel-file/universal'
import { getCellAddress, getOrderOfSiblings, insertElementMarkupAccordingToOrderOfSiblings } from 'write-excel-file/utility'
import { tillCharts, type PlacedChart } from './charts'
import { CATEGORY_PASTELS, isStyled, OTHER_PASTEL, plain, type Cell, type Sheet, type Styled, type Table, type Tone, type Value } from './workbook'

/**
 * Turns the workbook into an Excel file with the app's look: each sheet in a pastel of its own
 * (its tab, column names and bars), a line under each row, statuses as coloured labels, money in
 * green as in the app, and overview sheets under a plum band. Loaded only when someone exports.
 */

/** The app's light theme (index.css). */
const INK = '#1a1222'
const PLUM = '#5e2b7e'
const PETAL = '#f0e6f5'
const LINE = '#e4dde8'
const WHITE = '#ffffff'
const TONES: Record<Tone, { ink: string; soft: string }> = {
  good: { ink: '#006300', soft: '#e3f5e3' },
  warn: { ink: '#7a5000', soft: '#fff4d6' },
  crit: { ink: '#b02a2a', soft: '#fde8e8' },
  muted: { ink: '#6b5f73', soft: '#ece6ef' },
}

/** Each sheet's colour, in the order of its sheets: lilac (the brand's) first, then blue, green, orange, teal, coral, periwinkle and gold. */
const SHEET_COLORS = [8, 4, 3, 5, 6, 1, 2, 7].map((slot) => CATEGORY_PASTELS[slot - 1])

const FORMATS = { amount: '#,##0', cents: '#,##0.00', percent: '0%', signed: '+0%;-0%;0%', date: 'yyyy-mm-dd', month: 'mmmm yyyy' }

/** Excel refuses anything longer in one cell. */
const MAX_TEXT = 32_767
const MIN_WIDTH = 8
const MAX_WIDTH = 42
/** The heading band spans at least this many columns, so the page's name and dates fit on it. */
const HEADING_SPAN = 6

/** Control characters aren't allowed in the file's XML, and one in a pasted note would make Excel report it as damaged. */
function cleanText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').slice(0, MAX_TEXT)
}

function content(value: Value): CellObject | null {
  if (value === null || value === undefined || value === '') return null
  // Text always stays text, so a note like "=SUM(A1)" can never run as a formula.
  if (typeof value === 'string') return { value: cleanText(value), type: String }
  if (typeof value === 'number') return Number.isFinite(value) ? { value, type: Number, format: Number.isInteger(value) ? FORMATS.amount : FORMATS.cents } : null
  if ('percent' in value) return Number.isFinite(value.percent) ? { value: value.percent, type: Number, format: value.signed ? FORMATS.signed : FORMATS.percent } : null
  const day = 'date' in value ? value.date : value.month
  const [year, month, date] = day.split('-').map(Number)
  // At midnight UTC, because that's how the file stores a day: local time would move it a day in some time zones.
  return { value: new Date(Date.UTC(year, month - 1, date)), type: Date, format: 'date' in value ? FORMATS.date : FORMATS.month }
}

function textWidth(value: Value): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'string') return value.length
  if (typeof value === 'number') return Math.abs(value).toLocaleString('en').length + 1
  if ('date' in value) return 10
  if ('month' in value) return 14
  return 5
}

const isPercent = (value: Value) => typeof value === 'object' && value !== null && 'percent' in value

/** A column drawn as bars, over rows `from` to `to` (counted from 0). */
interface Bars {
  column: number
  from: number
  to: number
  /** Percents run from 0 to 100%; amounts from 0 to the biggest. */
  percent: boolean
}

/** What the writer can't do on its own, added by `tillLooks` and `tillCharts`. */
interface Extras {
  color: string
  /** The range the filter buttons cover, on lists. */
  filter?: string
  bars: Bars[]
  charts: PlacedChart[]
}

/** Charts' sizes in pixels: beside a table on an overview, or beside a list. */
const OVERVIEW_CHART = { width: 520, height: 300 }
const LIST_CHART = { width: 640, height: 340 }
/** Row heights in pixels (points × 4/3): a table's title, its column names, its rows, and an empty row. */
const ROW_PX = { title: 35, header: 32, body: 24, empty: 20 }
/**
 * A bar chart grows with its rows, so Excel has room to name every one instead of every other:
 * each bar's thickness and the space between rows, over room for its title, legend and amounts.
 */
const BAR_PX = { bar: 12, between: 8, around: 100 }

/** `'Pay cycles'!$B$2:$B$13`: an address a chart can read, whatever the sheet is called. */
function address(sheetName: string, from: number, to: number, column: number): string {
  const fixed = (row: number) => getCellAddress(row, column).replace(/^([A-Z]+)(\d+)$/, (_, letters: string, digits: string) => `$${letters}$${digits}`)
  return `'${sheetName.replace(/'/g, "''")}'!${fixed(from)}${to === from ? '' : `:${fixed(to)}`}`
}

/**
 * A table's chart, reading rows `from` to `to` of the sheet (its first run of `scaleBy`: the main
 * currency). None for fewer than two points, or with nothing but zeros to draw.
 */
function placeChart(sheetName: string, table: Table, rows: { first: number; from: number; to: number }, at: PlacedChart['at'], size: PlacedChart['size'], color: string, rightToLeft: boolean): PlacedChart | null {
  const { chart } = table
  if (!chart || rows.to - rows.from < 1) return null
  const cells = table.rows.slice(rows.from - rows.first, rows.to - rows.first + 1)
  const header = rows.first - 1
  const series = chart.series.map((one) => ({
    name: table.headers[one.column],
    nameRef: address(sheetName, header, header, one.column),
    ref: address(sheetName, rows.from, rows.to, one.column),
    values: cells.map((row) => plain(row[one.column])),
    color: one.color ?? color,
    line: chart.kind === 'line' || Boolean(one.line),
  }))
  if (!series.some((one) => one.values.some((value) => typeof value === 'number' && value !== 0))) return null
  const currency = table.scaleBy === undefined ? undefined : plain(cells[0][table.scaleBy])
  const barsHeight = BAR_PX.around + cells.length * (BAR_PX.bar * series.length + BAR_PX.between)
  return {
    kind: chart.kind,
    title: [chart.title ?? table.title ?? sheetName, typeof currency === 'string' ? currency : undefined].filter(Boolean).join(' · '),
    rightToLeft,
    at,
    size: chart.kind === 'bar' ? { ...size, height: Math.max(size.height, barsHeight) } : size,
    labels: { ref: address(sheetName, rows.from, rows.to, chart.labels), values: cells.map((row) => plain(row[chart.labels])) },
    series,
    // A slice's colour is its name's: a category on its pastel, anything without one grey.
    pointColors: chart.kind === 'doughnut' ? cells.map((row) => (isStyled(row[chart.labels]) && (row[chart.labels] as Styled).fill) || OTHER_PASTEL) : undefined,
  }
}

type TillSheet = XlsxSheet<Blob> & { till: Extras }

const ROW_LINE = { bottomBorderColor: LINE, bottomBorderStyle: 'thin' } as const
const TOTAL_LINE = { fontWeight: 'bold', backgroundColor: PETAL, topBorderColor: PLUM, topBorderStyle: 'thin', bottomBorderColor: PLUM, bottomBorderStyle: 'thin' } as const

/** A cell across `span` columns: the writer wants the columns it covers left empty. */
function spanning(cell: CellObject, span: number): XlsxRow {
  return [{ ...cell, columnSpan: span }, ...Array<null>(span - 1).fill(null)]
}

const hasLines = (value: Value) => typeof value === 'string' && value.includes('\n')

const isNumber = (value: Value) => typeof value !== 'string'

/**
 * Where a cell's content sits. In English, Excel's own way: text on the left where reading starts,
 * numbers on the right where it ends. Arabic is the mirror of it, so a number never runs into the
 * next column's and a bar, which starts where reading does, ends away from its number.
 */
function sideOf(number: boolean, rightToLeft: boolean): 'left' | 'right' | undefined {
  if (rightToLeft) return number ? 'left' : 'right'
  return number ? 'right' : undefined
}

function bodyRow(row: Cell[], length: number, rightToLeft: boolean): XlsxRow {
  const total = row.some((cell) => isStyled(cell) && cell.total)
  // A note on several lines shows them, and its row grows to fit: Excel sizes a row with no height of its own.
  const lines = row.some((cell) => hasLines(plain(cell)))
  return Array.from({ length }, (_, column): CellObject => {
    const cell = row[column]
    const value = plain(cell)
    const look = isStyled(cell) ? cell : undefined
    const tone = look?.badge ?? look?.tone
    // English is left to Excel, which already puts each kind of value where it belongs.
    const align = rightToLeft && value !== null && value !== undefined && value !== '' ? sideOf(isNumber(value), true) : undefined
    return {
      ...content(value),
      ...(align && { align }),
      ...(lines ? { alignVertical: 'top', ...(hasLines(plain(cell)) && { wrap: true }) } : { height: 18, alignVertical: 'center' }),
      // Empty cells too, so each row's line runs across the table.
      ...(total ? TOTAL_LINE : ROW_LINE),
      ...(look?.fill && { backgroundColor: look.fill }),
      ...(look?.badge && { backgroundColor: TONES[look.badge].soft }),
      ...(tone && { textColor: TONES[tone].ink }),
    }
  })
}

/** One sheet as the writer takes it. A list gets frozen column names and filter buttons; an overview gets a heading band and its tables one under the other. */
function layout(sheet: Sheet, color: string, rightToLeft: boolean): TillSheet {
  const tables = [sheet, ...(sheet.more ?? []).filter((table) => table.rows.length > 0)]
  const overview = Boolean(sheet.heading) || tables.length > 1
  const span = Math.max(...tables.map((table) => table.headers.length))
  const widths = Array<number>(span).fill(MIN_WIDTH)
  const fit = (column: number, width: number) => (widths[column] = Math.min(MAX_WIDTH, Math.max(widths[column], width + 2)))
  const data: XlsxRow[] = []
  const bars: Bars[] = []
  const charts: PlacedChart[] = []

  // A title that starts with a Latin word or a digit ("Till · …", "25 أكتوبر …") would read left to right
  // in Arabic, on the wrong side. A right-to-left mark leads it; titles aren't data, so nothing searches them.
  const title = (text: string) => cleanText(rightToLeft ? `\u200f${text}` : text)

  if (sheet.heading) {
    const across = Math.max(span, HEADING_SPAN)
    data.push(spanning({ value: title(sheet.heading.title), type: String, fontSize: 16, fontWeight: 'bold', textColor: WHITE, backgroundColor: PLUM, height: 34, alignVertical: 'center', indent: 1 }, across))
    if (sheet.heading.subtitle) data.push(spanning({ value: title(sheet.heading.subtitle), type: String, textColor: PLUM, backgroundColor: PETAL, height: 22, alignVertical: 'center', indent: 1 }, across))
    data.push([])
  }

  tables.forEach((table, index) => {
    if (index > 0) data.push([])
    const top = data.length
    if (table.title) {
      data.push(spanning({ value: title(table.title), type: String, fontSize: 13, fontWeight: 'bold', textColor: PLUM, height: 26, alignVertical: 'bottom', bottomBorderColor: color, bottomBorderStyle: 'medium' }, table.headers.length))
    }
    data.push(
      table.headers.map((header, column): CellObject => {
        fit(column, header.length)
        // Over a column of numbers, on the numbers' side.
        const values = table.rows.map((row) => plain(row[column])).filter((value) => value !== null && value !== undefined && value !== '')
        const align = sideOf(values.length > 0 && values.every(isNumber), rightToLeft)
        return { value: cleanText(header), type: String, fontWeight: 'bold', textColor: INK, backgroundColor: color, height: 24, alignVertical: 'center', ...(align && { align }) }
      }),
    )
    const first = data.length
    for (const row of table.rows) {
      table.headers.forEach((_, column) => fit(column, textWidth(plain(row[column]))))
      data.push(bodyRow(row, table.headers.length, rightToLeft))
    }
    // One scale per run of rows that share a `scaleBy` value, or one for the whole column.
    const runs: { from: number; to: number }[] = []
    table.rows.forEach((row, i) => {
      const last = runs[runs.length - 1]
      const sameRun = last && (table.scaleBy === undefined || plain(row[table.scaleBy]) === plain(table.rows[i - 1][table.scaleBy]))
      if (sameRun) last.to = first + i
      else runs.push({ from: first + i, to: first + i })
    })
    for (const column of table.bars ?? []) {
      const values = table.rows.map((row) => plain(row[column])).filter((value) => value !== null && value !== undefined)
      const percent = values.length > 0 && values.every(isPercent)
      for (const run of runs) bars.push({ column, ...run, percent })
    }
    // The chart sits one column clear of the widest table: beside its table on an overview, beside the
    // list under its frozen column names on a list. On an overview the table's room grows to the chart's
    // height, so the next table starts below it.
    const placed = runs[0] && placeChart(sheet.name, table, { first, ...runs[0] }, { row: overview ? top : 1, column: span + 1 }, overview ? OVERVIEW_CHART : LIST_CHART, color, rightToLeft)
    if (!placed) return
    charts.push(placed)
    if (!overview) return
    let room = (table.title ? ROW_PX.title : 0) + ROW_PX.header + table.rows.length * ROW_PX.body
    while (room < placed.size.height + ROW_PX.empty) {
      data.push([])
      room += ROW_PX.empty
    }
  })

  return {
    sheet: sheet.name,
    rightToLeft,
    showGridLines: false,
    columns: widths.map((width) => ({ width })),
    data,
    ...(overview ? {} : { stickyRowsCount: 1 }),
    till: { color, bars, charts, filter: !overview && sheet.rows.length > 1 ? `A1:${getCellAddress(sheet.rows.length, span - 1)}` : undefined },
  }
}

export function toXlsxSheets(sheets: Sheet[], rightToLeft: boolean): TillSheet[] {
  return sheets.map((sheet, index) => layout(sheet, SHEET_COLORS[index % SHEET_COLORS.length], rightToLeft))
}

const SHEET_ORDER = getOrderOfSiblings('xl/worksheets/sheet{id}.xml', 'worksheet')
const insert = (xml: string, markup: string) => insertElementMarkupAccordingToOrderOfSiblings(xml, markup, SHEET_ORDER ?? [], 'worksheet')
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`
const X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main'
const XM = 'http://schemas.microsoft.com/office/excel/2006/main'

/** Ties a bar rule to its Excel 2010 settings (solid, starting from nothing). Unique within the file. */
const barId = (sheet: number, bar: number) => `{7E11A000-0000-4000-8000-${sheet.toString(16).padStart(4, '0')}${bar.toString(16).padStart(8, '0')}}`.toUpperCase()

function barRules(bars: Bars[], color: string, sheet: number): string[] {
  const range = (bar: Bars) => `${getCellAddress(bar.from, bar.column)}:${getCellAddress(bar.to, bar.column)}`
  // Older readers draw the first part; Excel 2010 and later use the second, for solid bars that start at 0 and can reach the cell's end.
  const rules = bars.map(
    (bar, i) =>
      `<conditionalFormatting sqref="${range(bar)}"><cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="num" val="0"/>${bar.percent ? '<cfvo type="num" val="1"/>' : '<cfvo type="max"/>'}<color rgb="${argb(color)}"/></dataBar>` +
      `<extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="${X14}"><x14:id>${barId(sheet, i)}</x14:id></ext></extLst></cfRule></conditionalFormatting>`,
  )
  const solid = bars.map(
    (bar, i) =>
      `<x14:conditionalFormatting xmlns:xm="${XM}"><x14:cfRule type="dataBar" id="${barId(sheet, i)}"><x14:dataBar minLength="0" maxLength="100" gradient="0">` +
      `<x14:cfvo type="num"><xm:f>0</xm:f></x14:cfvo>${bar.percent ? '<x14:cfvo type="num"><xm:f>1</xm:f></x14:cfvo>' : '<x14:cfvo type="max"/>'}` +
      `<x14:negativeFillColor rgb="${argb(TONES.crit.ink)}"/><x14:axisColor rgb="${argb(INK)}"/></x14:dataBar></x14:cfRule><xm:sqref>${range(bar)}</xm:sqref></x14:conditionalFormatting>`,
  )
  return [rules.join(''), `<extLst><ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="${X14}"><x14:conditionalFormattings>${solid.join('')}</x14:conditionalFormattings></ext></extLst>`]
}

/** The tab's colour, filter buttons on lists and bars in cells: what the writer has no option for. */
const tillLooks: Feature<Blob> = {
  files: {
    transform: {
      'xl/worksheets/sheet{id}.xml': {
        transform(xml, options, { sheetIndex }) {
          const extras = (options as Partial<TillSheet>).till
          if (!extras) return xml
          let out = insert(xml, `<sheetPr><tabColor rgb="${argb(extras.color)}"/></sheetPr>`)
          if (extras.filter) out = insert(out, `<autoFilter ref="${extras.filter}"/>`)
          if (extras.bars.length > 0) for (const markup of barRules(extras.bars, extras.color, sheetIndex)) out = insert(out, markup)
          return out
        },
      },
    },
  },
}

export function writeWorkbook(sheets: Sheet[], rightToLeft: boolean): Promise<Blob> {
  return writeXlsxFile(toXlsxSheets(sheets, rightToLeft), { features: [tillLooks, tillCharts] }).toBlob()
}
