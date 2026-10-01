"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { activeOptions, labelOf } from "@/modules/lookups/options"
import { AppIcon } from "@/components/app-icon"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Tabs } from "@/components/ui/tabs"
import { ACTION_LABELS, actionsIn } from "../permissions"
import { ACTIVITY_TYPES, lastActive } from "../constants"
import { removeMember, setMemberStatus, updateMember, updateMemberPhone } from "../server/members"
import { InlinePhone } from "@/components/inline-phone"
import { MemberStatusBadge, Notice, RoleBadge, TeamChip } from "./user-parts"

const TYPE = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.value, t]))

// Apps and actions the role allows, among the workspace's apps
function AccessList({ role, apps }) {
  const rows = apps.map((app) => ({ app, actions: actionsIn(role?.permissions, app.code) })).filter((r) => r.actions.length)
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">This role can&apos;t open any app yet, apart from My Desk.</p>
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map(({ app, actions }) => (
        <li key={app.code} className="flex items-center gap-3 px-3 py-2">
          <AppIcon icon={app.icon} color={app.color} size="sm" className="size-7 rounded-md text-sm" />
          <span className="min-w-0 flex-1 truncate text-sm">{app.name}</span>
          <span className="flex flex-wrap justify-end gap-1">
            {actions.map((a) => (
              <span key={a} className="rounded border px-1.5 text-[11px] text-muted-foreground">
                {ACTION_LABELS[a]}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

// One labelled value in the profile
function Field({ icon, label, children, className }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
        <Icon name={icon} />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium whitespace-nowrap">{children}</div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

// A profile value that someone allowed to edit can change in place: click it, pick from the list,
// and it saves straight away.
//   options: [{ value, label }]; display: what to show (defaults to the option's label)
//   empty: label for "none" (e.g. "No team"), or null when a value is required (Role)
function InlineSelect({ options, value, display, label, editable, empty = "Not set", onSave }) {
  const [pending, startTransition] = useTransition()
  const current = value ? String(value) : ""
  const shown = display ?? options.find((o) => o.value === current)?.label ?? <span className="font-normal text-muted-foreground">{empty ?? "Not set"}</span>
  if (!editable) return shown
  const pick = (v) => v !== current && startTransition(() => onSave(v || null))
  return (
    <DropdownMenu
      align="start"
      className="max-h-[min(20rem,var(--available-height))] w-56"
      items={[
        ...(empty
          ? [
              {
                label: empty,
                icon: "close-line",
                selected: !current,
                onClick: () => pick(""),
              },
              { type: "separator", key: "sep" },
            ]
          : []),
        ...options.map((o) => ({
          key: o.value,
          label: o.label,
          selected: o.value === current,
          onClick: () => pick(o.value),
        })),
      ]}
      trigger={
        <button
          type="button"
          aria-label={`Change ${label.toLowerCase()}`}
          disabled={pending}
          className="group/inline -mx-1.5 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted"
        >
          <span className="whitespace-nowrap">{shown}</span>
          <Icon
            name={pending ? "loader-4-line" : "pencil-line"}
            className={cn("shrink-0 text-xs text-muted-foreground", pending ? "animate-spin" : "opacity-0 group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100 group-data-popup-open/inline:opacity-100")}
          />
        </button>
      }
    />
  )
}

// Active list values, plus the person's current one if it has since been switched off
function listOptions(list, value) {
  const opts = activeOptions(list)
  return value && !opts.some((o) => o.value === value) ? [...opts, { value, label: labelOf(list, value) ?? value }] : opts
}

// Status in place: Active or Suspended (suspending signs them out of this workspace)
function InlineStatus({ status, statuses, editable, onSave }) {
  const [pending, startTransition] = useTransition()
  const badge = <MemberStatusBadge status={status} statuses={statuses} />
  if (!editable) return badge
  const choices = statuses.filter((s) => ["active", "suspended"].includes(s.value))
  return (
    <DropdownMenu
      align="start"
      className="w-56"
      items={choices.map((c) => ({
        key: c.value,
        label: <MemberStatusBadge status={c.value} statuses={statuses} />,
        selected: c.value === status,
        onClick: () => c.value !== status && startTransition(() => onSave(c.value)),
      }))}
      trigger={
        <button
          type="button"
          aria-label="Change status"
          disabled={pending}
          className="group/inline -mx-1.5 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted"
        >
          {badge}
          <Icon
            name={pending ? "loader-4-line" : "pencil-line"}
            className={cn("shrink-0 text-xs text-muted-foreground", pending ? "animate-spin" : "opacity-0 group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100 group-data-popup-open/inline:opacity-100")}
          />
        </button>
      }
    />
  )
}

// The person at a glance: summary strip, then contact, work and account details
function ProfileTab({ member, lists, options, now, editable, roleEditable, roleHint, statusEditable, phoneEditable, onSaveField, onSaveStatus, onSavePhone }) {
  const summary = [
    {
      label: "Role",
      value: member.role,
      icon: member.isOwner ? "vip-crown-line" : "shield-user-line",
    },
    {
      label: "Team",
      value: member.team ? <TeamChip team={member.team} /> : "No team",
      icon: "team-line",
    },
    {
      label: "Joined",
      value: member.joinedAt ? formatDate(member.joinedAt) : "—",
      icon: "calendar-check-line",
    },
    {
      label: "Last active",
      value: lastActive(member.lastActiveAt, now),
      icon: "pulse-line",
    },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="bg-background p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name={s.icon} /> {s.label}
            </p>
            <div className="mt-1 truncate text-sm font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
      <Section title="Contact">
        <Field icon="mail-line" label="Email">
          <a href={`mailto:${member.email}`} className="text-primary hover:underline">
            {member.email}
          </a>
        </Field>
        <Field icon="phone-line" label="Mobile">
          <InlinePhone value={member.phone} editable={phoneEditable} onSave={onSavePhone} />
        </Field>
      </Section>
      <Section title="Work">
        <Field icon={member.isOwner ? "vip-crown-line" : "shield-user-line"} label="Role">
          <InlineSelect
            options={
              roleEditable
                ? options.roles.map((r) => ({
                    value: String(r.id),
                    label: r.name,
                  }))
                : []
            }
            value={member.roleId}
            display={member.role}
            label="Role"
            empty={null}
            editable={roleEditable}
            onSave={(v) => onSaveField("roleId", v)}
          />
          {roleHint && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{roleHint}</p>}
        </Field>
        {member.dealer ? (
          <Field icon="shake-hands-line" label="Dealer">
            <Link href="/users/dealers" className="hover:text-primary hover:underline">
              {member.dealer.name}
            </Link>
          </Field>
        ) : (
          <Field icon="team-line" label="Team">
            <InlineSelect
              options={options.teams.map((t) => ({
                value: String(t.id),
                label: t.name,
              }))}
              value={member.teamId}
              display={member.team ? <TeamChip team={member.team} /> : null}
              label="Team"
              empty="No team"
              editable={editable}
              onSave={(v) => onSaveField("teamId", v)}
            />
          </Field>
        )}
        <Field icon="briefcase-4-line" label="Designation">
          <InlineSelect options={listOptions(lists.designation, member.designation)} value={member.designation} label="Designation" editable={editable} onSave={(v) => onSaveField("designation", v)} />
        </Field>
        <Field icon="building-4-line" label="Department">
          <InlineSelect options={listOptions(lists.department, member.department)} value={member.department} label="Department" editable={editable} onSave={(v) => onSaveField("department", v)} />
        </Field>
        <Field icon="hashtag" label="Member code">
          <span className="font-mono text-[13px]">{member.code}</span>
        </Field>
      </Section>
      <Section title="Account">
        <Field icon="shield-check-line" label="Status">
          <InlineStatus status={member.status} statuses={lists["member-status"]} editable={statusEditable} onSave={onSaveStatus} />
        </Field>
        <Field icon="login-circle-line" label="Last active">
          {lastActive(member.lastActiveAt, now)}
        </Field>
      </Section>
    </div>
  )
}

const formOf = (m) => ({
  roleId: String(m.roleId),
  teamId: m.teamId ? String(m.teamId) : "",
  designation: m.designation ?? "",
  department: m.department ?? "",
})

// A person's profile in a modal: Profile (role, team, designation, department and status edit in
// place for those allowed), Access and Activity tabs.
// profile: { member, activity, apps } from the page (?member=mem-00001)
export function MemberDialog({ profile, roles, options, lists, allowed, currentUserId, viewerIsOwner, onClose }) {
  const { member, activity, apps } = profile
  const router = useRouter()
  const self = member.id === currentUserId
  const [tab, setTab] = useState("profile")
  const [message, setMessage] = useState(null) // { tone, text }
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pending, startTransition] = useTransition()
  const [now] = useState(() => Date.now())

  // The owner's account is theirs alone; nobody changes their own role
  const canEdit = allowed.edit && (!member.isOwner || viewerIsOwner)
  const roleEditable = canEdit && !member.isOwner && !self && !member.dealerId && options.roles.some((r) => r.id === member.roleId)
  const roleHint = member.isOwner ? "The owner always has full access." : self ? "You can't change your own role." : member.dealerId ? "Dealer logins always have the Dealer role." : null

  // Run an action, show the outcome, reload the page data (the modal stays open)
  const run = (fn, success, after) =>
    startTransition(async () => {
      setMessage(null)
      const result = await fn()
      if (result?.error) setMessage({ tone: "error", text: result.error })
      else {
        if (success) setMessage({ tone: "success", text: success })
        if (after) after()
        else router.refresh()
      }
    })

  // Inline edits on the Profile tab: save one field, keep the rest as stored
  const saveField = async (key, value) => {
    setMessage(null)
    const result = await updateMember(member.id, {
      ...formOf(member),
      [key]: value ?? "",
    })
    if (result?.error || result?.fieldErrors)
      setMessage({
        tone: "error",
        text: result.error ?? Object.values(result.fieldErrors)[0],
      })
    else {
      const names = {
        roleId: "Role",
        teamId: "Team",
        designation: "Designation",
        department: "Department",
      }
      setMessage({
        tone: "success",
        text: `${names[key]} updated.${key === "roleId" ? " It applies the next time they open an app." : ""}`,
      })
      router.refresh()
    }
  }

  // Returns the result so the field can show its own error
  const savePhone = async (phone) => {
    setMessage(null)
    const result = await updateMemberPhone(member.id, phone)
    if (!result?.error) {
      setMessage({ tone: "success", text: "Mobile number updated." })
      router.refresh()
    }
    return result
  }

  const saveStatus = async (status) => {
    setMessage(null)
    const result = await setMemberStatus(member.id, status)
    if (result?.error) setMessage({ tone: "error", text: result.error })
    else {
      setMessage({
        tone: "success",
        text: status === "suspended" ? `${member.name} is suspended and signed out of this workspace.` : `${member.name} can sign in again.`,
      })
      router.refresh()
    }
  }

  const role = roles.find((r) => r.id === member.roleId)

  // Owner and Administrator accounts can't be suspended; nobody suspends themselves
  const canChangeStatus = allowed.edit && !member.isOwner && member.roleCode !== "admin" && !self
  const manage = allowed.edit && !member.isOwner && !self
  const headerActions = manage && (
    <>
      {!canChangeStatus ? null : member.status === "suspended" ? (
        <Button size="sm" variant="outline" leftIcon="user-follow-line" disabled={pending} onClick={() => run(() => setMemberStatus(member.id, "active"), `${member.name} can sign in again.`)}>
          Reactivate
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          leftIcon="user-forbid-line"
          disabled={pending}
          onClick={() => run(() => setMemberStatus(member.id, "suspended"), `${member.name} is suspended and signed out of this workspace.`)}
        >
          Suspend
        </Button>
      )}
      {allowed.remove && (
        <DropdownMenu
          align="end"
          items={[
            {
              label: "Remove from workspace",
              icon: "user-unfollow-line",
              variant: "destructive",
              onClick: () => setConfirmRemove(true),
            },
          ]}
          trigger={<Button variant="ghost" size="smicon" leftIcon="more-2-line" aria-label="More actions" />}
        />
      )}
    </>
  )

  const tabs = [
    {
      value: "profile",
      label: "Profile",
      icon: "user-3-line",
      content: (
        <ProfileTab
          member={member}
          lists={lists}
          options={options}
          now={now}
          editable={canEdit}
          roleEditable={roleEditable}
          roleHint={roleHint}
          statusEditable={canChangeStatus}
          phoneEditable={canEdit || self}
          onSavePhone={savePhone}
          onSaveField={saveField}
          onSaveStatus={saveStatus}
        />
      ),
    },
    {
      value: "access",
      label: "Access",
      icon: "apps-2-line",
      content: (
        <div className="space-y-2 pt-2">
          <p className="text-sm text-muted-foreground">
            What {member.name.split(" ")[0]} can open with the {member.role} role.{" "}
            <Link href="/users/roles" className="text-primary hover:underline">
              Roles & permissions
            </Link>
          </p>
          <AccessList role={role} apps={apps} />
        </div>
      ),
    },
    {
      value: "activity",
      label: "Activity",
      icon: "history-line",
      count: activity.length || null,
      content: activity.length ? (
        <ul className="divide-y rounded-lg border">
          {activity.map((a) => (
            <li key={a.id} className="flex gap-3 px-3 py-2.5 text-sm">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon name={TYPE[a.type]?.icon ?? "history-line"} />
              </span>
              <span className="min-w-0">
                <span className="block">
                  <span className="font-medium">{a.actor?.id === member.id ? member.name.split(" ")[0] : (a.actor?.name ?? "Someone")}</span> {a.summary}
                </span>
                <span className="text-xs text-muted-foreground" title={formatDateTime(a.createdAt)}>
                  {timeAgo(a.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
      ),
    },
  ]

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        className="sm:max-w-3xl"
        scrollable
        title={
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={member.name} source={member.avatarUrl} size="lg" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate">{member.name}</span>
                <RoleBadge role={member.role} isOwner={member.isOwner} />
                <MemberStatusBadge status={member.status} statuses={lists["member-status"]} />
              </span>
              <span className="block truncate text-sm font-normal text-muted-foreground">{[labelOf(lists.designation, member.designation), member.email].filter(Boolean).join(" · ")}</span>
            </span>
          </span>
        }
        headerActions={headerActions}
      >
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Tabs value={tab} onChange={setTab} tabs={tabs} contentClassName="pt-3" />
      </Dialog>

      {confirmRemove && (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirmRemove(false)}
          className="sm:max-w-md"
          title={`Remove ${member.name}?`}
          description="They lose access to this workspace straight away. Their records (leads, bookings, activity) stay and keep their name. You can invite them again later."
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                leftIcon="user-unfollow-line"
                loading={pending}
                onClick={() => {
                  setConfirmRemove(false)
                  run(() => removeMember(member.id), null, onClose)
                }}
              >
                Remove
              </Button>
            </>
          }
        />
      )}
    </>
  )
}
