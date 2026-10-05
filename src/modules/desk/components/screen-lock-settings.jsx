"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { removeLockPasscode, saveLockSettings } from "@/server/auth/lock-actions"
import { useLockShortcut } from "@/modules/portal/components/screen-lock/shortcut"
import { PasscodeForm } from "@/modules/portal/components/screen-lock/passcode-form"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"

const AUTO_LOCK = [{ value: 0, label: "Off" }, ...[5, 10, 15, 30, 60].map((m) => ({ value: m, label: m === 60 ? "After 1 hour" : `After ${m} minutes` }))]

// My Desk › Profile › Screen lock: passcode (4 or 6 digits, typed twice) and auto-lock when idle.
// Locking, by hand or automatically, needs the passcode.
// settings: { autoLockMinutes, hasPasscode, passcodeLength, hasPassword } (server/auth/screen-lock.js)
export function ScreenLockSettings({ settings }) {
  const router = useRouter()
  const shortcut = useLockShortcut()
  const [editing, setEditing] = useState(false)
  const canUnlock = settings.hasPasscode

  const remove = async () => {
    const r = await toastAction(() => removeLockPasscode(), {
      loading: "Removing passcode…",
      success: "Passcode removed. Set one again to lock the screen.",
    })
    if (r?.ok) router.refresh()
  }
  const setAutoLock = async (minutes) => {
    const r = await toastAction(() => saveLockSettings({ autoLockMinutes: minutes }), { loading: "Saving…", success: minutes ? "Auto-lock is on." : "Auto-lock is off." })
    if (r?.ok) router.refresh()
  }

  return (
    <section aria-labelledby="screen-lock-title" className="rounded-xl border bg-background p-4 shadow-xs">
      <h2 id="screen-lock-title" className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Screen lock
      </h2>
      <p className="text-sm text-muted-foreground">
        Lock PropFlow when you step away with <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground">{shortcut}</kbd> or <span className="font-medium text-foreground">Lock screen</span>{" "}
        in the menu under your name. Your work stays open underneath.
      </p>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Passcode</h3>
          {!editing ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Icon name={settings.hasPasscode ? "shield-keyhole-line" : "shield-line"} className={settings.hasPasscode ? "text-primary" : "text-muted-foreground"} />
                  {settings.hasPasscode ? `${settings.passcodeLength}-digit passcode is on` : "No passcode"}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant={settings.hasPasscode ? "outline" : "default"} onClick={() => setEditing(true)}>
                    {settings.hasPasscode ? "Change" : "Set passcode"}
                  </Button>
                  {settings.hasPasscode && (
                    <Button size="sm" variant="ghost" onClick={remove}>
                      Remove
                    </Button>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {settings.hasPasscode ? `A quick code for coming back from a break.${settings.hasPassword ? " Your password works too." : ""}` : "Set one to use screen lock: it's how you get back in after locking."}
              </p>
            </>
          ) : (
            <PasscodeForm
              initialLength={settings.passcodeLength ?? 4}
              className="space-y-3 rounded-lg border p-3"
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                router.refresh()
              }}
            />
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Auto-lock</h3>
          <Select label="Lock automatically when idle" value={settings.autoLockMinutes} onChange={setAutoLock} options={AUTO_LOCK} disabled={!canUnlock} />
          <p className="text-xs text-muted-foreground">{canUnlock ? "Locks after this long without using the mouse or keyboard. Every open tab locks together." : "Set a passcode first, so you can unlock the screen."}</p>
        </div>
      </div>
    </section>
  )
}
