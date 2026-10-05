"use client"

import { useMemo, useState, useTransition } from "react"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { leaveDays } from "../constants"
import { applyLeave, decideLeave } from "../server/actions"
import { daysLabel, pkToday } from "./people-parts"

// Apply for leave from HR: for anyone this person may see (canPickOthers), else for themselves.
//   employees: [{ code, name, isMe }] · balances: { [code]: [{ type, allowance, used, left }] }
//   approver: has hr.approve-leave (leave for someone else is recorded as approved)
//   fixed: an employee code to apply for (the employee's own page)
export function ApplyLeaveDialog({ employees, balances = {}, canPickOthers, approver = false, fixed = null, onClose, onDone }) {
  const types = useList("leave-type")
  const me = employees.find((e) => e.isMe)
  const initial = useMemo(
    () => ({ employee: fixed ?? (canPickOthers ? "" : (me?.code ?? "")), type: types.defaultValue ?? types.options[0]?.value ?? "", startOn: pkToday(), endOn: pkToday(), reason: "" }),
    [fixed, canPickOthers, me, types.defaultValue, types.options],
  )
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (p) => setF((x) => ({ ...x, ...p }))
  useUnsavedGuard(JSON.stringify(f) !== JSON.stringify(initial))
  const picked = employees.find((e) => e.code === f.employee)
  const balance = balances[f.employee]?.find((b) => b.type === f.type)
  const days = f.endOn >= f.startOn ? leaveDays(f.startOn, f.endOn) : 0
  const direct = approver && canPickOthers && picked && !picked.isMe
  const over = balance?.allowance != null && days > balance.left

  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => applyLeave({ ...f, employee: canPickOthers ? f.employee : null }), {
        loading: "Saving…",
        success: (x) => (x.approved ? `Leave recorded for ${picked?.name ?? "them"} (${x.code}).` : SENT_FOR_APPROVAL),
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onDone(r)
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title="Apply for leave"
      description={direct ? "Your role approves leave, so it's recorded as approved." : "It goes to someone who approves leave, in their Approvals inbox."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={direct ? "check-line" : "send-plane-line"} loading={pending} disabled={!f.employee || !f.type || !days} onClick={save}>
            {direct ? "Record leave" : "Send for approval"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {canPickOthers && !fixed && (
          <div className="sm:col-span-2">
            <Combobox
              label="Employee"
              placeholder="Search by name…"
              options={employees.map((e) => ({ value: e.code, label: e.isMe ? `${e.name} (you)` : e.name, description: e.code }))}
              value={f.employee || null}
              onChange={(v) => set({ employee: v ?? "" })}
              error={errors.employee}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm text-muted-foreground">Type</p>
          <ToggleGroup value={f.type} onChange={(v) => set({ type: v })} options={types.options.map((t) => ({ value: t.value, label: t.label.replace(/ leave$/i, "") }))} />
          {errors.type && <p className="mt-1 text-sm text-destructive">{errors.type}</p>}
          {balance && (
            <p className={over ? "mt-1.5 text-xs text-amber-700 dark:text-amber-400" : "mt-1.5 text-xs text-muted-foreground"}>
              {balance.allowance == null ? "A day's pay is deducted for each day of unpaid leave." : `${balance.left} of ${balance.allowance} days left this year${over ? ". This goes over the allowance." : "."}`}
            </p>
          )}
        </div>
        <DatePicker label="From" clearable={false} value={f.startOn} onChange={(v) => v && set({ startOn: v, endOn: f.endOn < v ? v : f.endOn })} error={errors.startOn} />
        <DatePicker label="To" clearable={false} value={f.endOn} onChange={(v) => v && set({ endOn: v })} error={errors.endOn} />
        <p className="text-sm text-muted-foreground sm:col-span-2">{days ? `${daysLabel(days)}, counting weekends and holidays` : "Ends before it starts."}</p>
        <div className="sm:col-span-2">
          <Textarea label="Reason" rows={2} maxLength={500} value={f.reason} onChange={(e) => set({ reason: e.target.value })} error={errors.reason} />
        </div>
      </div>
    </Dialog>
  )
}

// Not approving a leave request: the note is required, so they know why → onDone()
export function RejectLeaveDialog({ leave, onClose, onDone }) {
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()
  const ok = note.trim().length >= 3
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title={`Don't approve ${leave.employee.name}'s leave?`}
      description="They're told it wasn't approved, with your note."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            leftIcon="close-circle-line"
            loading={pending}
            disabled={!ok}
            onClick={() =>
              startTransition(async () => {
                const r = await toastAction(() => decideLeave(leave.code, "rejected", note.trim()), { loading: "Saving…", success: `${leave.employee.name}'s leave not approved.` })
                if (r?.ok) onDone()
              })
            }
          >
            Don&apos;t approve
          </Button>
        </>
      }
    >
      <Textarea label="Why" required rows={3} maxLength={500} placeholder="e.g. Site handover that week; take it the week after." value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  )
}
