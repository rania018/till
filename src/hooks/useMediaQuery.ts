import { useCallback, useSyncExternalStore } from 'react'

/** A computer: a large screen and a mouse. The same query as the `desk:` variant in index.css. */
export const DESKTOP_QUERY = '(min-width: 1024px) and (pointer: fine)'

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)

/** Whether a CSS media query matches, updating as it changes. For when CSS alone can't swap the behavior. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
