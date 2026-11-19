import clsx from 'clsx'
import { Printer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { Panel, SumBand, SumCell } from '../components/desk/Panel'
import { CardHeader } from '../components/home/HomeCards'
import { StatsTabs } from '../components/stats/StatsTabs'
import { Button, IconButton } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Select'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { todayISO } from '../lib/dates'
import { currencySymbol, formatAmount, formatMoney } from '../lib/money'
import { reportYears, yearReport } from '../lib/yearReport'
import { useAppStore } from '../store'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-base font-extrabold">{title}</h2>
      {children}
    </section>
  )
}

/** A heading: numbers line up at the end, words at the start. */
const th = 'px-3 py-2 text-sm font-semibold text-muted'
const thText = clsx(th, 'text-start')
const td = 'px-3 py-2 text-sm tabular-nums'
const tableBox = 'overflow-hidden rounded-2xl border border-line bg-surface print:rounded-none'
/** In a panel on a computer's screen, the outer columns line up with the panel's title. Never on paper. */
const table = 'w-full desk-screen:[&_:is(td,th):first-child]:ps-5 desk-screen:[&_:is(td,th):last-child]:pe-5'

const YEAR_ROW = 'grid gap-6 @min-[66rem]:grid-cols-3'
const DESK_LIST = 'grid flex-1 content-around divide-y divide-line'
const DESK_ROW = 'flex items-center justify-between gap-3 py-2 text-sm first:pt-0.5 last:pb-0.5'

function DeskCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={clsx('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5', className)}>
      <CardHeader title={title} />
      {children}
    </section>
  )
}

/**
 * A year on paper: totals, month by month, where the money went, bills, goals and debts. It's a page
 * made to print: "Save as PDF" opens the browser's print window, which saves it as a PDF anywhere.
 */
export function ReportPage() {
  const [params, setParams] = useSearchParams()
  const data = useAppStore(useShallow((s) => ({ profile: s.profile, transactions: s.transactions, accounts: s.accounts, debts: s.debts, bills: s.bills, goals: s.goals, categories: s.categories, assets: s.assets })))
  const desktop = useIsDesktop()
  const today = todayISO()
  const years = useMemo(() => reportYears(data.transactions, today), [data.transactions, today])
  const asked = Number(params.get('year'))
  const year = years.includes(asked) ? asked : years[0]
  const report = useMemo(() => yearReport(data, year, today), [data, year, today])
  const main = data.profile.currency
  const money = (amount: number, currency = main) => formatMoney(amount, currency)
  const copy = t.report
  const peak = Math.max(1, ...report.months.map((m) => Math.max(m.income, m.spent)))
  const nothing = report.totals.income === 0 && report.totals.spent === 0

  const hasDebts = report.debts.borrowed > 0 || report.debts.repaid > 0 || report.debts.lent > 0 || report.debts.repaidToYou > 0
  const hasFirstRail = !!report.netWorth || hasDebts
  const hasSecondRail = report.biggest.length > 0 || report.bills.length > 0

  const monthsTable = (
    <table className={table}>
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className={thText}>{copy.month}</th>
                    <th scope="col" className={clsx(thText, 'hidden w-2/5 sm:table-cell')}><span className="sr-only">{copy.monthsTitle}</span></th>
                    {/* The currency once in each heading, so a phone's narrow columns hold their amounts on one line. */}
                    <th scope="col" className={clsx(th, 'text-end')}>{copy.inCurrency(copy.income, currencySymbol(main))}</th>
                    <th scope="col" className={clsx(th, 'text-end')}>{copy.inCurrency(copy.spent, currencySymbol(main))}</th>
                    <th scope="col" className={clsx(th, 'text-end')}>{copy.inCurrency(copy.kept, currencySymbol(main))}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.months.map((m) => (
                    <tr key={m.month}>
                      <td className={clsx(td, 'font-semibold')}>{t.format.monthYear(m.month)}</td>
                      <td className="hidden px-3 py-2 sm:table-cell" aria-hidden>
                        <span className="block h-1.5 rounded-full bg-good" style={{ width: `${(m.income / peak) * 100}%` }} />
                        <span className="mt-1 block h-1.5 rounded-full bg-accent" style={{ width: `${(m.spent / peak) * 100}%` }} />
                      </td>
                      <td className={clsx(td, 'text-end')}>{formatAmount(m.income, main)}</td>
                      <td className={clsx(td, 'text-end')}>{formatAmount(m.spent, main)}</td>
                      <td className={clsx(td, 'text-end font-bold', m.kept < 0 && 'text-crit-ink')}><bdi>{m.kept < 0 ? '−' : ''}{formatAmount(m.kept, main)}</bdi></td>
                    </tr>
                  ))}
                </tbody>
              </table>
  )

  const categoriesTable = (
    <table className={table}>
                  <thead className="border-b border-line">
                    <tr>
                      <th scope="col" className={thText}>{copy.category}</th>
                      <th scope="col" className={clsx(th, 'text-end')}>{copy.spent}</th>
                      <th scope="col" className={clsx(th, 'text-end')}>{copy.share}</th>
                      <th scope="col" className={clsx(th, 'text-end')}>{copy.vsLastYear}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.categories.map((c) => {
                      const category = data.categories.find((x) => x.id === c.categoryId)
                      return (
                        <tr key={c.categoryId}>
                          <td className={td}>
                            <span className="flex items-center gap-2 font-semibold">
                              <Icon name={category?.icon ?? 'package'} className="size-4 shrink-0 text-accent" />
                              {category?.name}
                            </span>
                          </td>
                          <td className={clsx(td, 'text-end font-bold')}>{money(c.spent)}</td>
                          <td className={clsx(td, 'text-end')}>{Math.round(c.share * 100)}%</td>
                          <td className={clsx(td, 'text-end text-muted')}>{c.change === null ? copy.newThisYear : `${c.change > 0 ? '+' : ''}${Math.round(c.change * 100)}%`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
  )

  return (
    <div className="mx-auto max-w-4xl desk-screen:max-w-none">
      <PageHeader
        title={copy.title(year)}
        backTo={desktop ? undefined : '/stats'}
        nav={desktop && <StatsTabs />}
        centerNav
        showSettings={false}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            {years.length > 1 && (
              <div className="w-28">
                <Select aria-label={copy.year} value={year} onChange={(e) => setParams({ year: e.target.value })}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {desktop ? (
              <IconButton icon={Printer} label={copy.save} onClick={() => window.print()} disabled={nothing} />
            ) : (
              <Button icon={Printer} onClick={() => window.print()} disabled={nothing}>
                {copy.save}
              </Button>
            )}
          </div>
        }
      />
      {/* The page on a computer's screen. Printing always gets the document below, whatever the screen. */}
      {desktop && (nothing ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[0.9375rem] text-ink-2 print:hidden">{copy.nothing}</p>
      ) : (
        <div className="space-y-6 @container print:hidden">
          <SumBand label={copy.totalsTitle}>
            <SumCell label={copy.income} value={money(report.totals.income)} tone={report.totals.income > 0 ? 'good' : undefined} />
            <SumCell sign="" label={copy.spent} value={money(report.totals.spent)} />
            <SumCell sign="" label={copy.kept} value={money(report.kept)} tone={report.kept < 0 ? 'crit' : 'accent'} note={report.savingsRate === null ? undefined : t.insights.keptShare(`${Math.round(report.savingsRate * 100)}%`)} />
          </SumBand>

          <div className={YEAR_ROW}>
            <Panel
              title={copy.monthsTitle}
              className={hasFirstRail ? '@min-[66rem]:col-span-2' : '@min-[66rem]:col-span-3'}
              aside={
                <p className="flex gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-good" />{copy.income}</span>
                  <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-accent" />{copy.spent}</span>
                </p>
              }
            >
              {monthsTable}
            </Panel>
            {hasFirstRail && (
              <div className="flex min-w-0 flex-col gap-6 *:grow">
                {report.netWorth && (
                  <DeskCard title={copy.netWorthTitle}>
                    <dl className="grid flex-1 content-around">
                      {[report.netWorth.start, report.netWorth.end].map(
                        (at) =>
                          at && (
                            <div key={at.date} className="flex items-baseline justify-between gap-4 py-1.5">
                              <dt className="text-sm text-muted">{t.format.date(at.date)}</dt>
                              <dd className={clsx('whitespace-nowrap text-lg font-extrabold tabular-nums tracking-tight', at.total < 0 && 'text-crit-ink')}>{money(at.total)}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                  </DeskCard>
                )}
                {hasDebts && (
                  <DeskCard title={copy.debtsTitle}>
                    <dl className="grid flex-1 content-around">
                      {[
                        [copy.borrowed, report.debts.borrowed],
                        [copy.repaid, report.debts.repaid],
                        [copy.lent, report.debts.lent],
                        [copy.repaidToYou, report.debts.repaidToYou],
                      ].map(([label, amount]) => (
                        <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                          <dt className="text-sm text-muted">{label}</dt>
                          <dd className="whitespace-nowrap font-extrabold tabular-nums">{money(amount as number)}</dd>
                        </div>
                      ))}
                    </dl>
                  </DeskCard>
                )}
              </div>
            )}
          </div>

          {(report.categories.length > 0 || hasSecondRail) && (
            <div className={YEAR_ROW}>
              {report.categories.length > 0 && (
                <Panel title={copy.categoriesTitle} className={hasSecondRail ? '@min-[66rem]:col-span-2' : '@min-[66rem]:col-span-3'}>
                  {categoriesTable}
                </Panel>
              )}
              {hasSecondRail && (
                <div className="flex min-w-0 flex-col gap-6 *:grow">
                  {report.biggest.length > 0 && (
                    <DeskCard title={copy.biggestTitle}>
                      <ul className={DESK_LIST}>
                        {report.biggest.map((tx) => (
                          <li key={tx.id} className={DESK_ROW}>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{(tx.note ?? '').split('\n')[0] || data.categories.find((c) => c.id === tx.categoryId)?.name}</span>
                              <span className="block text-xs text-muted">{t.format.date(tx.date)}</span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">{money(tx.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </DeskCard>
                  )}
                  {report.bills.length > 0 && (
                    <DeskCard title={copy.billsTitle}>
                      <ul className={DESK_LIST}>
                        {report.bills.map((bill) => (
                          <li key={bill.billId} className={DESK_ROW}>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{bill.name}</span>
                              <span className="block text-xs text-muted">{copy.payments(bill.payments)}</span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">{money(bill.paid)}</span>
                          </li>
                        ))}
                      </ul>
                    </DeskCard>
                  )}
                </div>
              )}
            </div>
          )}

          {(report.goals.length > 0 || report.otherCurrencies.length > 0) && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] gap-6">
              {report.goals.length > 0 && (
                <DeskCard title={copy.goalsTitle} className={report.otherCurrencies.length > 0 ? undefined : 'col-span-full'}>
                  <ul className={clsx('grid gap-x-12 gap-y-1', report.otherCurrencies.length === 0 && '@min-[66rem]:grid-cols-3 @min-[48rem]:grid-cols-2')}>
                    {report.goals.map((goal) => (
                      <li key={goal.goalId} className="py-1.5 text-sm">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-semibold">{goal.name}</span>
                          <span className="shrink-0 font-bold tabular-nums">{formatMoney(goal.putAside, main, { signed: true })}</span>
                        </span>
                        <span className="block truncate text-xs text-muted">{copy.savedNow(money(goal.saved), money(goal.target))}</span>
                      </li>
                    ))}
                  </ul>
                </DeskCard>
              )}
              {report.otherCurrencies.length > 0 && (
                <DeskCard title={copy.otherTitle}>
                  <ul className={DESK_LIST}>
                    {report.otherCurrencies.map((row) => (
                      <li key={row.currency} className={DESK_ROW}>
                        <span className="font-semibold">{t.settings.currencies[row.currency] ?? row.currency}</span>
                        <span className="tabular-nums text-ink-2">{copy.otherLine(money(row.spent, row.currency), money(row.received, row.currency))}</span>
                      </li>
                    ))}
                  </ul>
                </DeskCard>
              )}
            </div>
          )}

          <p className="text-xs text-muted">{copy.made(t.format.date(today))}</p>
        </div>
      ))}

      <div className={desktop ? 'hidden print:block' : undefined}>
      <p className="-mt-3 mb-6 text-sm text-muted print:hidden">{copy.saveHint}</p>

      {nothing ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[0.9375rem] text-ink-2">{copy.nothing}</p>
      ) : (
        <div className="space-y-8">
          <Section title={copy.totalsTitle}>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [copy.income, money(report.totals.income)],
                [copy.spent, money(report.totals.spent)],
                [copy.kept, money(report.kept)],
                [copy.rate, report.savingsRate === null ? '–' : `${Math.round(report.savingsRate * 100)}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-line bg-surface p-4">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="mt-1 text-xl font-extrabold tabular-nums tracking-tight">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {report.netWorth && (
            <Section title={copy.netWorthTitle}>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[report.netWorth.start, report.netWorth.end].map(
                  (at) =>
                    at && (
                      <div key={at.date} className="rounded-2xl border border-line bg-surface p-4">
                        <dt className="text-sm text-muted">{t.format.date(at.date)}</dt>
                        <dd className={clsx('mt-1 text-xl font-extrabold tabular-nums tracking-tight', at.total < 0 && 'text-crit-ink')}>{money(at.total)}</dd>
                      </div>
                    ),
                )}
              </dl>
            </Section>
          )}

          <Section title={copy.monthsTitle}>
            <div className={tableBox}>
              {monthsTable}
            </div>
            <p className="mt-2 hidden gap-4 text-xs text-muted sm:flex">
              <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-good" />{copy.income}</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-accent" />{copy.spent}</span>
            </p>
          </Section>

          {report.categories.length > 0 && (
            <Section title={copy.categoriesTitle}>
              <div className={tableBox}>
                {categoriesTable}
              </div>
            </Section>
          )}

          {report.biggest.length > 0 && (
            <Section title={copy.biggestTitle}>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                {report.biggest.map((tx) => (
                  <li key={tx.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{(tx.note ?? '').split('\n')[0] || data.categories.find((c) => c.id === tx.categoryId)?.name}</span>
                      <span className="text-muted"> · {t.format.date(tx.date)}</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{money(tx.amount)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="grid gap-8 sm:grid-cols-2">
            {report.bills.length > 0 && (
              <Section title={copy.billsTitle}>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                  {report.bills.map((bill) => (
                    <li key={bill.billId} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{bill.name}</span>
                        <span className="text-muted"> · {copy.payments(bill.payments)}</span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">{money(bill.paid)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {report.goals.length > 0 && (
              <Section title={copy.goalsTitle}>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                  {report.goals.map((goal) => (
                    <li key={goal.goalId} className="py-2.5 text-sm">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">{goal.name}</span>
                        <span className="shrink-0 font-bold tabular-nums">{formatMoney(goal.putAside, main, { signed: true })}</span>
                      </span>
                      <span className="block text-muted">{copy.savedNow(money(goal.saved), money(goal.target))}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          {(report.debts.borrowed > 0 || report.debts.repaid > 0 || report.debts.lent > 0 || report.debts.repaidToYou > 0) && (
            <Section title={copy.debtsTitle}>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  [copy.borrowed, report.debts.borrowed],
                  [copy.repaid, report.debts.repaid],
                  [copy.lent, report.debts.lent],
                  [copy.repaidToYou, report.debts.repaidToYou],
                ].map(([label, amount]) => (
                  <div key={label} className="rounded-2xl border border-line bg-surface p-3">
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="font-extrabold tabular-nums">{money(amount as number)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {report.otherCurrencies.length > 0 && (
            <Section title={copy.otherTitle}>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                {report.otherCurrencies.map((row) => (
                  <li key={row.currency} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="font-semibold">{t.settings.currencies[row.currency] ?? row.currency}</span>
                    <span className="tabular-nums text-ink-2">{copy.otherLine(money(row.spent, row.currency), money(row.received, row.currency))}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <p className="text-xs text-muted">{copy.made(t.format.date(today))}</p>
        </div>
      )}
      </div>
    </div>
  )
}
