import clsx from 'clsx'
import { FileUp } from 'lucide-react'
import { useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { toast } from '../../components/ui/toastStore'
import { Toggle } from '../../components/ui/Toggle'
import { t } from '../../i18n'
import { buildImport, categoryNames, detectDateFormat, guessMapping, guessPositiveIs, importTotals, looksLikeHeader, MAX_ROWS, parseCsv, parseDate, type DateFormat, type Field as ImportField, type Mapping } from '../../lib/csvImport'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import type { ID } from '../../types'

const MAX_BYTES = 5 * 1024 * 1024
const PREVIEW_ROWS = 8

/** Text from the file: UTF-8, or the Windows encoding Excel often saves CSV in, so accents survive. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const columnLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`)

/** Entries from a spreadsheet saved as CSV: match its columns, look at what comes in, then import with Undo. */
export function ImportPage() {
  const id = useId()
  const navigate = useNavigate()
  const copy = t.importCsv
  const data = useAppStore(useShallow((s) => ({ accounts: s.accounts, categories: s.categories, transactions: s.transactions, currency: s.profile.currency })))
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [table, setTable] = useState<string[][] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [split, setSplit] = useState(false)
  const [dateFormat, setDateFormat] = useState<DateFormat>('dmy')
  const [positiveIs, setPositiveIs] = useState<'expense' | 'income'>('expense')
  const wallets = live(data.accounts).filter((a) => !a.archived)
  const [accountId, setAccountId] = useState<ID>(wallets[0]?.id ?? '')
  const [chosen, setChosen] = useState<Record<string, ID>>({})
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) return setError(copy.tooBig)
    const rows = parseCsv(await readText(file))
    if (rows.length === 0 || rows.every((r) => r.length < 2)) return setError(copy.unreadable)
    const header = looksLikeHeader(rows[0])
    const guessed = guessMapping(header ? rows[0] : null)
    // Without names, the first column that reads as dates is the date.
    if (guessed.date === null) guessed.date = rows[header ? 1 : 0]?.findIndex((cell) => parseDate(cell, 'dmy') || parseDate(cell, 'mdy')) ?? null
    if (guessed.date === -1) guessed.date = null
    const body = header ? rows.slice(1) : rows
    setError(null)
    setFileName(file.name)
    setTable(rows)
    setHasHeader(header)
    setMapping(guessed)
    setSplit(guessed.amount === null && (guessed.out !== null || guessed.in !== null))
    setDateFormat(detectDateFormat(guessed.date === null ? [] : body.map((r) => r[guessed.date!] ?? '')))
    setPositiveIs(guessed.amount === null ? 'expense' : guessPositiveIs(body.map((r) => r[guessed.amount!] ?? '')))
    setChosen({})
  }

  const header = table && hasHeader ? table[0] : null
  const body = useMemo(() => (table ? (hasHeader ? table.slice(1) : table) : []), [table, hasHeader])
  const columns = useMemo(() => {
    const width = Math.max(0, ...(table ?? []).map((r) => r.length))
    return Array.from({ length: width }, (_, i) => {
      const example = body.find((r) => r[i])?.[i] ?? ''
      return { index: i, label: header?.[i] ? `${columnLetter(i)} · ${header[i]}` : copy.column(columnLetter(i)), example }
    })
  }, [table, header, body, copy])
  const effective = useMemo<Mapping | null>(() => (mapping ? { ...mapping, ...(split ? { amount: null } : { out: null, in: null }) } : null), [mapping, split])
  const names = useMemo(() => (effective ? categoryNames(body, effective, data) : []), [body, effective, data])
  const categoryChoice = useMemo(() => Object.fromEntries(names.map((n) => [n.key, chosen[n.key] ?? n.match ?? ''] as const).filter(([, v]) => v)), [names, chosen])
  const rows = useMemo(
    () => (effective && effective.date !== null ? buildImport(body, { mapping: effective, dateFormat, positiveIs, accountId, categories: categoryChoice, skipDuplicates }, data, hasHeader ? 2 : 1) : []),
    [effective, body, dateFormat, positiveIs, accountId, categoryChoice, skipDuplicates, data, hasHeader],
  )
  const totals = useMemo(() => importTotals(rows), [rows])
  const currencyOf = (walletId: ID) => data.accounts.find((a) => a.id === walletId)?.currency ?? data.currency
  // Totals only within one currency: entries going to wallets in different currencies aren't added up.
  const currencies = new Set(rows.filter((r) => r.entry && !r.skipped).map((r) => currencyOf(r.entry!.accountId)))
  const oneCurrency = currencies.size === 1 ? [...currencies][0] : null
  const money = (amount: number) => formatMoney(amount, oneCurrency ?? data.currency)
  const categories = live(data.categories).filter((c) => !c.archived && !c.system)
  const nameOf = (catId?: ID) => data.categories.find((c) => c.id === catId)?.name ?? ''
  const walletStart = wallets.find((w) => w.id === accountId)?.startDate
  const before = walletStart && totals.first && totals.first < walletStart

  const setField = (field: ImportField, value: string) => setMapping((m) => (m ? { ...m, [field]: value === '' ? null : Number(value) } : m))
  const columnSelect = (field: ImportField, label: string, hint?: string) => (
    <Field label={label} htmlFor={`${id}-${field}`} hint={hint}>
      <Select id={`${id}-${field}`} value={effective?.[field] ?? ''} onChange={(e) => setField(field, e.target.value)}>
        <option value="">{copy.notInFile}</option>
        {columns.map((c) => (
          <option key={c.index} value={c.index}>
            {c.example ? `${c.label} (${c.example.slice(0, 24)})` : c.label}
          </option>
        ))}
      </Select>
    </Field>
  )

  function runImport() {
    const entries = rows.filter((r) => r.entry && !r.skipped).map((r) => r.entry!)
    try {
      const { count, undo } = appStore.getState().importTransactions(entries)
      toast(copy.done(count), { tone: 'good', action: { label: t.common.undo, onClick: undo } })
      navigate('/activity/list')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const skippedLines = (Object.entries(totals.skipped) as [keyof typeof totals.skipped, number][]).filter(([, n]) => n > 0)
  const sample = rows.filter((r) => r.entry && !r.skipped).slice(0, PREVIEW_ROWS)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={copy.title} backTo="/settings/privacy" showSettings={false} />
      <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={(e) => void pick(e)} className="hidden" tabIndex={-1} aria-hidden />

      <Card className="mb-4">
        <p className="text-[0.9375rem] text-ink-2">{copy.intro}</p>
        <p className="mt-2 text-sm text-muted">{copy.howToCsv}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button icon={FileUp} variant={table ? 'secondary' : 'primary'} onClick={() => fileInput.current?.click()}>
            {table ? copy.otherFile : copy.pick}
          </Button>
          {fileName && <span className="min-w-0 truncate text-sm font-semibold text-ink-2">{copy.fileLine(fileName, body.length)}</span>}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-crit-ink">
            {error}
          </p>
        )}
        {body.length > MAX_ROWS && <p className="mt-3 text-sm font-semibold text-warn-ink">{copy.tooManyRows(MAX_ROWS)}</p>}
      </Card>

      {table && effective && (
        <>
          <section className="mb-4">
            <h2 className="mb-2 px-1 text-sm font-extrabold">{copy.columnsTitle}</h2>
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 text-sm font-bold">{copy.hasHeader}</p>
                <Toggle checked={hasHeader} onChange={setHasHeader} label={copy.hasHeader} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {columnSelect('date', copy.fields.date)}
                <Field label={copy.dateFormat} htmlFor={`${id}-format`}>
                  <Select id={`${id}-format`} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                    <option value="dmy">{copy.formats.dmy}</option>
                    <option value="mdy">{copy.formats.mdy}</option>
                    <option value="ymd">{copy.formats.ymd}</option>
                  </Select>
                </Field>
              </div>
              <Field label={copy.amountStyle}>
                <SegmentedControl
                  label={copy.amountStyle}
                  value={split ? 'split' : 'one'}
                  onChange={(value) => setSplit(value === 'split')}
                  options={[
                    { value: 'one', label: copy.oneColumn },
                    { value: 'split', label: copy.twoColumns },
                  ]}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {split ? (
                  <>
                    {columnSelect('out', copy.fields.out)}
                    {columnSelect('in', copy.fields.in)}
                  </>
                ) : (
                  <>
                    {columnSelect('amount', copy.fields.amount)}
                    {effective.type === null && (
                      <Field label={copy.positiveIs}>
                        <SegmentedControl
                          label={copy.positiveIs}
                          value={positiveIs}
                          onChange={setPositiveIs}
                          options={[
                            { value: 'expense', label: copy.spending },
                            { value: 'income', label: copy.income },
                          ]}
                        />
                      </Field>
                    )}
                  </>
                )}
                {columnSelect('type', copy.fields.type, copy.typeHint)}
                {columnSelect('note', copy.fields.note)}
                {columnSelect('category', copy.fields.category)}
                {columnSelect('wallet', copy.fields.wallet, copy.walletColumnHint)}
                <Field label={copy.wallet} htmlFor={`${id}-wallet`} hint={copy.walletHint}>
                  <Select id={`${id}-wallet`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>
          </section>

          {names.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 px-1 text-sm font-extrabold">{copy.categoriesTitle}</h2>
              <Card>
                <p className="mb-3 text-sm text-muted">{copy.categoriesHint}</p>
                <ul className="divide-y divide-line">
                  {names.map((n) => (
                    <li key={n.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="block truncate font-bold">{n.name}</span>
                        <span className="block text-xs text-muted">{copy.rows(n.count)}</span>
                      </span>
                      <div className="w-full sm:w-60">
                        <Select aria-label={copy.categoryFor(n.name)} value={chosen[n.key] ?? n.match ?? ''} onChange={(e) => setChosen((c) => ({ ...c, [n.key]: e.target.value }))}>
                          <option value="">{copy.otherCategory}</option>
                          <optgroup label={copy.spending}>
                            {categories.filter((c) => c.kind === 'expense').map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={copy.income}>
                            {categories.filter((c) => c.kind === 'income').map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        </Select>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section className="mb-6">
            <h2 className="mb-2 px-1 text-sm font-extrabold">{copy.previewTitle}</h2>
            <Card>
              {effective.date === null ? (
                <p className="text-sm font-semibold text-warn-ink">{copy.needDate}</p>
              ) : (
                <>
                  <p className="text-lg font-extrabold">{copy.willImport(totals.count)}</p>
                  {totals.count > 0 && (
                    <p className="text-sm text-ink-2">
                      {t.format.range(totals.first!, totals.last!)}
                      {oneCurrency && ` · ${copy.totals(money(totals.spent), money(totals.received))}`}
                    </p>
                  )}
                  {skippedLines.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-sm text-muted">
                      {skippedLines.map(([reason, n]) => (
                        <li key={reason}>{copy.skipped[reason](n)}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex items-center gap-3">
                    <p className="min-w-0 flex-1 text-sm font-bold">{copy.skipDuplicates}</p>
                    <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} label={copy.skipDuplicates} />
                  </div>
                  {before && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">{copy.beforeStart(t.format.date(walletStart!))}</p>}

                  {sample.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">{copy.previewTitle}</caption>
                        <thead>
                          <tr className="text-xs text-muted">
                            <th scope="col" className="pb-1.5 text-start font-bold">{copy.fields.date}</th>
                            <th scope="col" className="pb-1.5 text-start font-bold">{copy.fields.note}</th>
                            <th scope="col" className="hidden pb-1.5 text-start font-bold sm:table-cell">{copy.fields.category}</th>
                            <th scope="col" className="pb-1.5 text-end font-bold">{copy.fields.amount}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {sample.map((r) => {
                            const e = r.entry!
                            return (
                              <tr key={r.line}>
                                <td className="whitespace-nowrap py-1.5 pe-3">{t.format.date(e.date)}</td>
                                <td className="max-w-40 truncate py-1.5 pe-3">{e.note ?? nameOf(e.categoryId)}</td>
                                <td className="hidden max-w-40 truncate py-1.5 pe-3 text-ink-2 sm:table-cell">{nameOf(e.categoryId)}</td>
                                <td className={clsx('whitespace-nowrap py-1.5 text-end font-bold tabular-nums', e.type !== 'expense' && 'text-good-ink')}>
                                  {formatMoney(e.type === 'expense' ? -e.amount : e.amount, currencyOf(e.accountId), { signed: true })}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Card>
          </section>

          <Button size="lg" block disabled={totals.count === 0} onClick={runImport}>
            {copy.importButton(totals.count)}
          </Button>
        </>
      )}
    </div>
  )
}
