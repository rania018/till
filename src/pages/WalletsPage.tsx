import clsx from 'clsx'
import { ArrowLeftRight, Banknote, Coins, CreditCard, Landmark, Pencil, Plus } from 'lucide-react'
import { ChevronRight } from '../components/ui/directionalIcons'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { Panel } from '../components/desk/Panel'
import { TransactionTable } from '../components/desk/TransactionTable'
import { ExportButton } from '../components/ExportButton'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { TransactionRow } from '../components/transactions/TransactionRow'
import { Button, IconButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SummarySplit } from '../components/ui/SummarySplit'
import { toast } from '../components/ui/toastStore'
import { CashCountSheet } from '../components/wallets/CashCountSheet'
import { WalletPicker } from '../components/wallets/WalletPicker'
import { WalletSheet } from '../components/wallets/WalletSheet'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { subDays } from 'date-fns'
import { fromISODate, todayISO, toISODate } from '../lib/dates'
import { byCurrency, formatAmounts } from '../lib/currency'
import { walletsWorkbook } from '../lib/export/pages'
import { live } from '../lib/id'
import { netWorthOn } from '../lib/netWorth'
import { formatMoney } from '../lib/money'
import { filterTransactions } from '../lib/transactions'
import { walletBalance } from '../lib/wallets'
import { appStore, useAppStore } from '../store'
import type { Account } from '../types'

const RECENT = 8
const RECENT_DESK = 14

export function WalletsPage() {
  const { accounts, transactions, categories, goals, debts, assets, profile } = useAppStore(
    useShallow((s) => ({ accounts: s.accounts, transactions: s.transactions, categories: s.categories, goals: s.goals, debts: s.debts, assets: s.assets, profile: s.profile })),
  )
  const currency = profile.currency
  const desktop = useIsDesktop()
  const today = todayISO()
  const wallets = useMemo(
    () =>
      live(accounts)
        .filter((a) => !a.archived)
        .map((account) => ({ account, balance: walletBalance(account, transactions, today) })),
    [accounts, transactions, today],
  )
  const cashWallets = wallets.filter((w) => w.account.kind === 'cash')
  const [chosenId, setChosenId] = useState(cashWallets[0]?.account.id ?? wallets[0]?.account.id)
  // The chosen wallet can close while this page is open.
  const shownId = wallets.some((w) => w.account.id === chosenId) ? chosenId : wallets[0]?.account.id
  // Several cash wallets: count the one being looked at, if it's cash.
  const cash = cashWallets.find((w) => w.account.id === shownId) ?? cashWallets[0]
  const closed = live(accounts).filter((a) => a.archived)
  const [counting, setCounting] = useState<Account | null>(null)
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [params, setParams] = useSearchParams()

  // Home's "Count your cash" card links here with ?count=<wallet id>.
  const countId = params.get('count')
  useEffect(() => {
    if (!countId) return
    const account = live(accounts).find((a) => a.id === countId)
    if (account) setCounting(account)
    setParams({}, { replace: true })
  }, [countId, accounts, setParams])
  const names = useMemo(() => ({ categories, accounts, goals, debts }), [categories, accounts, goals, debts])
  const moves = useMemo(() => filterTransactions(transactions, { accountId: shownId }, names).slice(0, desktop ? RECENT_DESK : RECENT), [transactions, shownId, names, desktop])
  // Currencies can't be added together, so the total lists each one.
  const totals = byCurrency(wallets.map((w) => ({ currency: w.account.currency ?? currency, amount: w.balance })), currency)
  const mainTotal = totals.find((row) => row.currency === currency)?.amount ?? 0
  const otherTotals = totals.filter((row) => row.currency !== currency)
  const money = (amount: number) => formatMoney(amount, currency)
  const netWorth = useMemo(() => netWorthOn({ profile, accounts, transactions, goals, debts, assets }, today), [profile, accounts, transactions, goals, debts, assets, today])

  return (
    <>
      <PageHeader title={t.wallets.title} subtitle={t.wallets.subtitle} actions={<ExportButton workbook={() => walletsWorkbook(appStore.getState(), today, shownId)} />} />
      <SummarySplit
        summary={
          <>
            <Card className="mb-3">
              <p className="text-sm font-semibold text-muted">{t.wallets.total}</p>
              <p className="text-3xl font-extrabold tracking-tight">{money(mainTotal)}</p>
              {otherTotals.length > 0 && <p className="text-lg font-extrabold tracking-tight tabular-nums text-ink-2">{formatAmounts(otherTotals, currency)}</p>}
              <p className="text-sm text-muted">{t.wallets.totalHint}</p>
            </Card>

            <Link to="/wallets/net-worth" className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Landmark className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-muted">{t.netWorth.title}</span>
                <span className={clsx('block truncate text-xl font-extrabold tracking-tight tabular-nums', netWorth[0].total < 0 && 'text-crit-ink')}>
                  {formatAmounts(netWorth.map((row) => ({ currency: row.currency, amount: row.total })), currency)}
                </span>
                <span className="block text-xs text-muted">{t.netWorth.walletsLinkHint}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
            </Link>

            <div className="grid grid-cols-2 gap-3">
              {wallets.map(({ account, balance }) => {
                const Icon = account.kind === 'cash' ? Banknote : CreditCard
                return (
                  <Card key={account.id}>
                    <div className="mb-2 flex items-start justify-between gap-1">
                      <Icon aria-hidden className="size-5 text-accent" />
                      <IconButton icon={Pencil} label={t.wallets.edit(account.name)} onClick={() => setEditing(account)} className="-me-2 -mt-2" />
                    </div>
                    <p className="truncate text-sm font-semibold text-muted">{account.name}</p>
                    <p className={clsx('text-xl font-extrabold tracking-tight', balance < 0 && 'text-crit-ink')}>{formatMoney(balance, account.currency ?? currency)}</p>
                    {account.kind === 'cash' && (
                      <p className="mt-0.5 text-xs text-muted">
                        {account.lastCountedAt ? t.wallets.lastCounted(t.format.relative(account.lastCountedAt)) : t.wallets.neverCounted}
                      </p>
                    )}
                  </Card>
                )
              })}
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line p-3 text-sm font-bold text-accent transition-colors hover:bg-surface-2"
              >
                <Plus aria-hidden className="size-5" />
                {t.wallets.add}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Button variant="secondary" icon={ArrowLeftRight} onClick={() => openTransactionSheet('transfer')}>
                {t.wallets.move}
              </Button>
              <Button variant="secondary" icon={Coins} disabled={!cash} onClick={() => cash && setCounting(cash.account)}>
                {cashWallets.length > 1 && cash ? t.wallets.countNamed(cash.account.name) : t.wallets.count}
              </Button>
            </div>

            {closed.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-sm font-extrabold">{t.wallets.closedTitle}</h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                  {closed.map((account) => (
                    <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{account.name}</span>
                      {/* Editing an old entry can leave money in a closed wallet: never hide it. */}
                      {walletBalance(account, transactions, today) !== 0 && <span className="shrink-0 font-bold tabular-nums">{formatMoney(walletBalance(account, transactions, today), account.currency ?? currency)}</span>}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          appStore.getState().reopenAccount(account.id)
                          toast(t.wallets.broughtBack(account.name), { tone: 'good' })
                        }}
                      >
                        {t.wallets.bringBack}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        }
      >
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold">{t.wallets.moves}</h2>
            <Link to={`/activity/list?wallet=${shownId}`} className="flex items-center gap-0.5 text-sm font-bold text-accent">
              {t.wallets.seeAll}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </div>
          {wallets.length > 1 && shownId && (
            <div className="mb-2">
              <WalletPicker label={t.wallets.moves} value={shownId} onChange={setChosenId} wallets={wallets.map((w) => w.account)} />
            </div>
          )}
          {moves.length > 0 && desktop ? (
            <Panel>
              <TransactionTable transactions={moves} names={names} currency={currency} viewAccountId={shownId} today={today} yesterday={toISODate(subDays(fromISODate(today), 1))} />
            </Panel>
          ) : moves.length > 0 ? (
            <ul className="rounded-2xl border border-line bg-surface p-1">
              {moves.map((tx) => (
                <li key={tx.id}>
                  <TransactionRow transaction={tx} names={names} currency={currency} viewAccountId={shownId} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.9375rem] text-ink-2">{t.wallets.noMoves}</p>
          )}
        </section>
      </SummarySplit>

      <CashCountSheet
        account={counting}
        expected={counting ? walletBalance(counting, transactions, today) : 0}
        currency={currency}
        onClose={() => setCounting(null)}
      />
      <WalletSheet wallet={editing} currency={currency} onClose={() => setEditing(null)} />
    </>
  )
}
