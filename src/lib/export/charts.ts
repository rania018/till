import type { Feature } from 'write-excel-file/universal'
import { convertDateToSerialNumber, sanitizeAttributeValue, sanitizeTextContent } from 'write-excel-file/utility'
import type { Chart, Value } from './workbook'

/**
 * Real Excel charts (DrawingML), added to the file the writer makes: a chart part for each,
 * placed on the sheet's drawing. Each one reads its numbers from the sheet's cells and keeps a
 * copy of them, so it shows in readers that don't recalculate and changes when a cell does.
 * Loaded only when someone exports.
 */

/** The app's light theme (index.css). */
const PLUM = '5E2B7E'
const INK_2 = '4A3F52'
const LINE = 'E4DDE8'
const GRID = 'ECE6EF'
const WHITE = 'FFFFFF'

const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Pixels to the drawing's units (EMU). */
const EMU = 9525
/** A slice smaller than this has no label, so small ones don't pile up on each other. */
const MIN_LABELLED_SLICE = 0.04

/** A chart laid out on its sheet, with its cells' addresses and a copy of their values. */
export interface PlacedChart {
  kind: Chart['kind']
  title: string
  rightToLeft: boolean
  /** Its top corner's cell, counted from 0, and its size in pixels. */
  at: { row: number; column: number }
  size: { width: number; height: number }
  labels: { ref: string; values: Value[] }
  series: { name: string; nameRef: string; ref: string; values: Value[]; color: string; line: boolean }[]
  /** Each point's colour, for a doughnut. */
  pointColors?: string[]
}

const hex = (color: string) => color.replace('#', '').toUpperCase()
const fill = (color: string) => `<a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill>`
const text = (value: string) => sanitizeTextContent(value)

function serial(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return convertDateToSerialNumber(new Date(Date.UTC(year, month - 1, date)))
}

/** A cell's value as a chart reads it: a number, a date as Excel counts days, or nothing. */
function numberOf(value: Value): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined || typeof value === 'string') return null
  if ('percent' in value) return Number.isFinite(value.percent) ? value.percent : null
  return serial('date' in value ? value.date : value.month)
}

const isDay = (value: Value) => typeof value === 'object' && value !== null && ('date' in value || 'month' in value)
const labelText = (value: Value) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '')

/** How dates name the points: "4 Nov" for days, "Nov 26" for months; `null` when the names are text. */
function dateFormat(values: Value[]): string | null {
  const days = values.filter((value) => value !== null && value !== undefined)
  if (days.length === 0 || !days.every(isDay)) return null
  return days.every((value) => typeof value === 'object' && value !== null && 'month' in value) ? 'mmm yy' : 'd mmm'
}

function numberCache(values: Value[], format: string): string {
  const points = values.map((value, i) => [i, numberOf(value)] as const).filter(([, n]) => n !== null)
  return `<c:numCache><c:formatCode>${text(format)}</c:formatCode><c:ptCount val="${values.length}"/>${points.map(([i, n]) => `<c:pt idx="${i}"><c:v>${n}</c:v></c:pt>`).join('')}</c:numCache>`
}

function categories(chart: PlacedChart): string {
  const format = dateFormat(chart.labels.values)
  if (format) return `<c:cat><c:numRef><c:f>${text(chart.labels.ref)}</c:f>${numberCache(chart.labels.values, format)}</c:numRef></c:cat>`
  const names = chart.labels.values.map(labelText)
  return `<c:cat><c:strRef><c:f>${text(chart.labels.ref)}</c:f><c:strCache><c:ptCount val="${names.length}"/>${names.map((name, i) => `<c:pt idx="${i}"><c:v>${text(name)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`
}

function seriesStart(chart: PlacedChart, i: number): string {
  const series = chart.series[i]
  return `<c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${text(series.nameRef)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${text(series.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
}

const seriesValues = (chart: PlacedChart, i: number) => `<c:val><c:numRef><c:f>${text(chart.series[i].ref)}</c:f>${numberCache(chart.series[i].values, '#,##0')}</c:numRef></c:val>`

const AXIS_IDS = '<c:axId val="50010"/><c:axId val="50020"/>'

function barSeries(chart: PlacedChart, i: number): string {
  return `<c:ser>${seriesStart(chart, i)}<c:spPr>${fill(chart.series[i].color)}</c:spPr><c:invertIfNegative val="0"/>${categories(chart)}${seriesValues(chart, i)}</c:ser>`
}

function lineSeries(chart: PlacedChart, i: number): string {
  const color = chart.series[i].color
  return (
    `<c:ser>${seriesStart(chart, i)}<c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr>` +
    `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(color)}<a:ln w="9525">${fill(WHITE)}</a:ln></c:spPr></c:marker>` +
    `${categories(chart)}${seriesValues(chart, i)}<c:smooth val="0"/></c:ser>`
  )
}

/** Columns, bars or lines over two axes. Bars lie down with the first row on top, their amounts along the bottom. */
function axesPlot(chart: PlacedChart): string {
  const bar = chart.kind === 'bar'
  const indexes = chart.series.map((_, i) => i)
  const lines = indexes.filter((i) => chart.kind === 'line' || chart.series[i].line)
  const blocks = indexes.filter((i) => !lines.includes(i))
  const format = dateFormat(chart.labels.values)
  const axisLine = `<c:spPr><a:ln w="9525">${fill(LINE)}</a:ln></c:spPr>`
  return (
    (blocks.length > 0
      ? `<c:barChart><c:barDir val="${bar ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${blocks.map((i) => barSeries(chart, i)).join('')}<c:gapWidth val="60"/>${AXIS_IDS}</c:barChart>`
      : '') +
    (lines.length > 0 ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lines.map((i) => lineSeries(chart, i)).join('')}<c:marker val="1"/>${AXIS_IDS}</c:lineChart>` : '') +
    `<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="${bar ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${bar ? 'l' : 'b'}"/>` +
    // Dates name the points as they are, one per point: not a timeline, which would space months by their days.
    `<c:numFmt formatCode="${format ? text(format) : 'General'}" sourceLinked="${format ? 0 : 1}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axisLine}` +
    `<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="${format ? 0 : 1}"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${bar ? 'b' : 'l'}"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350">${fill(GRID)}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="50010"/><c:crosses val="${bar ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  )
}

/** One ring, each slice in its own colour with its share on it, the smallest ones left unlabelled. */
function doughnutPlot(chart: PlacedChart): string {
  const amounts = chart.series[0].values.map((value) => Math.max(0, numberOf(value) ?? 0))
  const all = amounts.reduce((sum, amount) => sum + amount, 0)
  const outline = `<a:ln w="19050">${fill(WHITE)}</a:ln>`
  const slices = (chart.pointColors ?? []).map((color, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(color)}${outline}</c:spPr></c:dPt>`).join('')
  const unlabelled = amounts.map((amount, i) => (all > 0 && amount / all < MIN_LABELLED_SLICE ? `<c:dLbl><c:idx val="${i}"/><c:delete val="1"/></c:dLbl>` : '')).join('')
  const labels =
    `<c:dLbls>${unlabelled}<c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1">${fill('#1A1222')}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    `<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`
  return `<c:doughnutChart><c:varyColors val="1"/><c:ser>${seriesStart(chart, 0)}<c:spPr>${outline}</c:spPr>${slices}${labels}${categories(chart)}${seriesValues(chart, 0)}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`
}

export function chartXml(chart: PlacedChart): string {
  const rtl = chart.rightToLeft ? ' rtl="1"' : ''
  const title =
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr${rtl}><a:defRPr sz="1200" b="1">${fill(PLUM)}</a:defRPr></a:pPr>` +
    `<a:r><a:rPr sz="1200" b="1">${fill(PLUM)}</a:rPr><a:t>${text(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
  // A doughnut's slices are named in its legend; other charts need one only for two series or more.
  const legend = chart.kind === 'doughnut' || chart.series.length > 1 ? `<c:legend><c:legendPos val="${chart.kind === 'doughnut' ? 'r' : 'b'}"/><c:overlay val="0"/></c:legend>` : ''
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:roundedCorners val="0"/>` +
    `<c:chart>${title}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${chart.kind === 'doughnut' ? doughnutPlot(chart) : axesPlot(chart)}</c:plotArea>` +
    // Only what's visible: filter a list and its chart follows. Tables leave a zero empty to be easier
    // to read, so an empty cell is drawn as zero, not as a break in the line.
    `${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart>` +
    `<c:spPr>${fill(WHITE)}<a:ln w="9525">${fill(LINE)}</a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr${rtl}><a:defRPr sz="900">${fill(INK_2)}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    '</c:chartSpace>'
  )
}

/** Where the chart sits: from its corner cell, at a fixed size, with its title as its description for screen readers. */
function anchorXml(chart: PlacedChart, i: number): string {
  return (
    `<xdr:oneCellAnchor><xdr:from><xdr:col>${chart.at.column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.at.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${chart.size.width * EMU}" cy="${chart.size.height * EMU}"/>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}" descr="${sanitizeAttributeValue(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${R}" r:id="${relationId(i)}"/></a:graphicData></a:graphic>` +
    `</xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`
  )
}

const relationId = (i: number) => `rIdTillChart${i + 1}`
/** Named after the sheet's place and the chart's, so they're unique in the file. */
const chartPath = (sheetIndex: number, i: number) => `xl/charts/till-chart-${sheetIndex + 1}-${i + 1}.xml`

/** The sheet options' charts, as `layout` in xlsx.ts placed them. */
type WithCharts = { till?: { charts?: PlacedChart[] } }
const chartsOf = (options: unknown) => (options as WithCharts).till?.charts ?? []

/**
 * Puts the charts in the file: their parts, their content types, and each on its sheet's drawing,
 * which the writer creates for every sheet and keeps only when something is on it.
 */
export const tillCharts: Feature<Blob> = {
  files: {
    transform: {
      '[Content_Types].xml': {
        insert: (sheets) =>
          sheets
            .flatMap((options, sheetIndex) => chartsOf(options).map((_, i) => `<Override ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml" PartName="/${chartPath(sheetIndex, i)}"/>`))
            .join(''),
      },
      'xl/drawings/drawing{id}.xml': {
        insert: (options) => chartsOf(options).map(anchorXml).join(''),
      },
      'xl/drawings/_rels/drawing{id}.xml.rels': {
        insert: (options, { sheetIndex }) =>
          chartsOf(options)
            .map((_, i) => `<Relationship Id="${relationId(i)}" Type="${R}/chart" Target="../charts/${chartPath(sheetIndex, i).slice('xl/charts/'.length)}"/>`)
            .join(''),
      },
    },
    write: {
      files: (sheets) => Object.fromEntries(sheets.flatMap((options, sheetIndex) => chartsOf(options).map((chart, i) => [chartPath(sheetIndex, i), chartXml(chart)]))),
    },
  },
}
