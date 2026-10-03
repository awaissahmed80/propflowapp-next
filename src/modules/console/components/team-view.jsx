"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { CONSOLE_AREAS, INVITABLE_ROLES, PLATFORM_ROLES, roleLabel } from "../roles"
import { changeRole, inviteMember, resendInvite, revokeInvite, setMemberActive } from "../server/team"
import { LinkSentDialog } from "@/components/link-sent-dialog"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { Notice } from "./parts"

const roleOptions = INVITABLE_ROLES.map((r) => ({ value: r, label: PLATFORM_ROLES[r].label }))

function InviteDialog({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", email: "", role: "support" })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (key) => (v) => {
    setForm((f) => ({ ...f, [key]: v }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const submit = (e) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await inviteMember(form)
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onDone(result, form.email.trim().toLowerCase())
    })
  }
  const role = PLATFORM_ROLES[form.role]
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Invite to the team"
      description="They get an email with a link to set up their account and join the console."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={pending} leftIcon="send-plane-line">
            Send invitation
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Name" autoFocus value={form.name} onChange={(e) => set("name")(e.target.value)} error={errors.name} />
        <Input label="Email" type="email" placeholder="name@propflowapp.com" value={form.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />
        <Select label="Role" value={form.role} onChange={set("role")} options={roleOptions} error={errors.role} />
        {role && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">{role.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">Sees: {role.view.map((a) => CONSOLE_AREAS[a]).join(", ")}</p>
          </div>
        )}
      </form>
    </Dialog>
  )
}

export function TeamView({ team, invites, currentUserId, manage }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null) // "invite" | { result, email }
  const [pending, startTransition] = useTransition()

  // Run an action behind a loading toast, then show its outcome (a toast, or the link dialog
  // after a resend) and reload the lists
  const run = (fn, success) =>
    startTransition(async () => {
      const result = await toastAction(fn, { loading: "Working on it…", success: success.text })
      if (!result?.error) {
        if (result?.link) setDialog({ result, email: success.email })
        router.refresh()
      }
    })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Team"
        description="PropFlow staff who can sign in to the console"
        actions={
          manage && (
            <Button leftIcon="user-add-line" onClick={() => setDialog("invite")}>
              Invite member
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard title={`People · ${team.length}`} bodyClassName="p-0">
            <ul className="divide-y">
              {team.map((u) => {
                const locked = !manage || u.role === "owner" || u.id === currentUserId
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={u.name} source={u.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        {u.name}
                        {u.id === currentUserId && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {u.email} · since {formatDate(u.createdAt)}
                      </span>
                    </span>
                    {!u.isActive && <Badge color="gray">Access removed</Badge>}
                    {locked ? (
                      <Badge color={u.role === "owner" ? "violet" : "gray"}>{roleLabel(u.role)}</Badge>
                    ) : (
                      <>
                        <Select
                          aria-label={`Role for ${u.name}`}
                          size="sm"
                          triggerClassName="w-36"
                          value={u.role}
                          options={roleOptions}
                          onChange={async (role) =>
                            (await confirm({
                              title: `Make ${u.name} ${roleLabel(role)}?`,
                              description: "What they can see and do in the console changes straight away.",
                              confirmLabel: "Change role",
                              icon: "shield-user-line",
                            })) && run(() => changeRole(u.id, role), { text: `${u.name} is now ${roleLabel(role)}.` })
                          }
                        />
                        <DropdownMenu
                          align="end"
                          items={[
                            u.isActive
                              ? {
                                  label: "Remove console access",
                                  icon: "user-unfollow-line",
                                  variant: "destructive",
                                  onClick: async () =>
                                    (await confirm({
                                      title: `Remove ${u.name}'s console access?`,
                                      description: "They're signed out and can't sign in to the console until you restore their access.",
                                      confirmLabel: "Remove access",
                                      destructive: true,
                                      icon: "user-unfollow-line",
                                    })) && run(() => setMemberActive(u.id, false), { text: `${u.name} can no longer sign in to the console.` }),
                                }
                              : {
                                  label: "Restore console access",
                                  icon: "user-follow-line",
                                  onClick: () => run(() => setMemberActive(u.id, true), { text: `${u.name} can sign in to the console again.` }),
                                },
                          ]}
                          trigger={<Button variant="ghost" size="icon" aria-label={`More for ${u.name}`} leftIcon="more-2-line" disabled={pending} />}
                        />
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </SectionCard>

          {manage && (
            <SectionCard title={`Pending invitations · ${invites.length}`} bodyClassName="p-0">
              {invites.length ? (
                <ul className="divide-y">
                  {invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon name="mail-send-line" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{i.name || i.email}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {i.email} · {roleLabel(i.consoleRole)} · invited by {i.invitedByName} {formatDate(i.createdAt)}
                        </span>
                      </span>
                      {i.expired ? <Badge color="amber">Expired</Badge> : <span className="text-xs text-muted-foreground">Expires {formatDate(i.expiresAt)}</span>}
                      <Button size="sm" variant="outline" leftIcon="send-plane-line" disabled={pending} onClick={() => run(() => resendInvite(i.id), { email: i.email })}>
                        Resend
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon="link"
                        disabled={pending}
                        title="Makes a new link to copy and share, without emailing it"
                        onClick={() => run(() => resendInvite(i.id, { send: false }), { email: i.email })}
                      >
                        Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon="close-line"
                        disabled={pending}
                        onClick={async () =>
                          (await confirm({
                            title: `Cancel the invitation to ${i.email}?`,
                            description: "The link in their email stops working. You can invite them again later.",
                            confirmLabel: "Cancel invitation",
                            cancelLabel: "Keep it",
                            destructive: true,
                            icon: "mail-close-line",
                          })) && run(() => revokeInvite(i.id), { text: `Invitation to ${i.email} canceled.` })
                        }
                      >
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No invitations waiting.</p>
              )}
            </SectionCard>
          )}
        </div>

        <SectionCard title="What each role can do" className="self-start" bodyClassName="p-0">
          <ul className="divide-y text-sm">
            {Object.entries(PLATFORM_ROLES).map(([id, r]) => (
              <li key={id}>
                {/* Collapsed by default so the card stays short; open a role to see its access */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 select-none hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.label}</span>
                      <span className="block text-xs text-muted-foreground">{r.description}</span>
                    </span>
                    <Icon name="arrow-down-s-line" className="mt-0.5 text-base text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="space-y-1 px-4 pb-3">
                    {Object.entries(CONSOLE_AREAS).map(([area, label]) => {
                      const change = r.manage.includes(area)
                      const see = r.view.includes(area)
                      return (
                        <li key={area} className={see ? "flex items-center gap-1.5" : "flex items-center gap-1.5 text-muted-foreground/50"}>
                          <Icon name={change ? "edit-line" : see ? "eye-line" : "close-line"} className={change ? "text-primary" : see ? "text-muted-foreground" : ""} />
                          {label}
                          <span className="ml-auto text-xs text-muted-foreground">{change ? "Change" : see ? "View" : ""}</span>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {dialog === "invite" && (
        <InviteDialog
          onClose={() => setDialog(null)}
          onDone={(result, email) => {
            setDialog({ result, email })
            router.refresh()
          }}
        />
      )}
      {dialog?.result && <LinkSentDialog result={dialog.result} email={dialog.email} days={7} onClose={() => setDialog(null)} />}
    </div>
  )
}
