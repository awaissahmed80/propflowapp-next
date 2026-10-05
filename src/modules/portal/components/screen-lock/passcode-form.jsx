"use client"

import { useState } from "react"
import { toastAction } from "@/lib/toast-action"
import { setLockPasscode } from "@/server/auth/lock-actions"
import { Button } from "@/components/ui/button"
import { OtpField } from "@/components/ui/input-otp"

// Choose a screen lock passcode: 4 or 6 digits, typed twice. Used in My Desk › Profile and in the
// "Set a passcode first" dialog when someone tries to lock without one.
//   onSaved(settings) after it's saved · onCancel: shows a Cancel button
export function PasscodeForm({ initialLength = 4, onSaved, onCancel, className }) {
  const [length, setLength] = useState(initialLength)
  const [first, setFirst] = useState(null) // passcode typed once, waiting for the repeat
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const restart = () => {
    setFirst(null)
    setCode("")
  }
  const complete = async (value) => {
    if (!first) {
      setFirst(value)
      setCode("")
      return
    }
    if (value !== first) {
      restart()
      setError("The passcodes didn't match. Start again.")
      return
    }
    setBusy(true)
    const r = await toastAction(() => setLockPasscode(value), { loading: "Saving passcode…", success: "Passcode saved." })
    setBusy(false)
    restart()
    if (r?.ok) onSaved?.(r.settings)
  }

  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Passcode length" className="inline-flex rounded-full border p-1 text-sm">
        {[4, 6].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={length === n}
            onClick={() => {
              setLength(n)
              restart()
              setError("")
            }}
            className={length === n ? "h-8 rounded-full bg-primary px-3 font-medium text-primary-foreground" : "h-8 rounded-full px-3 font-medium text-muted-foreground hover:text-foreground"}
          >
            {n} digits
          </button>
        ))}
      </div>
      <OtpField
        key={`${length}-${first ? "repeat" : "new"}`}
        label={first ? "Enter it again" : "Choose a passcode"}
        length={length}
        masked
        autoFocus
        disabled={busy}
        value={code}
        onChange={(v) => {
          setCode(v)
          setError("")
        }}
        onComplete={complete}
        error={error}
      />
      {(first || onCancel) && (
        <div className="flex justify-center gap-2">
          {first && (
            <Button size="sm" variant="ghost" onClick={restart}>
              Start again
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
