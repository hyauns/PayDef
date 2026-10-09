import { useSyncExternalStore } from "react"

const subscribeNever = () => () => {}

/**
 * false during SSR and hydration, true after — without a setState-in-effect
 * re-render (react-hooks/set-state-in-effect).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false)
}

/** matchMedia(query).matches, kept in sync; false on the server. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}
