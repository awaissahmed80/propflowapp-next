"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"
import { ACTION_LABELS } from "@/modules/users/permissions"

// Pieces shared by the User Guide's front page and app pages.
//   role: { code, name, full, setup, mine } · grants: { key: bool }

export const allowed = (need, app, role, grants) => {
  if (!need || role.full) return true
  if (need.admin) return false
  if (need.setup) return role.setup
  if (need.action) return app.actions.includes(need.action)
  if (need.grant) return Boolean(grants[need.grant])
  return true
}
export const needText = (need, app, grantLabels) =>
  need.admin ? "Administrators only" : need.setup ? "Needs setup rights" : need.action ? `Needs ${ACTION_LABELS[need.action]} in ${app.name}` : `Needs “${grantLabels[need.grant] ?? need.grant}”`

// Guide links keep the role an administrator is viewing as
export const guideHref = (path, role) => (role.mine || !role.code ? path : `${path}?role=${encodeURIComponent(role.code)}`)

const grantValue = (g) => (g.value === true ? null : typeof g.value === "number" ? `up to ${g.value}%` : g.value === "own" ? "their own" : g.value === "all" ? "everyone's" : String(g.value))

// Administrators: see the guide as another role
export function RolePicker({ role, roles }) {
  const router = useRouter()
  const path = usePathname()
  if (!roles.length) return null
  return (
    <Select
      aria-label="See the guide as"
      className="w-60"
      value={role.code ?? ""}
      options={roles.map((r) => ({ value: r.code, label: `Guide for ${r.name}`, icon: "shield-user-line" }))}
      onChange={(v) => router.push(`${path}?role=${encodeURIComponent(v)}`)}
    />
  )
}

// What the role may do in an app: its actions, which records it sees and its special permissions
export function Access({ app, role }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/30 px-4 py-2.5 text-sm">
      <span className="font-medium">{role.full ? "Full access" : role.mine ? "Your access" : `${role.name}'s access`}</span>
      <span className="flex flex-wrap gap-1">
        {app.actions.map((a) => (
          <Badge key={a} color={a === "delete" ? "red" : a === "approve" ? "amber" : "gray"}>
            {ACTION_LABELS[a]}
          </Badge>
        ))}
      </span>
      {app.scope && (
        <span className="text-muted-foreground">
          <Icon name="eye-line" className="mr-1 align-[-2px]" />
          {app.scope.label} ({app.scope.noun})
        </span>
      )}
      {app.grants.length > 0 && (
        <span className="text-muted-foreground">
          <Icon name="key-2-line" className="mr-1 align-[-2px]" />
          {app.grants.map((g) => [g.label, grantValue(g)].filter(Boolean).join(": ")).join(" · ")}
        </span>
      )}
    </div>
  )
}

// One how-to: numbered steps and a link to the page (or what it needs, when the role can't)
export function TaskCard({ task, app, grantLabels }) {
  return (
    <article id={task.id} className={cn("flex scroll-mt-20 flex-col rounded-xl border bg-background p-4 shadow-xs", !task.ok && "border-dashed bg-muted/30")}>
      <h3 className={cn("font-medium", !task.ok && "text-muted-foreground")}>{task.title}</h3>
      <ol className="mt-2 flex-1 space-y-1.5 text-sm text-muted-foreground">
        {task.steps.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-foreground tabular-nums">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 border-t pt-3 text-sm">
        {task.ok ? (
          <Link href={task.to} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Go there <Icon name="arrow-right-line" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Icon name="lock-line" /> {needText(task.need, app, grantLabels)}
          </span>
        )}
      </div>
    </article>
  )
}

export function SectionTitle({ id, icon, title, text }) {
  return (
    <div id={id} className="scroll-mt-20">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Icon name={icon} className="text-primary" /> {title}
      </h2>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}
