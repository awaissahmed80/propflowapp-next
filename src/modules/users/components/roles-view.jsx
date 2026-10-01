"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BaseCheckbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Tabs } from "@/components/ui/tabs"
import { ACTIONS, ACTION_HINTS, ACTION_LABELS, roleAccess, toMatrix } from "../permissions"
import { deleteRole, saveRole } from "../server/roles"
import { RoleAccess } from "./role-access"
import { Notice } from "./user-parts"

// Apps × actions. Any action implies View; removing View removes everything in that app.
function Matrix({ apps, value, readOnly, onChange }) {
  const set = (app, actions) => {
    const withView = actions.length && !actions.includes("view") ? ["view", ...actions] : actions
    onChange({ ...value, [app]: ACTIONS.filter((a) => withView.includes(a)) })
  }
  const toggle = (app, action) => {
    const current = value[app] ?? []
    if (current.includes(action)) set(app, action === "view" ? [] : current.filter((a) => a !== action))
    else set(app, [...current, action])
  }
  // A column header toggles that action for every app
  const column = (action) => {
    const all = apps.every((a) => value[a.code]?.includes(action))
    const next = { ...value }
    for (const a of apps) {
      const current = next[a.code] ?? []
      next[a.code] = all ? (action === "view" ? [] : current.filter((x) => x !== action)) : ACTIONS.filter((x) => [...current, action, "view"].includes(x))
    }
    onChange(next)
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
        <tr>
          <th className="px-4 py-2 text-left font-medium">App</th>
          {ACTIONS.map((a) => (
            <th key={a} className="px-2 py-2 text-center font-medium" title={ACTION_HINTS[a]}>
              {readOnly ? (
                ACTION_LABELS[a]
              ) : (
                <button type="button" onClick={() => column(a)} className="cursor-pointer rounded px-1 hover:text-foreground" title={`Toggle ${ACTION_LABELS[a]} for every app`}>
                  {ACTION_LABELS[a]}
                </button>
              )}
            </th>
          ))}
          <th className="w-20 px-2 py-2 text-center font-medium">All</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {apps.map((app) => {
          const actions = value[app.code] ?? []
          const all = ACTIONS.every((a) => actions.includes(a))
          return (
            <tr key={app.code} className={cn(!actions.length && "text-muted-foreground")}>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2.5">
                  <AppIcon icon={app.icon} color={app.color} size="sm" className={cn("size-7 rounded-md text-sm", !actions.length && "opacity-50")} />
                  {app.name}
                </span>
              </td>
              {ACTIONS.map((a) => (
                <td key={a} className="px-2 py-2 text-center">
                  <span className="inline-flex">
                    <BaseCheckbox aria-label={`${app.name}: ${ACTION_LABELS[a]}`} checked={actions.includes(a)} disabled={readOnly} onCheckedChange={() => toggle(app.code, a)} />
                  </span>
                </td>
              ))}
              <td className="px-2 py-2 text-center">
                <span className="inline-flex">
                  <BaseCheckbox
                    aria-label={`${app.name}: all actions`}
                    checked={all}
                    indeterminate={actions.length > 0 && !all}
                    disabled={readOnly}
                    onCheckedChange={() => set(app.code, all ? [] : [...ACTIONS])}
                  />
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RoleEditor({ role, apps, canEdit, onDuplicate, onDelete, onMessage, busy }) {
  const router = useRouter()
  const codes = apps.map((a) => a.code)
  const initial = () => ({ name: role.name, description: role.description ?? "", matrix: toMatrix(role.permissions, codes), access: roleAccess(role) })
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const readOnly = !canEdit || role.system
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial())
  const change = (patch) => {
    setDraft((d) => ({ ...d, ...patch }))
    onMessage(null)
  }

  const save = () =>
    startTransition(async () => {
      setErrors({})
      const result = await saveRole(draft, role.id)
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) onMessage({ tone: "error", text: result.error })
      else {
        onMessage({ tone: "success", text: "Saved. People with this role get the new permissions the next time they open an app." })
        router.refresh()
      }
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{role.name}</h2>
                {role.system && (
                  <Badge color="gray">
                    <Icon name="lock-line" /> Built-in
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {role.description}
                {role.system && " · always has full access to every app."}
              </p>
            </>
          ) : (
            <div className="grid max-w-2xl gap-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <Input aria-label="Role name" value={draft.name} onChange={(e) => change({ name: e.target.value })} error={errors.name} />
              <Input aria-label="Description" placeholder="What this role is for" value={draft.description} onChange={(e) => change({ description: e.target.value })} error={errors.description} />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {role.memberCount} {role.memberCount === 1 ? "person has" : "people have"} this role ·{" "}
            <Link href="/users/people" className="text-primary hover:underline">
              see users
            </Link>
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" leftIcon="file-copy-2-line" disabled={busy} onClick={() => onDuplicate(role, draft)}>
              Duplicate
            </Button>
            {!role.system && (
              <>
                <Button variant="ghost" leftIcon="delete-bin-6-line" className="text-destructive" onClick={() => onDelete(role)}>
                  Delete
                </Button>
                <Button variant="outline" disabled={!dirty} onClick={() => setDraft(initial())}>
                  Discard
                </Button>
                <Button leftIcon="save-3-line" loading={pending} disabled={!dirty} onClick={save}>
                  Save
                </Button>
              </>
            )}
          </div>
        )}
      </header>
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        listClassName="gap-8 px-5 pt-4"
        contentClassName="min-h-0 overflow-hidden"
        tabs={[
          {
            value: "apps",
            label: "Apps & actions",
            icon: "apps-2-line",
            content: (
              <ScrollView className="h-full min-h-0">
                <Matrix apps={apps} value={draft.matrix} readOnly={readOnly} onChange={(matrix) => change({ matrix })} />
                <p className="px-4 py-3 text-xs text-muted-foreground">
                  Any other permission includes View. Only apps in your subscription are listed; everyone can open My Desk. Owner and Administrator can&apos;t be limited.
                </p>
              </ScrollView>
            ),
          },
          {
            value: "access",
            label: "Data access & limits",
            icon: "shield-user-line",
            content: (
              <ScrollView className="h-full min-h-0">
                <RoleAccess apps={apps} matrix={draft.matrix} value={draft.access} readOnly={readOnly} onChange={(access) => change({ access })} />
              </ScrollView>
            ),
          },
        ]}
      />
    </div>
  )
}

// Roles & Permissions: role list on the left, the selected role's permissions on the right.
// Only people with full access (Owner, Administrator) can change roles.
export function RolesView({ roles, apps, canEdit }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, startTransition] = useTransition()
  const selected = roles.find((r) => r.id === selectedId) ?? roles.find((r) => !r.system) ?? roles[0]

  // Next free name: "Base", "Base 2", …
  const freeName = (base) => {
    let name = base
    for (let n = 2; roles.some((r) => r.name === name); n++) name = `${base} ${n}`
    return name
  }

  const create = (data) =>
    startTransition(async () => {
      setMessage(null)
      const result = await saveRole(data)
      if (result.error || result.fieldErrors) setMessage({ tone: "error", text: result.error ?? Object.values(result.fieldErrors)[0] })
      else {
        setSelectedId(result.id)
        router.refresh()
      }
    })

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Roles & Permissions"
        description={canEdit ? "What each role can view, create, edit, delete, approve and export in every app." : "What each role can do. Only the owner or an administrator can change roles."}
        actions={
          canEdit && (
            <Button leftIcon="add-line" loading={pending} onClick={() => create({ name: freeName("New role"), description: "", matrix: {} })}>
              New role
            </Button>
          )
        }
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-background shadow-xs md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Roles" className="border-b md:border-r md:border-b-0">
          <ScrollView className="h-full max-h-60 md:max-h-none" viewportClassName="p-2">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedId(r.id)
                  setMessage(null)
                }}
                aria-current={r.id === selected?.id}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  r.id === selected?.id && "bg-primary/10 font-medium text-primary hover:bg-primary/10"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{r.description}</span>
                </span>
                {r.system && <Icon name="lock-line" className="text-xs text-muted-foreground" />}
                <span className="text-xs text-muted-foreground tabular-nums">{r.memberCount}</span>
              </button>
            ))}
          </ScrollView>
        </nav>
        <section className="min-h-0">
          {selected && (
            <RoleEditor
              // Remount when the role or its saved data changes, so the draft starts from what's stored
              key={`${selected.id}:${JSON.stringify([selected.name, selected.description, selected.permissions, selected.scope, selected.grants])}`}
              role={selected}
              apps={apps}
              canEdit={canEdit}
              busy={pending}
              onDuplicate={(role, draft) => create({ name: freeName(`${role.name} (copy)`), description: role.description ?? "", matrix: draft.matrix, access: draft.access })}
              onDelete={(r) => setDeleting(r)}
              onMessage={setMessage}
            />
          )}
        </section>
      </div>

      {deleting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          className="sm:max-w-md"
          title={`Delete the ${deleting.name} role?`}
          description="Roles that people still have can't be deleted."
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
                    const result = await deleteRole(deleting.id)
                    setMessage(result.error ? { tone: "error", text: result.error } : { tone: "success", text: `The ${deleting.name} role was deleted.` })
                    setDeleting(null)
                    if (!result.error) setSelectedId(null)
                    router.refresh()
                  })
                }
              >
                Delete role
              </Button>
            </>
          }
        />
      )}
    </div>
  )
}
