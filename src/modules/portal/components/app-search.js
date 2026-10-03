"use client"

import { useCallback } from "react"
import { appPath } from "@/modules/portal/app-paths"

// Spotlight (⌘K) search over the apps someone can open. Records join as each app is ported.
export function useAppSearch(apps) {
  return useCallback(
    (query) => {
      const q = query.trim().toLowerCase()
      const found = apps.filter((a) => !q || [a.name, a.description, a.category].some((t) => t?.toLowerCase().includes(q)))
      return found.length ? [{ value: "Apps", items: found.map((a) => ({ value: a.code, label: a.name, meta: a.description, icon: a.icon, href: appPath(a.code) })) }] : []
    },
    [apps],
  )
}
