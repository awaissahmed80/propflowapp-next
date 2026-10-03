"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

// Apps someone pinned to the top of the launcher. A per-browser convenience, so localStorage is
// enough (guarded for private mode); until they pin or unpin anything, Dashboards is pinned when
// they can open it.
//   const [pinned, toggle] = usePinnedApps(userId, tenantId, apps)   pinned: Set of app codes
const EVENT = "propflow-pins"
const subscribe = (fn) => {
  window.addEventListener(EVENT, fn)
  window.addEventListener("storage", fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener("storage", fn)
  }
}
const read = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function usePinnedApps(userId, tenantId, apps) {
  const key = `propflow-pinned:v3:${tenantId}:${userId}`
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const defaults = useMemo(() => apps.filter((a) => a.code === "dashboards").map((a) => a.code), [apps])
  const pinned = useMemo(() => {
    try {
      const saved = JSON.parse(raw)
      if (Array.isArray(saved)) return new Set(saved.filter((c) => apps.some((a) => a.code === c)))
    } catch {
      // nothing saved yet
    }
    return new Set(defaults)
  }, [raw, apps, defaults])
  const toggle = useCallback(
    (code) => {
      const next = pinned.has(code) ? [...pinned].filter((c) => c !== code) : [...pinned, code]
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // storage unavailable: the pin lasts until reload
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [key, pinned],
  )
  return [pinned, toggle]
}
