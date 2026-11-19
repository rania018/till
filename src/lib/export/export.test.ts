import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { messages } from '../../i18n'
import { createInitialData } from '../../store/defaults'
import { demoData } from '../../test/demoData'
import type { AppData, Debt, Transaction } from '../../types'
import { categorySlot } from '../categoryTree'
import { getPayCycle } from '../dates'
import { filterTransactions } from '../transactions'
import { statsPeriod } from '../stats'
import { worthItCheck } from '../worthIt'
import { activityWorkbook, billsWorkbook, budgetWorkbook, categoriesWorkbook, debtsWorkbook, debtWorkbook, goalsWorkbook, goalWorkbook, homeWorkbook, netWorthWorkbook, statsWorkbook, walletsWorkbook, wishlistWorkbook, worthItWorkbook } from './pages'
import { CATEGORY_PASTELS, INCOME_COLOR, plain, workbookToBlob, type Cell, type Sheet } from './workbook'

const TODAY = '2026-11-04'
const demo = demoData(TODAY)
const STAMP = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' }

async function filesOf(sheets: Sheet[], rightToLeft = false) {
  const blob = await workbookToBlob(sheets, rightToLeft)
  const zipped = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  return Object.fromEntries(Object.entries(zipped).map(([name, bytes]) => [name, strFromU8(bytes)]))
}

const sheetNamed = (book: { sheets: Sheet[] }, name: string) => {
  const sheet = book.sheets.find((s) => s.name === name)
  if (!sheet) throw new Error(`No sheet called ${name}`)
  return sheet
}

/** A row's values, without their colours. */
const plainRow = (row: Cell[]) => row.map(plain)
const valueOf = (sheet: Sheet, label: string) => plain(sheet.rows.find((row) => plain(row[0]) === label)?.[1])

describe('the Excel file', () => {
  const sheet: Sheet = {
    name: 'Entries',
    headers: ['Date', 'Amount', 'Note', 'Used'],
    rows: [
      [{ date: '2026-11-04' }, 1450, '=SUM(A1:A9) <b>&', { percent: 0.25 }],
      [null, 15.99, 'bell\u0007 in a note', null],
    ],
  }

  it('stores real dates, without moving the day', async () => {
    const files = await filesOf([sheet])
    // 4 November 2026 is day 46330 in Excel's calendar.
    expect(files['xl/worksheets/sheet1.xml']).toContain('<v>46330</v>')
    expect(files['xl/styles.xml']).toContain('yyyy-mm-dd')
  })

  it('stores amounts as numbers, and notes that look like formulas as plain text', async () => {
    const files = await filesOf([sheet])
    const xml = files['xl/worksheets/sheet1.xml']
    expect(xml).toContain('<v>1450</v>')
    expect(xml).toContain('<v>15.99</v>')
    expect(xml).toContain('<v>0.25</v>')
    expect(xml).not.toContain('<f>')
    expect(files['xl/sharedStrings.xml']).toContain('=SUM(A1:A9) &lt;b&gt;&amp;')
  })

  it('drops characters that would make Excel call the file damaged', async () => {
    const files = await filesOf([sheet])
    expect(files['xl/sharedStrings.xml']).toContain('bell in a note')
    expect(files['xl/sharedStrings.xml']).not.toContain('\u0007')
  })

  it('reads right to left only in Arabic', async () => {
    expect((await filesOf([sheet], true))['xl/worksheets/sheet1.xml']).toMatch(/rightToLeft="(1|true)"/)
    expect((await filesOf([sheet], false))['xl/worksheets/sheet1.xml']).not.toContain('rightToLeft')
  })

  it.each(['en', 'fr', 'ar'] as const)('has sheet names Excel accepts in %s', (language) => {
    const names = Object.values(messages[language].exports.sheets)
    for (const name of names) {
      expect(name.length, name).toBeLessThanOrEqual(31)
      expect(name, name).not.toMatch(/[[\]:*?/\\]/)
      expect(name.toLowerCase(), name).not.toBe('history')
    }
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('each page gets its own workbook', () => {
  const words = messages.en.exports
  const cycle = getPayCycle(TODAY, demo.profile.salary)
  const goal = demo.goals[0]
  const period = statsPeriod('cycle', TODAY, demo.profile.salary)
  const books = {
    home: homeWorkbook(demo, TODAY),
    activity: activityWorkbook(demo, TODAY, { range: cycle }),
    budget: budgetWorkbook(demo, TODAY, null),
    bills: billsWorkbook(demo, TODAY),
    goals: goalsWorkbook(demo, TODAY),
    goal: goalWorkbook(demo, TODAY, goal),
    stats: statsWorkbook(demo, TODAY, period),
    wallets: walletsWorkbook(demo, TODAY, demo.accounts[0].id),
    categories: categoriesWorkbook(demo, TODAY),
    netWorth: netWorthWorkbook(demo, TODAY),
  }

  it('names each file after its page and day', () => {
    expect(books.home.fileName).toBe('till-home-2026-11-04.xlsx')
    expect(books.bills.fileName).toBe('till-bills-2026-11-04.xlsx')
    expect(books.categories.fileName).toBe('till-categories-2026-11-04.xlsx')
    expect(new Set(Object.values(books).map((book) => book.fileName)).size).toBe(Object.keys(books).length)
  })

  it('puts net worth month by month and every value of every asset in its file', () => {
    expect(books.netWorth.fileName).toBe('till-net-worth-2026-11-04.xlsx')
    expect(sheetNamed(books.netWorth, words.sheets.netWorth).rows).toHaveLength(12)
    const values = demo.assets.reduce((count, asset) => count + asset.values.length, 0)
    expect(sheetNamed(books.netWorth, words.sheets.assets).rows).toHaveLength(values)
  })

  it('keeps a slash in a name out of the file name', () => {
    const named = { ...goal, name: 'Car / bike: fund' }
    expect(goalWorkbook(demo, TODAY, named).fileName).toBe('till-goal-Car - bike- fund-2026-11-04.xlsx')
  })

  it('writes a file Excel can read for every page', async () => {
    for (const book of Object.values(books)) {
      expect(book.sheets.length, book.fileName).toBeGreaterThan(0)
      for (const sheet of book.sheets) for (const row of sheet.rows) expect(row.length, `${book.fileName} ${sheet.name}`).toBeLessThanOrEqual(sheet.headers.length)
      const files = await filesOf(book.sheets)
      expect(files['xl/workbook.xml'], book.fileName).toContain(book.sheets[0].name)
    }
  })

  it('exports exactly what Activity lists for its filters, past the 300 the page shows', () => {
    const all = activityWorkbook(demo, TODAY, { kind: 'expense' })
    const expected = filterTransactions(demo.transactions, { kind: 'expense' }, demo)
    expect(expected.length).toBeGreaterThan(300)
    expect(sheetNamed(all, words.sheets.entries).rows).toHaveLength(expected.length)
    expect(valueOf(sheetNamed(all, words.sheets.summary), words.columns.entryCount)).toBe(expected.length)
  })

  it('never counts deleted entries', () => {
    const entries = sheetNamed(activityWorkbook(demo, TODAY, {}), words.sheets.entries)
    expect(entries.rows.some((row) => row[2] === 9_999_999)).toBe(false)
  })

  it('has the budget sheet add up to what is left', () => {
    const summary = sheetNamed(books.budget, words.sheets.summary)
    const breakdown = messages.en.breakdown
    const amounts = summary.rows.map(plainRow).filter((row) => typeof row[1] === 'number' && row[0] !== breakdown.left).map((row) => row[1] as number)
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(valueOf(summary, breakdown.left) as number, 2)
  })

  it('exports the pay cycle chosen on the Budget tab', () => {
    const past = getPayCycle('2026-06-30', demo.profile.salary)
    const summary = sheetNamed(budgetWorkbook(demo, TODAY, past.start), words.sheets.summary)
    expect(valueOf(summary, messages.en.stats.from)).toEqual({ date: past.start })
  })
})

describe('other currencies', () => {
  const base = createInitialData(new Date(`${TODAY}T12:00:00`))
  const main = base.profile.currency
  const usd = { ...base.accounts[0], id: 'wallet-usd', name: 'Dollars', currency: 'USD', startingBalance: 100 }
  const moved: Transaction = { ...STAMP, id: 'move', type: 'transfer', amount: 50, currency: 'USD', toAmount: 12_000, toCurrency: main, date: TODAY, accountId: usd.id, toAccountId: base.accounts[0].id }
  const debtUsd: Debt = { ...STAMP, id: 'd-usd', direction: 'borrowed', person: 'Sam', currency: 'USD', startingAmount: 20, date: TODAY, archived: false }
  const debtMain: Debt = { ...STAMP, id: 'd-main', direction: 'borrowed', person: 'Lina', startingAmount: 5_000, date: TODAY, archived: false }
  const data: AppData = { ...base, accounts: [...base.accounts, usd], transactions: [moved], debts: [debtUsd, debtMain] }
  const words = messages.en.exports

  it('keeps both real amounts of a move and converts nothing', () => {
    const row = plainRow(sheetNamed(activityWorkbook(data, TODAY, { kind: 'transfer' }), words.sheets.entries).rows[0])
    expect(row.slice(2, 4)).toEqual([50, 'USD'])
    expect(row.slice(7, 9)).toEqual([12_000, main])
  })

  it('shows a wallet its own side of a move, signed', () => {
    const fromUsd = plainRow(sheetNamed(walletsWorkbook(data, TODAY, usd.id), words.sheets.entries).rows[0])
    expect(fromUsd.slice(2, 4)).toEqual([-50, 'USD'])
    const intoMain = plainRow(sheetNamed(walletsWorkbook(data, TODAY, base.accounts[0].id), words.sheets.entries).rows[0])
    expect(intoMain.slice(2, 4)).toEqual([12_000, main])
  })

  it('lists totals per currency instead of adding them together', () => {
    const summary = sheetNamed(debtsWorkbook(data, TODAY), words.sheets.summary)
    expect(summary.rows).toEqual([
      [messages.en.debts.iOwe, 5_000, main],
      [messages.en.debts.iOwe, 20, 'USD'],
    ])
  })

  it('gives a debt its own currency and history', () => {
    const book = debtWorkbook(data, TODAY, debtUsd)
    expect(book.fileName).toBe('till-debt-Sam-2026-11-04.xlsx')
    expect(sheetNamed(book, words.sheets.summary).rows.map(plainRow).find((row) => row[0] === words.columns.owed)).toEqual([words.columns.owed, 20, 'USD'])
    expect(plainRow(sheetNamed(book, words.sheets.entries).rows[0]).slice(1, 4)).toEqual([messages.en.debtPage.startedWith, 20, 'USD'])
  })
})

describe('pages with nothing on them', () => {
  const fresh = createInitialData(new Date(`${TODAY}T12:00:00`))

  it('have no sheets, so the button says there is nothing to export', () => {
    expect(billsWorkbook(fresh, TODAY).sheets).toEqual([])
    expect(goalsWorkbook(fresh, TODAY).sheets).toEqual([])
    expect(debtsWorkbook(fresh, TODAY).sheets).toEqual([])
    expect(wishlistWorkbook(fresh, TODAY).sheets).toEqual([])
    expect(activityWorkbook(fresh, TODAY, {}).sheets).toEqual([])
  })
})

describe('Is it worth it?', () => {
  it('exports the price being checked', () => {
    const check = worthItCheck(5_000, undefined, demo, TODAY)
    const book = worthItWorkbook(demo, TODAY, { name: 'Earbuds', price: 5_000 }, check)
    expect(book.sheets).toHaveLength(1)
    expect(book.sheets[0].rows[0]).toEqual([messages.en.worthIt.nameLabel, 'Earbuds'])
    expect(book.sheets[0].rows[1]).toEqual([messages.en.worthIt.priceLabel, 5_000, demo.profile.currency])
  })
})

describe('the look of the file', () => {
  const words = messages.en.exports
  const cycle = getPayCycle(TODAY, demo.profile.salary)
  const book = activityWorkbook(demo, TODAY, { range: cycle })
  const sheetXml = (files: Record<string, string>, name: string) => files[`xl/worksheets/sheet${book.sheets.findIndex((s) => s.name === name) + 1}.xml`]

  it('gives each sheet a colour of its own, on its tab', async () => {
    const files = await filesOf(book.sheets)
    const tabs = book.sheets.map((_, i) => files[`xl/worksheets/sheet${i + 1}.xml`].match(/<tabColor rgb="(\w+)"\/>/)?.[1])
    expect(tabs.every(Boolean)).toBe(true)
    expect(new Set(tabs).size).toBe(tabs.length)
    // Lilac first, the brand's pastel.
    expect(tabs[0]).toBe('FFD698E4')
  })

  it('gives lists frozen column names and filter buttons, and overviews a heading band instead', async () => {
    const files = await filesOf(book.sheets)
    const entries = sheetXml(files, words.sheets.entries)
    expect(entries).toMatch(/<autoFilter ref="A1:O\d+"\/>/)
    expect(entries).toContain('state="frozen"')
    const summary = sheetXml(files, words.sheets.summary)
    expect(summary).not.toContain('<autoFilter')
    expect(summary).not.toContain('state="frozen"')
    expect(summary).toContain('<mergeCell ref="A1:F1"/>')
    expect(files['xl/sharedStrings.xml']).toContain(`${messages.en.appName} · ${messages.en.nav.activity}`)
  })

  it('draws bars inside cells, solid from Excel 2010 on and plain in older readers', async () => {
    const files = await filesOf(book.sheets)
    const stats = sheetXml(files, words.sheets.stats)
    const rules = stats.match(/<cfRule type="dataBar"/g) ?? []
    const ids = [...stats.matchAll(/<x14:id>([^<]+)<\/x14:id>/g)].map((match) => match[1])
    expect(rules.length).toBeGreaterThan(2)
    expect(ids).toHaveLength(rules.length)
    for (const id of ids) expect(stats).toContain(`<x14:cfRule type="dataBar" id="${id}">`)
    // In the order Excel requires: the rows, then the bar rules, then the 2010 settings last.
    expect(stats.indexOf('</sheetData>')).toBeLessThan(stats.indexOf('<conditionalFormatting'))
    expect(stats.trimEnd().endsWith('</extLst></worksheet>')).toBe(true)
  })

  it('shows money in green and a move in grey, as in the app, and a category on its pastel', () => {
    const rows = sheetNamed(activityWorkbook(demo, TODAY, {}), words.sheets.entries).rows
    const types = messages.en.data.csv.types
    const ofType = (type: string) => rows.find((row) => plain(row[1]) === types[type])!
    expect(ofType('income')[2]).toMatchObject({ tone: 'good' })
    expect(ofType('transfer')[2]).toMatchObject({ tone: 'muted' })
    expect(typeof ofType('expense')[2]).toBe('number')
    const groceries = rows.find((row) => plain(row[4]) === 'Groceries')!
    const slot = categorySlot(demo.categories, 'cat-groceries')!
    expect(groceries[4]).toEqual({ value: 'Groceries', fill: CATEGORY_PASTELS[slot - 1] })
  })

  it('shows statuses as coloured labels and how much of a limit is used as a bar', () => {
    const limits = sheetNamed(budgetWorkbook(demo, TODAY, null), words.sheets.limits)
    expect(limits.rows.every((row) => typeof row[5] === 'object' && row[5] !== null && 'badge' in row[5])).toBe(true)
    expect(limits.bars).toEqual([4])
  })
})

describe('the Stats sheet', () => {
  const words = messages.en.exports
  const main = demo.profile.currency
  const cycle = getPayCycle(TODAY, demo.profile.salary)
  const allTime = activityWorkbook(demo, TODAY, {})
  const thisCycle = activityWorkbook(demo, TODAY, { range: cycle })
  const tablesOf = (book: { sheets: Sheet[] }) => {
    const sheet = sheetNamed(book, words.sheets.stats)
    return [sheet, ...(sheet.more ?? [])]
  }
  const table = (book: { sheets: Sheet[] }, title: string) => {
    const found = tablesOf(book).find((t) => t.title === title)
    if (!found) throw new Error(`No table called ${title}`)
    return found
  }

  it('comes right after the summary, under the same kind of heading', () => {
    expect(thisCycle.sheets.map((s) => s.name)).toEqual([words.sheets.summary, words.sheets.stats, words.sheets.entries])
    expect(sheetNamed(thisCycle, words.sheets.stats).heading?.title).toContain(messages.en.nav.activity)
  })

  it('never puts two currencies on one row, and lists the main currency first', () => {
    for (const t of tablesOf(allTime)) {
      expect(t.headers.at(-1), t.title).toBe(words.columns.currency)
      const currencies = t.rows.map((row) => plain(row[t.headers.length - 1]))
      expect(currencies.every((c) => typeof c === 'string' && c.length === 3), t.title).toBe(true)
      expect(currencies[0], t.title).toBe(main)
      // Each currency's rows come together.
      const changes = currencies.filter((c, i) => i > 0 && c !== currencies[i - 1]).length
      expect(changes, t.title).toBe(new Set(currencies).size - 1)
    }
    expect(table(allTime, messages.en.stats.categories.title).rows.some((row) => plain(row[5]) === 'USD')).toBe(true)
  })

  it('splits spending by category to the summary total, in each currency apart', () => {
    const summary = sheetNamed(allTime, words.sheets.summary).rows.map(plainRow)
    const categories = table(allTime, messages.en.stats.categories.title).rows.map(plainRow)
    for (const currency of [main, 'USD']) {
      const rows = categories.filter((row) => row[5] === currency)
      const spent = summary.find((row) => row[0] === words.columns.spent && row[2] === currency)![1] as number
      expect(rows.reduce((sum, row) => sum + (row[1] as number), 0)).toBeCloseTo(spent, 2)
      expect(rows.reduce((sum, row) => sum + (row[2] as { percent: number }).percent, 0)).toBeCloseTo(1, 6)
    }
  })

  it('goes day by day through a pay cycle up to today, and month by month for all time', () => {
    const days = table(thisCycle, messages.en.stats.heatmap.title).rows.filter((row) => plain(row[4]) === main)
    expect(days[0][0]).toEqual({ date: cycle.start })
    expect(days.at(-1)![0]).toEqual({ date: TODAY < cycle.end ? TODAY : cycle.end })
    expect(new Set(days.map((row) => JSON.stringify(row[0]))).size).toBe(days.length)
    const months = table(allTime, words.titles.byMonth)
      .rows.filter((row) => plain(row[4]) === main)
      .map((row) => (row[0] as { month: string }).month)
    expect(months.length).toBeGreaterThan(3)
    months.slice(1).forEach((month, i) => expect(month > months[i]).toBe(true))
    expect(months.every((month) => month.endsWith('-01'))).toBe(true)
  })

  it('starts the week on the language’s first day, with shares that add up', () => {
    const rows = table(allTime, words.titles.byWeekday).rows.filter((row) => plain(row[4]) === main)
    expect(rows).toHaveLength(7)
    expect(rows[0][0]).toBe(messages.en.format.weekdays[messages.en.format.weekStartsOn])
    expect(rows.reduce((sum, row) => sum + (plain(row[2]) as { percent: number }).percent, 0)).toBeCloseTo(1, 6)
  })

  it('lists the ten biggest expenses of each currency, biggest first', () => {
    const rows = table(allTime, words.titles.biggest).rows.map(plainRow)
    const dinars = rows.filter((row) => row[4] === main).map((row) => row[3] as number)
    expect(dinars).toHaveLength(10)
    expect([...dinars].sort((a, b) => b - a)).toEqual(dinars)
    const biggest = Math.max(...demo.transactions.filter((tx) => !tx.deleted && tx.type === 'expense' && (tx.currency ?? main) === main).map((tx) => tx.amount))
    expect(dinars[0]).toBe(biggest)
  })

  it('totals each tag, and lists only what is bought more than once', () => {
    const trip = table(allTime, messages.en.tags.title).rows.map(plainRow).find((row) => row[0] === 'Trip to Oran')!
    const tagged = demo.transactions.filter((tx) => !tx.deleted && tx.tags?.includes('Trip to Oran'))
    expect(trip[1]).toBeCloseTo(tagged.reduce((sum, tx) => sum + tx.amount, 0), 2)
    expect(trip[3]).toBe(tagged.length)
    const bought = table(allTime, messages.en.insights.top.title).rows.map(plainRow)
    expect(bought.length).toBeGreaterThan(0)
    expect(bought.every((row) => (row[2] as number) > 1)).toBe(true)
  })

  it('compares wallets only when there is more than one', () => {
    expect(tablesOf(allTime).some((t) => t.title === messages.en.insights.wallets.title)).toBe(true)
    const oneWallet = walletsWorkbook(demo, TODAY, demo.accounts[0].id)
    expect(tablesOf(oneWallet).some((t) => t.title === messages.en.insights.wallets.title)).toBe(false)
  })

  it('leaves where the money went to its own sheet in the Stats file', () => {
    const book = statsWorkbook(demo, TODAY, statsPeriod('cycle', TODAY, demo.profile.salary))
    expect(book.sheets.map((s) => s.name).slice(0, 3)).toEqual([words.sheets.summary, words.sheets.stats, words.sheets.categories])
    expect(tablesOf(book).some((t) => t.title === messages.en.stats.categories.title)).toBe(false)
  })
})

describe('bars, Arabic and long notes', () => {
  const words = messages.en.exports
  const sheet: Sheet = {
    name: 'Stats',
    heading: { title: 'Till · Activity', subtitle: '25 Oct 2026' },
    headers: ['Month', 'Spent', 'Note', 'Currency'],
    rows: [
      [{ month: '2026-10-01' }, 90_000, 'Rent', 'DZD'],
      [{ month: '2026-11-01' }, 2_000, 'Bread\nMilk', 'DZD'],
      [{ month: '2026-10-01' }, 15.99, null, 'USD'],
    ],
    bars: [1],
    scaleBy: 3,
  }
  const xmlOf = async (rightToLeft: boolean) => (await filesOf([sheet], rightToLeft))['xl/worksheets/sheet1.xml']

  it('measures each currency’s amounts on a scale of its own', async () => {
    const xml = await xmlOf(false)
    // The heading band and a blank row come first, then the column names: the rows are 5 to 7.
    expect([...xml.matchAll(/<conditionalFormatting sqref="([^"]+)"/g)].map((match) => match[1])).toEqual(['B5:B6', 'B7:B7'])
  })

  it('reads right to left in Arabic: titles from the right, and a bar’s numbers clear of it', async () => {
    const files = await filesOf([sheet], true)
    expect(files['xl/sharedStrings.xml']).toContain('\u200fTill · Activity')
    expect(files['xl/sharedStrings.xml']).toContain('\u200f25 Oct 2026')
    // The data itself is left as it was.
    expect(files['xl/sharedStrings.xml']).toContain('<t>Rent</t>')
    expect(files['xl/styles.xml']).toContain('horizontal="left"')
    const english = await filesOf([sheet], false)
    expect(english['xl/sharedStrings.xml']).not.toContain('\u200f')
    expect(english['xl/styles.xml']).not.toContain('horizontal="left"')
  })

  it('shows a note on several lines, its row growing to fit', async () => {
    const files = await filesOf([sheet])
    expect(files['xl/styles.xml']).toContain('wrapText="1"')
    const rows = [...files['xl/worksheets/sheet1.xml'].matchAll(/<row r="(\d+)"([^>]*)>/g)]
    const noteRow = rows.find((match) => match[1] === '6')!
    expect(noteRow[2]).not.toContain('ht=')
    expect(rows.find((match) => match[1] === '5')![2]).toContain('ht="18"')
  })

  it('names a bill paid without a note after the bill', () => {
    const book = homeWorkbook(demo, TODAY)
    const stats = sheetNamed(book, words.sheets.stats)
    const biggest = [stats, ...(stats.more ?? [])].find((t) => t.title === words.titles.biggest)!
    const rent = demo.bills.find((bill) => bill.name === 'Rent')!
    const row = biggest.rows.map(plainRow).find((r) => r[3] === rent.amount)!
    expect(row[0]).toBe('Rent')
  })
})

describe('Excel charts', () => {
  const words = messages.en.exports
  const cycle = getPayCycle(TODAY, demo.profile.salary)
  const book = activityWorkbook(demo, TODAY, { range: cycle })
  const statsIndex = book.sheets.findIndex((s) => s.name === words.sheets.stats) + 1
  const chartFiles = (files: Record<string, string>) => Object.keys(files).filter((path) => path.startsWith('xl/charts/'))

  it('puts each chart in the file, on its sheet’s drawing, with its content type', async () => {
    const files = await filesOf(book.sheets)
    const charts = chartFiles(files)
    expect(charts).toHaveLength(3)
    for (const path of charts) expect(files['[Content_Types].xml']).toContain(`PartName="/${path}"`)
    const drawing = files[`xl/drawings/drawing${statsIndex}.xml`]
    expect(drawing.match(/<xdr:graphicFrame/g)).toHaveLength(3)
    const rels = files[`xl/drawings/_rels/drawing${statsIndex}.xml.rels`]
    for (const path of charts) expect(rels).toContain(`Target="../charts/${path.slice('xl/charts/'.length)}"`)
    expect(files[`xl/worksheets/sheet${statsIndex}.xml`]).toMatch(/<drawing r:id="[^"]+"\/>/)
    // Sheets without a chart keep no drawing.
    expect(files['xl/drawings/drawing1.xml']).toBeUndefined()
  })

  it('reads the main currency’s rows of its table, so it changes with them', async () => {
    const files = await filesOf(book.sheets)
    const doughnut = Object.entries(files).find(([path, xml]) => path.startsWith('xl/charts/') && xml.includes('<c:doughnutChart>'))![1]
    expect(doughnut).toContain(`<a:t>${messages.en.stats.categories.title} · ${demo.profile.currency}</a:t>`)
    expect(doughnut).toMatch(/<c:f>'Stats'!\$A\$\d+:\$A\$\d+<\/c:f>/)
    expect(doughnut).toMatch(/<c:f>'Stats'!\$B\$\d+:\$B\$\d+<\/c:f>/)
    // Each slice on its category's pastel.
    const stats = sheetNamed(book, words.sheets.stats)
    const first = plain(stats.rows[0][0])
    const fill = (stats.rows[0][0] as { fill: string }).fill
    expect(doughnut).toContain(`<c:pt idx="0"><c:v>${first}</c:v></c:pt>`)
    expect(doughnut).toContain(`<c:dPt><c:idx val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${fill.slice(1).toUpperCase()}"/>`)
  })

  it('draws income as a plum line over spending month by month, as on Stats', async () => {
    const files = await filesOf(activityWorkbook(demo, TODAY, {}).sheets)
    const months = Object.values(files).find((xml) => xml.includes(`<a:t>${words.titles.byMonth} · ${demo.profile.currency}</a:t>`))!
    expect(months).toContain('<c:barChart>')
    expect(months).toContain('<c:lineChart>')
    expect(months.slice(months.indexOf('<c:lineChart>'))).toContain(`<a:srgbClr val="${INCOME_COLOR.slice(1).toUpperCase()}"/>`)
    // Months name the points one by one, not as a timeline.
    expect(months).toContain('<c:auto val="0"/>')
    expect(months).toContain('formatCode="mmm yy"')
  })

  it('charts lists beside them: budget, net worth, categories and pay cycles', async () => {
    for (const [workbook, count] of [
      [budgetWorkbook(demo, TODAY, null), 1],
      [netWorthWorkbook(demo, TODAY), 1],
      [statsWorkbook(demo, TODAY, statsPeriod('year', TODAY, demo.profile.salary)), 4],
    ] as const) {
      expect(chartFiles(await filesOf(workbook.sheets)), workbook.fileName).toHaveLength(count)
    }
  })

  it('quotes a sheet name with an apostrophe, and draws nothing for a single point or only zeros', async () => {
    const chart = { kind: 'column' as const, labels: 0, series: [{ column: 1 }] }
    const named = (name: string, rows: Cell[][]): Sheet => ({ name, headers: ['Day', 'Spent'], rows, chart })
    const files = await filesOf([named("Sam's", [['Mon', 5], ['Tue', 7]]), named('One', [['Mon', 5]]), named('Zeros', [['Mon', 0], ['Tue', 0]])])
    expect(chartFiles(files)).toHaveLength(1)
    expect(Object.values(files).some((xml) => xml.includes("<c:f>'Sam''s'!$B$2:$B$3</c:f>"))).toBe(true)
  })

  it('keeps each chart on the Stats sheet clear of the next table', async () => {
    const files = await filesOf(book.sheets)
    const anchors = [...files[`xl/drawings/drawing${statsIndex}.xml`].matchAll(/<xdr:row>(\d+)<\/xdr:row>/g)].map((match) => Number(match[1]))
    // Each row's height in points, from the sheet: 15 when it has none of its own.
    const heights = new Map([...files[`xl/worksheets/sheet${statsIndex}.xml`].matchAll(/<row r="(\d+)"[^>]*?(?: ht="([\d.]+)")?[^>]*>/g)].map((match) => [Number(match[1]) - 1, Number(match[2] ?? 15)]))
    const pixels = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => ((heights.get(from + i) ?? 15) * 4) / 3).reduce((sum, px) => sum + px, 0)
    expect(anchors.length).toBe(3)
    // The rows from one chart to the next are at least as tall as the chart, 300 pixels.
    anchors.slice(1).forEach((row, i) => expect(pixels(anchors[i], row)).toBeGreaterThanOrEqual(300))
  })
})
