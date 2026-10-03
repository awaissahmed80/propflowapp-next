"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import { THEME_COOKIE, THEME_KEY, THEMES, parseThemeCookie } from "@/lib/theme"

// Theme state for the app: useTheme() → { theme, resolvedTheme, setTheme }.
// The first paint comes from the server (root layout, from the pf-theme cookie); this keeps the
// <html> class in step with the choice and with the system setting while "system" is picked,
// and keeps the cookie up to date for the next page load.

const ThemeContext = createContext({ theme: "system", resolvedTheme: "light", setTheme: () => {} })
const listeners = new Set()
const QUERY = "(prefers-color-scheme: dark)"

const cookieTheme = () => parseThemeCookie(document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`))?.[1]).theme

function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return THEMES.includes(t) ? t : cookieTheme()
  } catch {
    return "system"
  }
}

// Shared by every subdomain (portal., auth., console.…): "propflowapp.com" from "portal.propflowapp.com"
function writeCookie(theme, resolved) {
  const host = window.location.hostname
  const domain = /^[\d.]+$/.test(host) || host === "localhost" ? "" : `; domain=.${host.split(".").slice(-2).join(".")}`
  document.cookie = `${THEME_COOKIE}=${theme}.${resolved}; path=/; max-age=31536000; samesite=lax${domain}`
}
const subscribeTheme = (cb) => {
  listeners.add(cb)
  const onStorage = (e) => e.key === THEME_KEY && cb()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}
const subscribeSystem = (cb) => {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

// Switch without every element animating its colors at once
function withoutTransitions(fn) {
  const style = document.createElement("style")
  style.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"))
  document.head.appendChild(style)
  fn()
  window.getComputedStyle(document.body)
  setTimeout(() => style.remove(), 1)
}

// forced: "light" pins the page (public campaign pages: the workspace's own brand), leaving the
// saved choice and cookie alone
export function ThemeProvider({ children, forced = null }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system")
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
  const resolvedTheme = forced ?? (theme === "system" ? (systemDark ? "dark" : "light") : theme)

  useEffect(() => {
    if (!forced) writeCookie(theme, resolvedTheme)
  }, [forced, theme, resolvedTheme])

  useEffect(() => {
    const el = document.documentElement
    if (el.classList.contains(resolvedTheme) && !el.classList.contains(resolvedTheme === "dark" ? "light" : "dark")) return
    withoutTransitions(() => {
      el.classList.remove("light", "dark")
      el.classList.add(resolvedTheme)
      el.style.colorScheme = resolvedTheme
    })
  }, [resolvedTheme])

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(THEME_KEY, THEMES.includes(next) ? next : "system")
    } catch {
      // storage unavailable: the choice lasts until the page reloads
    }
    listeners.forEach((cb) => cb())
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
