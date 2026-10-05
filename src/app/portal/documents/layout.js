import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { getLookups } from "@/modules/lookups/server"
import { platformDb } from "@/server/db/connections"
import { documentsContext } from "@/modules/documents/server/context"
import { remindExpiring } from "@/modules/documents/server/reminders"
import { APP_SOURCES, DOCUMENTS_NAV } from "@/modules/documents/nav"
import { SOON_DAYS, addDays, todayKey } from "@/modules/documents/expiry"

export const metadata = { title: { default: "Documents", template: "%s · Documents · PropFlow" } }

// Documents: the company's document library, plus the files other apps keep. The sidebar lists
// each document type the person may see (with counts; the others are data access, so left out)
// and the files of each app the workspace has (locked when their role can't open that app).
export default async function DocumentsLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "documents"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const ctx = await documentsContext()
  const lists = await getLookups(ctx.db, ["document-type"])
  const counts = ctx.visibleTypes.length
    ? await ctx.db("assets").where({ app: "documents" }).whereNull("deletedAt").whereNull("supersededAt").whereIn("category", ctx.visibleTypes).groupBy("category").select("category").count({ n: "id" })
    : []
  const byType = Object.fromEntries(counts.map((c) => [c.category, Number(c.n)]))
  // Expired or expiring within 30 days, on the Expiring item; the day's reminders go out first
  let expiring = 0
  if (ctx.has("expiry") && ctx.visibleTypes.length) {
    await remindExpiring(ctx.db, ctx.tenant)
    const row = await ctx
      .db("assets")
      .where({ app: "documents" })
      .whereNull("deletedAt")
      .whereNull("supersededAt")
      .whereIn("category", ctx.visibleTypes)
      .where("expiresOn", "<=", addDays(todayKey(), SOON_DAYS))
      .count({ n: "id" })
      .first()
    expiring = Number(row?.n ?? 0)
  }
  const apps = new Set(await platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where("ta.tenantId", ctx.tenant.id).whereNull("a.deletedAt").where("a.isActive", true).pluck("a.code"))
  const nav = [
    { ...DOCUMENTS_NAV[0], items: DOCUMENTS_NAV[0].items.map((i) => (i.to === "/documents/expiring" && expiring ? { ...i, badge: expiring } : i)) },
    {
      label: "Company documents",
      items: ctx.types
        .filter((t) => ctx.canSeeType(t.value))
        .map((t) => ({ label: t.label, icon: t.icon || "file-line", to: `/documents/type/${t.value}`, badge: byType[t.value] || undefined, description: `${t.label}: company documents of this kind` })),
    },
    {
      label: "From apps",
      items: APP_SOURCES.filter((src) => apps.has(src.app)).map((src) => ({
        label: src.label,
        icon: src.icon,
        to: `/documents/apps/${src.key}`,
        description: src.description,
        ...(ctx.canApp(src.app) ? {} : { locked: true, lockedReason: "Your role can't open the app these files belong to" }),
      })),
    },
    ...DOCUMENTS_NAV.slice(1),
  ].filter((g) => g.items.length)
  return (
    <AppShell portal={portal} appCode="documents" nav={nav} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="documents" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
