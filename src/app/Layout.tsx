import clsx from 'clsx'
import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useSearchParams } from 'react-router'
import { DETAIL_ROOM, DetailPanel } from '../components/detail/DetailPanel'
import { openTransactionSheet } from '../components/transactions/sheetStore'
import { TransactionSheet } from '../components/transactions/TransactionSheet'
import { t } from '../i18n'
import { readDetail } from '../lib/detail'
import { BottomNav } from './BottomNav'
import { useDesktopShortcuts } from './useDesktopShortcuts'
import { Sidebar } from './Sidebar'

/** Every page except onboarding: bottom bar on phones, sidebar from tablet width up. */
export function Layout() {
  const openAdd = () => openTransactionSheet('expense')
  const [params, setParams] = useSearchParams()
  useDesktopShortcuts()

  // The installed app's "Add an expense" shortcut opens /?add=expense.
  const add = params.get('add')
  useEffect(() => {
    if (add !== 'expense') return
    openTransactionSheet('expense')
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('add')
        return next
      },
      { replace: true },
    )
  }, [add, setParams])

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-accent px-4 py-2 font-bold text-on-accent focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t.skipToContent}
      </a>
      <Sidebar onAdd={openAdd} />
      {/* With the details panel open on a computer, the page makes room for it beside it. */}
      <div className={clsx('md:ps-62 desk:ps-60 print:!ps-0', readDetail(params) && DETAIL_ROOM)}>
        <main
          id="main"
          className="mx-auto w-full max-w-[77.5rem] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pb-12 md:pt-8 desk:mx-0 desk:max-w-[130rem] desk:px-8 desk:pb-12 desk:pt-0 print:max-w-none print:p-0"
        >
          <Outlet />
        </main>
      </div>
      <BottomNav onAdd={openAdd} />
      <DetailPanel />
      <TransactionSheet />
      <ScrollRestoration />
    </div>
  )
}
