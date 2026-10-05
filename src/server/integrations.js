import "server-only"
import { platformDb } from "@/server/db/connections"
import { INTEGRATIONS } from "@/modules/integrations/catalog"

// Which integrations a workspace sees and may use: the platform status (Live / Coming soon /
// Hidden, from the console; unbuilt ones never count as live) and whether PropFlow switched the
// workspace off for one.

// { key: "live" | "soon" | "hidden" }
export async function integrationStatuses() {
  const rows = await platformDb()("integrations").select("key", "status")
  return Object.fromEntries(
    INTEGRATIONS.map((i) => {
      const status = rows.find((r) => r.key === i.key)?.status ?? i.defaultStatus
      return [i.key, status === "live" && !i.built ? "soon" : status]
    }),
  )
}

// The catalog for one workspace → [{ ...integration, status, blocked, note }] (hidden ones left out)
export async function workspaceIntegrations(tenantId) {
  const [statuses, overrides] = await Promise.all([integrationStatuses(), platformDb()("tenantIntegrations").where({ tenantId }).select("key", "enabled", "note")])
  return INTEGRATIONS.filter((i) => statuses[i.key] !== "hidden").map((i) => {
    const o = overrides.find((x) => x.key === i.key)
    return { ...i, status: statuses[i.key], blocked: o ? !o.enabled : false, note: o?.note ?? null }
  })
}

// Live on the platform and not switched off for this workspace
export async function integrationOn(tenantId, key) {
  const [statuses, o] = await Promise.all([integrationStatuses(), platformDb()("tenantIntegrations").where({ tenantId, key }).first("enabled")])
  return statuses[key] === "live" && (o ? Boolean(o.enabled) : true)
}

export const INTEGRATION_OFF = "PropFlow has switched this integration off for your workspace. Contact support to turn it back on."
