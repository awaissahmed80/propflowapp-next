"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { lockSession, unlockSession } from "@/server/auth/lock-actions"
import { Dialog } from "@/components/ui/dialog"
import { LockScreen } from "./lock-screen"
import { PasscodeForm } from "./passcode-form"
import { isLockShortcut } from "./shortcut"

const LockContext = createContext(null)
const ACTIVITY = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]
const CHANNEL = "propflow-screen-lock"

// Wraps the signed-in portal (both shells). While locked the app stays mounted, so nothing typed
// is lost, but it's hidden and inert behind the lock screen. The lock is on the session row too,
// so a reload comes back locked; other tabs lock and unlock together.
// portal.lock is null while console staff are signed in as the member: no lock at all then.
// Locking needs a passcode: without one, Lock screen and the shortcut ask for one first (then lock).
const LEAVE_MS = 450 // the lock screen's exit animation
export function ScreenLockProvider({ portal, children }) {
  if (!portal.lock) return children
  return (
    <LockGate portal={portal} settings={portal.lock}>
      {children}
    </LockGate>
  )
}

function LockGate({ portal, settings: given, children }) {
  // A passcode set from the "Set a passcode first" dialog applies right away, until the server's
  // settings arrive with the next refresh
  const [saved, setSaved] = useState(null)
  const settings = saved?.given === given ? { ...given, ...saved.settings } : given
  const [lockedAt, setLockedAt] = useState(given.lockedAt)
  const [leaving, setLeaving] = useState(false)
  const [asking, setAsking] = useState(false)
  const lastActive = useRef(0)
  const channel = useRef(null)
  const hasPasscode = settings.hasPasscode

  const lock = useCallback(() => {
    const at = new Date().toISOString()
    setLockedAt((current) => current ?? at)
    document.activeElement?.blur?.()
    channel.current?.postMessage({ type: "lock", lockedAt: at })
    // Tell the server so a reload stays locked
    lockSession().catch(() => {})
  }, [])
  const lockNow = useCallback(() => (hasPasscode ? lock() : setAsking(true)), [hasPasscode, lock])

  // The lock screen fades away before the app comes back
  const open = useCallback(() => {
    lastActive.current = Date.now()
    setLeaving(true)
    setTimeout(() => {
      setLockedAt(null)
      setLeaving(false)
    }, LEAVE_MS)
  }, [])

  // { ok } | { error } | { signedOut, url }
  const unlock = useCallback(
    async (attempt) => {
      const r = await unlockSession(attempt)
      if (r?.ok) {
        open()
        channel.current?.postMessage({ type: "unlock" })
      } else if (r?.signedOut) {
        channel.current?.postMessage({ type: "signed-out" })
        setTimeout(() => window.location.assign(r.url), 1200)
      }
      return r ?? { error: "That didn't work. Try again." }
    },
    [open],
  )

  // Other tabs of this browser share the session, so they follow along
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined
    const ch = new BroadcastChannel(CHANNEL)
    channel.current = ch
    ch.onmessage = ({ data }) => {
      if (data?.type === "lock") setLockedAt((current) => current ?? data.lockedAt)
      else if (data?.type === "unlock") open()
      else if (data?.type === "signed-out") window.location.reload()
    }
    return () => {
      channel.current = null
      ch.close()
    }
  }, [open])

  // Shortcut: Ctrl/⌘ + Shift + L
  useEffect(() => {
    const onKey = (e) => {
      if (!isLockShortcut(e)) return
      e.preventDefault()
      lockNow()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lockNow])

  // Auto-lock after the chosen idle time (only with a passcode)
  const minutes = hasPasscode ? settings.autoLockMinutes : 0
  const locked = Boolean(lockedAt)
  useEffect(() => {
    if (!minutes || locked) return undefined
    lastActive.current = Date.now()
    const seen = () => {
      lastActive.current = Date.now()
    }
    ACTIVITY.forEach((ev) => window.addEventListener(ev, seen, { passive: true }))
    const timer = setInterval(() => {
      if (Date.now() - lastActive.current >= minutes * 60_000) lock()
    }, 15_000)
    return () => {
      ACTIVITY.forEach((ev) => window.removeEventListener(ev, seen))
      clearInterval(timer)
    }
  }, [minutes, locked, lock])

  const value = useMemo(() => ({ lockNow, locked }), [lockNow, locked])

  return (
    <LockContext.Provider value={value}>
      <div inert={locked || undefined} aria-hidden={locked || undefined} className={locked && !leaving ? "invisible [transition:visibility_0s_0.45s]" : undefined}>
        {children}
      </div>
      {locked && <LockScreen user={portal.user} tenant={portal.tenant} settings={settings} lockedAt={lockedAt} leaving={leaving} onUnlock={unlock} />}
      <Dialog open={asking} onOpenChange={setAsking} title="Set a passcode first" description="You'll type it to unlock the screen when you're back. Once it's saved, the screen locks." className="sm:max-w-sm">
        {asking && (
          <PasscodeForm
            className="space-y-4 text-center"
            onCancel={() => setAsking(false)}
            onSaved={(next) => {
              setSaved({ given, settings: next })
              setAsking(false)
              lock()
            }}
          />
        )}
      </Dialog>
    </LockContext.Provider>
  )
}

// { lockNow, locked } inside the portal, or null (e.g. staff signed in as a member)
export const useScreenLock = () => useContext(LockContext)
