"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

// The theme is only known in the browser; render a neutral icon on the server
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

export function ThemeToggle({ className }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const isDark = mounted && resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      leftIcon={mounted ? (isDark ? "sun-line" : "moon-line") : "contrast-2-line"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    />
  )
}
