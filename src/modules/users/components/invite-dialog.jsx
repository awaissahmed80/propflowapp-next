"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { defaultValue } from "@/modules/lookups/options"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { LinkSentDialog } from "@/components/link-sent-dialog"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { inviteMember } from "../server/members"
import { Notice, seatsText } from "./user-parts"

// Invite someone to the workspace. They get an email link to join with a password or Google
// (or their existing PropFlow account). Data comes from the page: roles they may give, teams,
// lists (designation, department) and seats.
function InviteDialog({ options, workspaceName, onClose, onInvited }) {
  const { roles, teams, lists, seats } = options
  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    roleId: String(roles.find((r) => r.code === "sales-agent")?.id ?? roles[0]?.id ?? ""),
    teamId: "",
    // Each list's default (Lists & Labels)
    designation: defaultValue(lists.designation) ?? "",
    department: defaultValue(lists.department) ?? "",
  }))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (key) => (v) => {
    setForm((f) => ({ ...f, [key]: v }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setError("")
  }
  const full = Boolean(seats.limit && seats.used >= seats.limit)

  const submit = (e) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await inviteMember(form)
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onInvited(result, form.email.trim().toLowerCase())
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-xl"
      title="Invite to workspace"
      description={`${workspaceName} · They'll get an email link to join. Invitations expire after 7 days.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-member" leftIcon="mail-send-line" loading={pending} disabled={full}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id="invite-member" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <Input label="Full name" required autoFocus value={form.name} onChange={(e) => set("name")(e.target.value)} error={errors.name} />
        <Input label="Work email" required type="email" placeholder="name@company.pk" value={form.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />
        <Select label="Role" value={form.roleId} onChange={set("roleId")} options={roles.map((r) => ({ value: String(r.id), label: r.name }))} error={errors.roleId} />
        <Select label="Team" value={form.teamId} onChange={set("teamId")} options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))]} error={errors.teamId} />
        <LookupSelect list="designation" values={lists.designation} canAdd={options.canAddLists} app="users" label="Designation" empty="Not set" value={form.designation} onChange={set("designation")} error={errors.designation} />
        <LookupSelect list="department" values={lists.department} canAdd={options.canAddLists} app="users" label="Department" empty="Not set" value={form.department} onChange={set("department")} error={errors.department} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
          <Icon name="group-line" />
          {seatsText(seats)}
          {full && <span className="font-medium text-destructive"> · Upgrade to invite more people</span>}
        </p>
      </form>
    </Dialog>
  )
}

// "Invite people" button with the dialog, then the sent / copy-link dialog
export function InviteButton({ options, workspaceName, label = "Invite people", ...props }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(null) // { result, email }
  return (
    <>
      <Button leftIcon="user-add-line" onClick={() => setOpen(true)} {...props}>
        {label}
      </Button>
      {open && (
        <InviteDialog
          options={options}
          workspaceName={workspaceName}
          onClose={() => setOpen(false)}
          onInvited={(result, email) => {
            setOpen(false)
            setSent({ result, email })
            router.refresh()
          }}
        />
      )}
      {sent && <LinkSentDialog result={sent.result} email={sent.email} days={7} onClose={() => setSent(null)} />}
    </>
  )
}
