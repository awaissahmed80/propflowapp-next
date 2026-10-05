import "server-only"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { siteUrl } from "@/lib/sites"
import { integrationStatuses } from "@/server/integrations"
import { INTEGRATIONS } from "@/modules/integrations/catalog"
import { metaEnabled, metaRedirectUri } from "@/modules/campaigns/meta/graph"

// Console views of integrations: the platform list (status, whether the server has the keys, how
// many workspaces use it) and one workspace's (switched off or not, and Meta's connection).

// What the server needs for each built integration (no secret values, only whether they're set)
const configured = { meta: () => metaEnabled() }

export async function platformIntegrations() {
  const [statuses, rows, routes, off] = await Promise.all([
    integrationStatuses(),
    platformDb()("integrations").select("key", "updatedAt"),
    platformDb()("metaPages").countDistinct({ n: "tenantId" }).first(),
    platformDb()("tenantIntegrations").where({ enabled: false }).groupBy("key").select("key").count({ n: "id" }),
  ])
  return INTEGRATIONS.map((i) => ({
    key: i.key,
    built: i.built,
    status: statuses[i.key],
    configured: configured[i.key]?.() ?? null,
    updatedAt: rows.find((r) => r.key === i.key)?.updatedAt ?? null,
    // Workspaces receiving leads (Meta: with a Page switched on)
    inUse: i.key === "meta" ? Number(routes?.n ?? 0) : 0,
    switchedOff: Number(off.find((o) => o.key === i.key)?.n ?? 0),
    setup: i.key === "meta" ? { webhookUrl: siteUrl("portal", "/api/meta/webhook"), redirectUri: metaRedirectUri() } : null,
  }))
}

// One workspace → [{ key, status, enabled, note, meta? }]; meta: its Facebook connection
export async function workspaceIntegrationsAdmin(tenantId) {
  const [statuses, overrides, tenant] = await Promise.all([
    integrationStatuses(),
    platformDb()("tenantIntegrations").where({ tenantId }).select("key", "enabled", "note", "updatedAt"),
    live(platformDb(), "tenants").where({ id: tenantId }).first("id", "dbName", "dbHost", "status"),
  ])
  let meta = null
  if (tenant && tenant.status !== "provisioning") {
    try {
      const db = tenantDb(tenant)
      const [conn, pages, synced] = await Promise.all([
        db("metaConnections").orderBy("id", "desc").first("fbUserName", "createdAt"),
        db("metaPages").select("name", "subscribedAt", "lastError"),
        db("metaLeads").whereIn("status", ["created", "duplicate"]).where({ isTest: false }).count({ n: "id" }).max({ last: "processedAt" }).first(),
      ])
      meta = conn
        ? {
            account: conn.fbUserName,
            connectedAt: conn.createdAt,
            pagesOn: pages.filter((p) => p.subscribedAt).map((p) => p.name),
            pages: pages.length,
            leads: Number(synced?.n ?? 0),
            lastAt: synced?.last ?? null,
            error: pages.find((p) => p.lastError)?.lastError ?? null,
          }
        : null
    } catch (err) {
      console.error("Workspace integrations:", err.message)
    }
  }
  return INTEGRATIONS.map((i) => {
    const o = overrides.find((x) => x.key === i.key)
    return { key: i.key, status: statuses[i.key], enabled: o ? Boolean(o.enabled) : true, note: o?.note ?? null, changedAt: o?.updatedAt ?? null, ...(i.key === "meta" ? { meta } : {}) }
  })
}
