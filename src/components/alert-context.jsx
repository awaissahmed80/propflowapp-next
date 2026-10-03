"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// The app's alert and confirm boxes (shadcn style), in place of the browser's. Mounted once in
// the root layout. Both return promises, so they read like the JavaScript ones:
//
//   const { confirm, alert } = useAlert()
//   if (!(await confirm({ title: "Delete this page?", description: "…", confirmLabel: "Delete", destructive: true }))) return
//   await alert({ title: "Saved", description: "…" })
//
// Outside components (or anywhere on the client) the same calls work as plain functions:
//   import { confirm, alert } from "@/components/alert-context"
// window.alert() also opens the app's box. (window.confirm stays the browser's: it has to answer
// synchronously, which a styled dialog can't; use confirm() from here instead.)
//
// confirm options: title, description, confirmLabel ("Continue"), cancelLabel ("Cancel"),
//   destructive (red button + icon), icon, tone, typeToConfirm (the word to type first, for the
//   most dangerous actions) → true | false
// alert options: title, description, okLabel ("OK"), icon, tone → resolves when closed

const AlertContext = createContext(null)
let opener = null // the mounted provider, for the plain-function calls

const ask = (request) =>
  new Promise((resolve) => {
    if (!opener) return resolve(request.kind === "confirm" ? false : undefined)
    opener({ ...request, resolve })
  })

export const confirm = (options = {}) => ask({ kind: "confirm", ...(typeof options === "string" ? { title: options } : options) })
export const alert = (options = {}) => ask({ kind: "alert", ...(typeof options === "string" ? { title: options } : options) })

export function useAlert() {
  return useContext(AlertContext) ?? { confirm, alert }
}

function Box({ request, onDone }) {
  const [typed, setTyped] = useState("")
  const isConfirm = request.kind === "confirm"
  const tone = request.tone ?? (request.destructive ? "destructive" : isConfirm ? "warning" : "default")
  const icon = request.icon ?? (request.destructive ? "delete-bin-line" : isConfirm ? "question-line" : "information-line")
  const blocked = Boolean(request.typeToConfirm) && typed.trim().toLowerCase() !== String(request.typeToConfirm).toLowerCase()
  const answer = (value) => onDone(isConfirm ? value : undefined)
  return (
    <AlertDialog
      open
      onOpenChange={(open) => !open && answer(false)}
      tone={tone}
      icon={icon}
      title={request.title ?? (isConfirm ? "Are you sure?" : "Notice")}
      description={request.description}
      actions={
        isConfirm ? (
          <>
            <Button variant="outline" onClick={() => answer(false)}>
              {request.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={request.destructive ? "destructive" : "default"} disabled={blocked} autoFocus={!request.typeToConfirm} onClick={() => answer(true)}>
              {request.confirmLabel ?? "Continue"}
            </Button>
          </>
        ) : (
          <Button autoFocus onClick={() => answer()}>
            {request.okLabel ?? "OK"}
          </Button>
        )
      }
    >
      {request.typeToConfirm && (
        <form
          className="mt-4 space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!blocked) answer(true)
          }}
        >
          <p className="text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">{request.typeToConfirm}</span> to confirm.
          </p>
          <Input size="sm" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={`Type ${request.typeToConfirm} to confirm`} />
        </form>
      )}
    </AlertDialog>
  )
}

export function AlertProvider({ children }) {
  // One box at a time; more requests wait their turn
  const [queue, setQueue] = useState([])
  const original = useRef(null)
  const open = useCallback((request) => setQueue((q) => [...q, request]), [])

  useEffect(() => {
    opener = open
    // window.alert("…") opens the app's box too
    original.current = window.alert
    window.alert = (message) => {
      alert({ title: String(message ?? "") })
    }
    return () => {
      if (opener === open) opener = null
      if (original.current) window.alert = original.current
    }
  }, [open])

  const current = queue[0]
  const done = (value) => {
    current.resolve(value)
    setQueue((q) => q.slice(1))
  }
  return (
    <AlertContext.Provider value={{ confirm, alert }}>
      {children}
      {current && <Box key={queue.length + (current.title ?? "")} request={current} onDone={done} />}
    </AlertContext.Provider>
  )
}
