"use client"

import { useSyncExternalStore } from "react"

const never = () => () => {}

// The lock shortcut as this computer writes it (the server doesn't know, so it renders Ctrl)
export function useLockShortcut() {
  const mac = useSyncExternalStore(
    never,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  )
  return mac ? "⌘⇧L" : "Ctrl+Shift+L"
}

export const isLockShortcut = (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key?.toLowerCase() === "l"
