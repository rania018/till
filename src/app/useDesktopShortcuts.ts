import { useEffect } from 'react'
import { openTransactionSheet } from '../components/transactions/sheetStore'

/** Keyboard shortcuts for computers: N adds an expense, / jumps to the page's search box. */
export function useDesktopShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
      const target = event.target as HTMLElement
      // Typing somewhere, or a sheet is open: these keys mean what they say.
      if (target.closest('input, textarea, select, [contenteditable]') || document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        openTransactionSheet('expense')
      } else if (event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('input[type="search"]')
        if (!search) return
        event.preventDefault()
        search.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
