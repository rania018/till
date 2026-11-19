import { messages } from '../i18n'
import type { Account, Category, ID, ISODate, Transaction } from '../types'
import { toLatinDigits } from './amountText'
import { live } from './id'
import { roundMoney } from './money'

/**
 * Importing entries from a spreadsheet saved as CSV, so moving to the app doesn't mean starting from
 * zero. Only spending, money back and income come in: transfers, goals and debts change balances
 * the app keeps itself, so they're left out and the preview says so. The file's own export is read
 * back the same way, in any of the app's languages.
 */

export const MAX_ROWS = 20_000

// ---------------------------------------------------------------------------------------------
// Reading the file

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const body = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

/** Comma, semicolon (French Excel) or tab: whichever splits the first lines most evenly. */
export function detectDelimiter(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(0, 10)
  let best = ','
  let bestScore = 0
  for (const delimiter of [',', ';', '\t']) {
    const counts = lines.map((line) => line.replace(/"[^"]*"/g, '').split(delimiter).length - 1)
    if (counts.length === 0 || counts[0] === 0) continue
    const even = counts.filter((n) => n === counts[0]).length
    const score = even * 100 + counts[0]
    if (score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

// ---------------------------------------------------------------------------------------------
// Columns

export const FIELDS = ['date', 'amount', 'out', 'in', 'type', 'category', 'note', 'wallet'] as const
export type Field = (typeof FIELDS)[number]
/** For each field, the index of the file's column, or `null` when the file has none. */
export type Mapping = Record<Field, number | null>

const fold = (text: string) =>
  text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const ownWords = (pick: (csv: (typeof messages)['en']['data']['csv']) => string) => Object.values(messages).map((m) => pick(m.data.csv))

/** Header names a column might go by, in the app's languages and the usual bank and spreadsheet ones. */
const HEADER_WORDS: Record<Field, string[]> = {
  date: ['date', 'day', 'jour', 'transaction date', 'date operation', 'date de l operation', 'التاريخ', 'تاريخ', ...ownWords((c) => c.date)],
  amount: ['amount', 'montant', 'sum', 'somme', 'value', 'valeur', 'price', 'prix', 'total', 'المبلغ', 'مبلغ', ...ownWords((c) => c.amount)],
  out: ['debit', 'out', 'money out', 'spent', 'expense', 'expenses', 'withdrawal', 'sortie', 'depense', 'depenses', 'retrait', 'paid out', 'مدين', 'مصروف'],
  in: ['credit', 'in', 'money in', 'received', 'income', 'deposit', 'entree', 'recette', 'recu', 'versement', 'دائن', 'دخل'],
  type: ['type', 'kind', 'nature', 'النوع', ...ownWords((c) => c.type)],
  category: ['category', 'categorie', 'rubrique', 'الفئة', 'فئة', ...ownWords((c) => c.category)],
  note: ['note', 'notes', 'description', 'libelle', 'label', 'memo', 'details', 'detail', 'name', 'nom', 'item', 'payee', 'beneficiaire', 'ملاحظة', 'الوصف', ...ownWords((c) => c.note)],
  wallet: ['wallet', 'account', 'compte', 'portefeuille', 'المحفظة', 'الحساب', ...ownWords((c) => c.wallet)],
}

/** Whether the first row names the columns rather than being an entry. */
export function looksLikeHeader(row: string[]): boolean {
  return row.some((cell) => FIELDS.some((field) => HEADER_WORDS[field].some((word) => fold(word) === fold(cell)))) && !row.some((cell) => parseDate(cell, 'ymd') || parseDate(cell, 'dmy'))
}

/** The best guess at which column is which, from the header names. Each column is used once. */
export function guessMapping(header: string[] | null): Mapping {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping
  if (!header) return mapping
  const taken = new Set<number>()
  for (const field of FIELDS) {
    const words = new Set(HEADER_WORDS[field].map(fold))
    const index = header.findIndex((cell, i) => !taken.has(i) && words.has(fold(cell)))
    if (index !== -1) {
      mapping[field] = index
      taken.add(index)
    }
  }
  return mapping
}

// ---------------------------------------------------------------------------------------------
// Values

export type DateFormat = 'ymd' | 'dmy' | 'mdy'

/** A date in the file as `YYYY-MM-DD`, or `null` if it isn't one in this format. A time after it is ignored. */
export function parseDate(value: string, format: DateFormat): ISODate | null {
  const parts = toLatinDigits(value).trim().split(/[ T]/)[0].split(/[-/.]/)
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null
  const [a, b, c] = parts.map(Number)
  let year: number, month: number, day: number
  if (parts[0].length === 4) [year, month, day] = [a, b, c]
  else if (parts[2].length === 4 || parts[2].length === 2) {
    const y = parts[2].length === 2 ? 2000 + c : c
    ;[year, month, day] = format === 'mdy' ? [y, a, b] : [y, b, a]
  } else return null
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Day first unless only month first reads every date. Dates written year first are the same either way. */
export function detectDateFormat(values: string[]): DateFormat {
  // Only cells that read as a date one way or another: a stray "someday" says nothing about the format.
  const filled = values.filter((v) => parseDate(v, 'dmy') || parseDate(v, 'mdy')).slice(0, 500)
  if (filled.length > 0 && filled.every((v) => /^\s*\d{4}[-/.]/.test(toLatinDigits(v)))) return 'ymd'
  const reads = (format: DateFormat) => filled.filter((v) => parseDate(v, format) !== null).length
  return reads('mdy') > reads('dmy') ? 'mdy' : 'dmy'
}

/**
 * An amount as written in a spreadsheet: `1,250.50`, `1 250,50`, `-250`, `(250)`, `250 DA`. With one
 * kind of separator, exactly three digits after it make it a thousands separator.
 */
export function parseAmount(value: string): number | null {
  let text = toLatinDigits(value).replace(/[\u00a0\u202f\s']/g, '')
  if (!text) return null
  const negative = /^\(.*\)$/.test(text) || /^[-−]/.test(text) || /[-−]$/.test(text)
  text = text.replace(/[^\d.,]/g, '')
  if (!/\d/.test(text)) return null
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  let decimal: string | null = null
  if (lastDot !== -1 && lastComma !== -1) decimal = lastDot > lastComma ? '.' : ','
  else if (lastDot !== -1 || lastComma !== -1) {
    const mark = lastDot !== -1 ? '.' : ','
    const after = text.length - text.lastIndexOf(mark) - 1
    const several = text.split(mark).length > 2
    decimal = after === 3 || several ? null : mark
  }
  const [whole, cents = ''] = decimal ? [text.slice(0, text.lastIndexOf(decimal)), text.slice(text.lastIndexOf(decimal) + 1)] : [text, '']
  const number = Number(`${whole.replace(/[.,]/g, '') || '0'}.${cents || '0'}`)
  if (!Number.isFinite(number)) return null
  return roundMoney(negative ? -number : number)
}

type Kind = 'expense' | 'income' | 'refund' | 'other'

const TYPE_WORDS: Record<Exclude<Kind, 'other'>, string[]> = {
  expense: ['expense', 'expenses', 'spending', 'spent', 'debit', 'out', 'payment', 'purchase', 'depense', 'depenses', 'sortie', 'achat', 'paiement', 'مصروف', 'مصاريف', 'إنفاق', 'شراء', ...Object.values(messages).map((m) => m.data.csv.types.expense)],
  income: ['income', 'credit', 'in', 'salary', 'revenu', 'revenus', 'recette', 'entree', 'salaire', 'دخل', 'راتب', ...Object.values(messages).map((m) => m.data.csv.types.income)],
  refund: ['refund', 'remboursement', 'rembourse', 'استرداد', ...Object.values(messages).map((m) => m.data.csv.types.refund)],
}

/** What a type cell says: spending, income, money back, or something else that isn't imported. */
export function kindOf(value: string): Kind | null {
  const word = fold(value)
  if (!word) return null
  for (const kind of ['refund', 'expense', 'income'] as const) if (TYPE_WORDS[kind].some((w) => fold(w) === word)) return kind
  return 'other'
}

// ---------------------------------------------------------------------------------------------
// Rows

export interface ImportOptions {
  mapping: Mapping
  dateFormat: DateFormat
  /** With one signed amount column and no type: which way a positive amount goes. */
  positiveIs: 'expense' | 'income'
  /** Where entries go when the file names no wallet, or one the app doesn't have. */
  accountId: ID
  /** The file's category names, folded, to a category of the right kind. Unlisted names use the fallback. */
  categories: Record<string, ID>
  skipDuplicates: boolean
}

export type SkipReason = 'date' | 'amount' | 'kind' | 'duplicate'

export interface ImportRow {
  /** The line in the file, counting from 1. */
  line: number
  entry?: Pick<Transaction, 'type' | 'amount' | 'date' | 'accountId' | 'categoryId' | 'note'>
  skipped?: SkipReason
  /** The category name in the file, if any. */
  categoryName?: string
}

export interface ImportData {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}

const FALLBACK: Record<'expense' | 'income', ID> = { expense: 'cat-other', income: 'inc-other' }

/** The file's distinct category names, with the app's category of the same name and kind if there is one. */
export function categoryNames(rows: string[][], mapping: Mapping, data: Pick<ImportData, 'categories'>): { name: string; key: string; count: number; match?: ID }[] {
  if (mapping.category === null) return []
  const names = new Map<string, { name: string; count: number }>()
  for (const row of rows) {
    const name = row[mapping.category]?.trim()
    if (!name) continue
    const key = fold(name)
    const seen = names.get(key)
    names.set(key, { name: seen?.name ?? name, count: (seen?.count ?? 0) + 1 })
  }
  const categories = live(data.categories).filter((c) => !c.archived && !c.system)
  return [...names]
    .map(([key, { name, count }]) => ({ name, key, count, match: categories.find((c) => fold(c.name) === key)?.id }))
    .sort((a, b) => b.count - a.count)
}

/** Every row of the file, as an entry to add or with the reason it's left out. `rows` has no header. */
export function buildImport(rows: string[][], options: ImportOptions, data: ImportData, firstLine = 1): ImportRow[] {
  const { mapping } = options
  const cell = (row: string[], field: Field) => (mapping[field] === null ? '' : (row[mapping[field]!] ?? ''))
  const categories = live(data.categories)
  const kindOfCategory = (id: ID | undefined) => categories.find((c) => c.id === id)?.kind
  const wallets = live(data.accounts).filter((a) => !a.archived)
  const existing = new Set(live(data.transactions).map((t) => duplicateKey(t)))

  return rows.slice(0, MAX_ROWS).map((row, i): ImportRow => {
    const line = firstLine + i
    const date = parseDate(cell(row, 'date'), options.dateFormat)
    if (!date) return { line, skipped: 'date' }

    let amount: number | null = null
    let kind: Kind | null = mapping.type !== null ? kindOf(cell(row, 'type')) : null
    if (mapping.amount !== null) {
      const signed = parseAmount(cell(row, 'amount'))
      if (signed !== null) {
        amount = Math.abs(signed)
        if (!kind) kind = (signed < 0) === (options.positiveIs === 'income') ? 'expense' : 'income'
      }
    } else {
      const out = parseAmount(cell(row, 'out'))
      const into = parseAmount(cell(row, 'in'))
      if (out) {
        amount = Math.abs(out)
        kind ??= 'expense'
      } else if (into) {
        amount = Math.abs(into)
        kind ??= 'income'
      }
    }
    if (!amount) return { line, skipped: 'amount' }
    if (!kind || kind === 'other') return { line, skipped: 'kind' }

    const categoryName = cell(row, 'category').trim() || undefined
    const side = kind === 'income' ? 'income' : 'expense'
    const chosen = categoryName ? options.categories[fold(categoryName)] : undefined
    const categoryId = chosen && kindOfCategory(chosen) === side ? chosen : FALLBACK[side]
    const walletName = fold(cell(row, 'wallet'))
    const accountId = (walletName && wallets.find((w) => fold(w.name) === walletName)?.id) || options.accountId
    const note = cell(row, 'note').replace(/\s+/g, ' ').trim() || undefined
    const entry = { type: kind, amount, date, accountId, categoryId, note }

    if (options.skipDuplicates) {
      const key = duplicateKey(entry)
      // Only against what's already in the app: the same line twice in a file is two coffees on one day.
      if (existing.has(key)) return { line, skipped: 'duplicate', entry, categoryName }
    }
    return { line, entry, categoryName }
  })
}

/** Entries count as the same when the day, kind, amount and note match. */
function duplicateKey(t: Pick<Transaction, 'type' | 'amount' | 'date' | 'note'>): string {
  return [t.date, t.type, roundMoney(t.amount), fold(t.note ?? '')].join('|')
}

export interface ImportTotals {
  count: number
  spent: number
  received: number
  first?: ISODate
  last?: ISODate
  skipped: Record<SkipReason, number>
}

export function importTotals(rows: ImportRow[]): ImportTotals {
  const totals: ImportTotals = { count: 0, spent: 0, received: 0, skipped: { date: 0, amount: 0, kind: 0, duplicate: 0 } }
  for (const row of rows) {
    if (row.skipped) {
      totals.skipped[row.skipped]++
      continue
    }
    const entry = row.entry!
    totals.count++
    if (entry.type === 'income') totals.received += entry.amount
    else totals.spent += entry.type === 'refund' ? -entry.amount : entry.amount
    if (!totals.first || entry.date < totals.first) totals.first = entry.date
    if (!totals.last || entry.date > totals.last) totals.last = entry.date
  }
  totals.spent = roundMoney(totals.spent)
  totals.received = roundMoney(totals.received)
  return totals
}

/** Mostly negative amounts are a bank's way: money out is negative, so a positive amount is income. */
export function guessPositiveIs(values: string[]): 'expense' | 'income' {
  const amounts = values.map(parseAmount).filter((n): n is number => n !== null && n !== 0)
  return amounts.filter((n) => n < 0).length > amounts.length / 2 ? 'income' : 'expense'
}
