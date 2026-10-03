"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { confirm } from "@/components/alert-context"

// Ask before leaving a page with unsaved changes: links inside the app (and the page's own back
// link), the browser's Back button and keyboard reloads get the app's own box; the reload button and
// closing the tab get the browser's (browsers don't allow anything else there).
//   useUnsavedGuard(dirty, { title, description })
// Back button: while there are changes, a copy of the current history entry sits on top, so Back
// lands on the same page first; we ask, then really go back (or stay).
const ASK = {
  title: "Leave without saving?",
  description: "You have changes that aren't saved. If you leave now, they'll be lost.",
  confirmLabel: "Leave without saving",
  cancelLabel: "Keep editing",
  destructive: true,
  icon: "error-warning-line",
}

export function useUnsavedGuard(dirty, options = {}) {
  const router = useRouter()
  const state = useRef({ dirty, guarded: false, asking: false, skipPrompt: false })
  useEffect(() => {
    state.current.dirty = dirty
  }, [dirty])
  const ask = (extra = {}) => confirm({ ...ASK, ...options, ...extra })

  // Reloading from the keyboard (⌘R / Ctrl+R / F5, with or without Shift): our own box first
  useEffect(() => {
    const onKey = async (e) => {
      const reload = e.key === "F5" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r")
      if (!reload || !state.current.dirty) return
      e.preventDefault()
      if (await ask({ title: "Reload without saving?", confirmLabel: "Reload without saving" })) {
        state.current.dirty = false
        state.current.skipPrompt = true
        window.location.reload()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The browser's reload button, closing the tab, typing an address: only the browser's own
  // prompt is allowed there (it can't be styled)
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      if (!state.current.skipPrompt) e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Links: any click on an in-app link that leaves this page
  useEffect(() => {
    const onClick = async (e) => {
      if (!state.current.dirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.("a[href]")
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      e.preventDefault()
      e.stopPropagation()
      if (await ask()) {
        state.current.dirty = false
        router.push(url.pathname + url.search + url.hash)
      }
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Back button
  useEffect(() => {
    if (!dirty || state.current.guarded) return
    window.history.pushState({ ...window.history.state, pfUnsaved: true }, "", window.location.href)
    state.current.guarded = true
  }, [dirty])
  useEffect(() => {
    const onPop = async () => {
      if (!state.current.guarded || state.current.asking) return
      // We're on the real entry now (same page); the copy is gone
      state.current.guarded = false
      if (!state.current.dirty) return
      state.current.asking = true
      const leave = await ask()
      state.current.asking = false
      if (leave) {
        state.current.dirty = false
        window.history.back()
      } else {
        window.history.pushState({ ...window.history.state, pfUnsaved: true }, "", window.location.href)
        state.current.guarded = true
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
