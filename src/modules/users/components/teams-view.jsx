"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { labelOf } from "@/modules/lookups/options"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ColorPicker } from "@/components/ui/color-picker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_TEAM_COLOR, teamColor } from "../constants"
import { deleteTeam, saveTeam } from "../server/teams"
import { Notice } from "./user-parts"
import { memberHref } from "../links"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0)

function Progress({ label, achieved, target, format = number }) {
  const p = pct(achieved, target)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{format(achieved)}</span>
          <span className="text-muted-foreground"> / {format(target)}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", p >= 100 ? "bg-emerald-500" : p >= 60 ? "bg-primary" : "bg-amber-500")} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

function TeamDialog({ team, members, lists, onClose, onSaved }) {
  // Dealer logins belong to their firm, not to teams
  const staff = members.filter((m) => m.status === "active" && !m.dealerId)
  const [form, setForm] = useState(() => ({
    name: team?.name ?? "",
    color: team ? teamColor(team.color) : DEFAULT_TEAM_COLOR,
    description: team?.description ?? "",
    leadId: team?.leadId ? String(team.leadId) : "",
    memberIds: team ? team.members.map((m) => m.id).filter((id) => id !== team.leadId) : [],
    target: team?.target ?? { bookings: 10, value: 100_000_000 },
  }))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const toggleMember = (id) => set("memberIds", form.memberIds.includes(id) ? form.memberIds.filter((x) => x !== id) : [...form.memberIds, id])

  const submit = () =>
    startTransition(async () => {
      setError("")
      const result = await saveTeam(form, team?.id)
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onSaved()
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-2xl"
      scrollable
      title={team ? `Edit ${team.name}` : "New team"}
      description="A sales team with a lead, its members and a monthly target."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="save-3-line" loading={pending} onClick={submit}>
            {team ? "Save team" : "Create team"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 p-px sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <Input label="Team name" required autoFocus placeholder="e.g. DHA Sales Team" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
        <ColorPicker label="Colour" value={form.color} onChange={(v) => set("color", v)} />
        <div className="sm:col-span-2">
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} />
        </div>
        <Select
          label="Team lead"
          value={form.leadId}
          onChange={(v) => setForm((f) => ({ ...f, leadId: v, memberIds: f.memberIds.filter((id) => String(id) !== v) }))}
          options={[{ value: "", label: "No lead" }, ...staff.map((m) => ({ value: String(m.id), label: m.name }))]}
          error={errors.leadId}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Monthly bookings" min={0} value={form.target.bookings} onChange={(v) => set("target", { ...form.target, bookings: v ?? 0 })} />
          <NumberInput
            label="Monthly value"
            prefix="Rs"
            min={0}
            step={5_000_000}
            format={{ notation: "compact", maximumFractionDigits: 1 }}
            value={form.target.value}
            onChange={(v) => set("target", { ...form.target, value: v ?? 0 })}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-base text-muted-foreground">Members</p>
          <ScrollView className="max-h-64 rounded-lg border" viewportClassName="divide-y">
            {staff
              .filter((m) => String(m.id) !== form.leadId)
              .map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
                  <Checkbox checked={form.memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} aria-label={m.name} />
                  <Avatar name={m.name} source={m.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {labelOf(lists.designation, m.designation) ?? m.role}
                      {m.team && m.team.id !== team?.id ? ` · now in ${m.team.name}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            {staff.length <= 1 && <p className="px-3 py-4 text-sm text-muted-foreground">Invite people to the workspace to add them to teams.</p>}
          </ScrollView>
          <p className="mt-1 text-xs text-muted-foreground">People belong to one team; adding someone moves them here.</p>
        </div>
      </div>
    </Dialog>
  )
}

function TeamCard({ team, allowed, onEdit, onDelete }) {
  const items = [
    ...(allowed.edit ? [{ label: "Edit team", icon: "edit-line", onClick: onEdit }] : []),
    ...(allowed.edit && allowed.remove ? [{ type: "separator" }] : []),
    ...(allowed.remove ? [{ label: "Delete team", icon: "delete-bin-6-line", variant: "destructive", onClick: onDelete }] : []),
  ]
  const others = team.members.filter((m) => m.id !== team.leadId)
  return (
    <article className="flex flex-col rounded-xl border bg-background p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: teamColor(team.color) }} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{team.name}</h3>
          {team.description && <p className="mt-0.5 text-sm text-muted-foreground">{team.description}</p>}
        </div>
        {items.length > 0 && <DropdownMenu align="end" items={items} trigger={<Button variant="ghost" size="icon" leftIcon="more-2-line" aria-label={`${team.name} actions`} />} />}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {team.lead ? (
          <Link href={memberHref(team.lead.code)} className="flex min-w-0 items-center gap-2 text-sm hover:text-primary">
            <Avatar name={team.lead.name} source={team.lead.avatarUrl} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{team.lead.name}</span>
              <span className="block text-xs text-muted-foreground">Team lead</span>
            </span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">No team lead</span>
        )}
        <div className="ml-auto flex -space-x-2">
          {others.slice(0, 5).map((m) => (
            <Link key={m.id} href={memberHref(m.code)} title={m.name} className="rounded-full ring-2 ring-background">
              <Avatar name={m.name} source={m.avatarUrl} size="sm" />
            </Link>
          ))}
          {others.length > 5 && <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background">+{others.length - 5}</span>}
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t pt-4">
        <Progress label="Bookings this month" achieved={team.achieved.bookings} target={team.target.bookings} />
        <Progress label="Booking value" achieved={team.achieved.value} target={team.target.value} format={(n) => formatPkr(n)} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {team.members.length} {team.members.length === 1 ? "person" : "people"}
      </p>
    </article>
  )
}

// Teams: cards with lead, members and progress against the monthly target
export function TeamsView({ teams, members, lists, allowed }) {
  const router = useRouter()
  const [editing, setEditing] = useState(null) // team | "new"
  const [deleting, setDeleting] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, startTransition] = useTransition()
  const unassigned = members.filter((m) => !m.teamId && !m.dealerId && m.status === "active" && !m.isOwner)

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teams"
        description={`${teams.length} sales ${teams.length === 1 ? "team" : "teams"} with their leads, members and monthly targets`}
        actions={
          allowed.edit && (
            <Button leftIcon="add-line" onClick={() => setEditing("new")}>
              New team
            </Button>
          )
        }
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <ScrollView className="-mx-1 min-h-0 flex-1" viewportClassName="px-1 pt-1 pb-2">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} allowed={allowed} onEdit={() => setEditing(t)} onDelete={() => setDeleting(t)} />
          ))}
          {allowed.edit ? (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex min-h-52 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="team-line" className="text-2xl" />
              New team
            </button>
          ) : (
            !teams.length && <p className="text-sm text-muted-foreground">No teams yet.</p>
          )}
        </div>
        {unassigned.length > 0 && teams.length > 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Not in any team:{" "}
            {unassigned.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ", "}
                <Link href={memberHref(m.code)} className="text-primary hover:underline">
                  {m.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </ScrollView>

      {editing && (
        <TeamDialog
          team={editing === "new" ? null : editing}
          members={members}
          lists={lists}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setMessage({ tone: "success", text: editing === "new" ? "Team created." : "Team saved." })
            setEditing(null)
            router.refresh()
          }}
        />
      )}
      {deleting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          className="sm:max-w-md"
          title={`Delete ${deleting.name}?`}
          description={`Its ${deleting.members.length} ${deleting.members.length === 1 ? "member stays" : "members stay"} in the workspace without a team.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                leftIcon="delete-bin-6-line"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteTeam(deleting.id)
                    setMessage(result.error ? { tone: "error", text: result.error } : { tone: "success", text: `${deleting.name} deleted.` })
                    setDeleting(null)
                    router.refresh()
                  })
                }
              >
                Delete team
              </Button>
            </>
          }
        />
      )}
    </div>
  )
}
