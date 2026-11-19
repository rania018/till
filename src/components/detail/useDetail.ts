import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { DETAIL_KEYS, detailParams, readDetail, type Detail } from '../../lib/detail'

/**
 * The details panel, kept in the URL next to the page's own params. Opening it adds a
 * history entry, so Back closes it; clicking something else while it's open swaps what it shows.
 */
export function useDetail() {
  const [params, setParams] = useSearchParams()
  const current = readDetail(params)
  const isOpen = current !== null

  const open = useCallback(
    (detail: Detail) =>
      setParams(
        (now) => {
          const next = new URLSearchParams(now)
          for (const [key, value] of Object.entries(detailParams(detail))) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: isOpen },
      ),
    [setParams, isOpen],
  )

  const close = useCallback(
    () =>
      setParams(
        (now) => {
          const next = new URLSearchParams(now)
          for (const key of DETAIL_KEYS) next.delete(key)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  return { current, open, close }
}
