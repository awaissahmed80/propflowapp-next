import { useSyncExternalStore } from "react"

// true while the CSS media query matches, e.g. useMediaQuery("(min-width: 1024px)").
// The server render assumes it doesn't match; the browser corrects it on hydration.
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
