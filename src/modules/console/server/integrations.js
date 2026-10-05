import "server-only"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { siteUrl } from "@/lib/sites"
import { integrationStatuses } from "@/server/integrations"
import { INTEGRATIONS } from "@/modules/integrations/catalog"
import { metaEnabled, metaRedirectUri } from "@/modules/campaigns/meta/graph"
import { SMS_PROVIDERS } from "@/modules/integrations/sms/providers"
import { readSms } from "@/server/sms"
import { LEAD_SOURCES, sourceByIntegration } from "@/modules/integrations/leads/sources"

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

// One workspace → [{ key, status, enabled, note, meta?, sms? }]; meta: its Facebook connection,
// sms: its SMS gateway account (provider, sender, messages in 30 days)
export async function workspaceIntegrationsAdmin(tenantId) {
  const [statuses, overrides, tenant] = await Promise.all([
    integrationStatuses(),
    platformDb()("tenantIntegrations").where({ tenantId }).select("key", "enabled", "note", "updatedAt"),
    live(platformDb(), "tenants").where({ id: tenantId }).first("id", "dbName", "dbHost", "status"),
  ])
  let meta = null
  let sms = null
  const sources = {}
  if (tenant && tenant.status !== "provisioning") {
    try {
      const db = tenantDb(tenant)
      // Google Ads lead forms / Google Forms: set up or not, forms, leads in 30 days
      for (const src of Object.values(LEAD_SOURCES)) {
        const row = await db("settings").where({ key: src.settingsKey }).first("value")
        const v = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value
        if (!v?.key) continue
        const [forms, leads] = await Promise.all([
          db("externalForms").where({ source: src.key }).whereNot({ externalId: "propflow-test" }).count({ n: "id" }).first(),
          db("externalLeads")
            .where({ source: src.key, isTest: false })
            .where("receivedAt", ">=", new Date(Date.now() - 30 * 86_400_000))
            .count({ n: "id" })
            .first(),
        ])
        sources[src.integration] = { forms: Number(forms?.n ?? 0), leads30: Number(leads?.n ?? 0) }
      }
      const account = await readSms(db)
      if (account) {
        const sent = await db("smsMessages")
          .where("createdAt", ">=", new Date(Date.now() - 30 * 86_400_000))
          .count({ n: "id" })
          .first()
        sms = { provider: SMS_PROVIDERS[account.provider]?.name ?? account.provider, sender: account.sender || null, sent30: Number(sent?.n ?? 0), tested: Boolean(account.verifiedAt) }
      }
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
    return {
      key: i.key,
      status: statuses[i.key],
      enabled: o ? Boolean(o.enabled) : true,
      note: o?.note ?? null,
      changedAt: o?.updatedAt ?? null,
      ...(i.key === "meta" ? { meta } : {}),
      ...(i.key === "sms" ? { sms } : {}),
    }
  })
}
