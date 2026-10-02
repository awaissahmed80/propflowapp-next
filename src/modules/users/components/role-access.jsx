"use client"

import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Checkbox } from "@/components/ui/checkbox"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { APP_PERMISSIONS, SCOPE_LABELS, scopeHint } from "../permissions"

function GrantControl({ def, value, readOnly, onChange }) {
  if (def.type === "toggle") return <Checkbox aria-label={def.label} checked={Boolean(value)} disabled={readOnly} onChange={onChange} />
  if (def.type === "percent")
    return <NumberInput aria-label={def.label} className="w-28" suffix="%" min={0} max={def.max} step={0.5} value={value} disabled={readOnly} onChange={(v) => onChange(Math.min(def.max, Math.max(0, v ?? 0)))} />
  return <ToggleGroup aria-label={def.label} value={value} disabled={readOnly} onChange={(v) => v && onChange(v)} options={def.options.map(([v, label]) => ({ value: v, label }))} />
}

// Per app: which records the role sees, and the sensitive actions inside it
export function RoleAccess({ apps, matrix, value, readOnly, onChange }) {
  const listed = apps.filter((a) => APP_PERMISSIONS[a.code])
  if (!listed.length) return <p className="p-6 text-sm text-muted-foreground">None of your apps have record limits or extra permissions.</p>
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">Limit which records this role sees, and what people with it can do inside each app. The same limits apply to lists, reports, exports and links.</p>
      {listed.map((app) => {
        const def = APP_PERMISSIONS[app.code]
        const open = matrix[app.code]?.includes("view")
        const scope = value.scope[app.code]
        return (
          <section key={app.code} className={cn("rounded-xl border", !open && "bg-muted/40")}>
            <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
              <AppIcon icon={app.icon} color={app.color} size="sm" className={cn("size-7 rounded-md text-sm", !open && "opacity-50")} />
              <h3 className="flex-1 font-medium">{app.name}</h3>
              {!open && <span className="text-xs text-muted-foreground">No access. Give View on the Apps & actions tab first.</span>}
            </header>
            {open && (
              <div className="divide-y">
                <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
                  <div>
                    <p className="text-sm font-medium">Can see</p>
                    <p className="text-xs text-muted-foreground">{scopeHint(scope, def.noun)}</p>
                  </div>
                  <Select
                    aria-label={`${app.name}: can see`}
                    value={scope}
                    disabled={readOnly}
                    onChange={(v) => onChange({ ...value, scope: { ...value.scope, [app.code]: v } })}
                    options={def.scopes.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
                  />
                </div>
                {def.grants.map((g) => (
                  <div key={g.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <p className="text-sm">{g.label}</p>
                      {g.hint && <p className="text-xs text-muted-foreground">{g.hint}</p>}
                    </div>
                    <GrantControl def={g} value={value.grants[g.key]} readOnly={readOnly} onChange={(v) => onChange({ ...value, grants: { ...value.grants, [g.key]: v } })} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
