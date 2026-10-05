import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { campaignsContext } from "@/modules/campaigns/server/context"
import { META_COOKIE, META_RETURN, exchangeCode, grantedScopes, me, myPages } from "@/modules/campaigns/meta/graph"
import { readSigned } from "@/server/auth/secrets"
import { sealSecret } from "@/server/secret-box"
import { logActivity } from "@/server/tenants/activity"
import { siteForHost, siteUrl } from "@/lib/sites"

// Without these PropFlow can't list Pages, subscribe them or read leads
const NEEDED = ["pages_show_list", "pages_manage_metadata", "leads_retrieval"]

// Facebook Login sends the person back here with ?code=…&state=… (or ?error=…). The connection is
// saved for the workspace and person that started it: the long-lived user token, and every Page
// they manage with its own Page token (both sealed). Pages start off; leads flow once a Page is
// switched on in Campaigns › Integrations.
export async function GET(request) {
  const url = request.nextUrl
  // Facebook returned to another address (META_REDIRECT_URI): on to the portal, where the cookie is
  if (siteForHost(request.headers.get("host")) !== "portal") return NextResponse.redirect(siteUrl("portal", `/api/meta/callback${url.search}`))
  const jar = await cookies()
  const saved = readSigned(jar.get(META_COOKIE)?.value)
  // Back where Connect Facebook was pressed: Campaigns › Integrations or Settings › Integrations
  const BACK = META_RETURN[saved?.from] ?? META_RETURN.campaigns
  const back = (result) => NextResponse.redirect(siteUrl("portal", `${BACK}?meta=${result}`))
  jar.set(META_COOKIE, "", { path: "/api/meta", maxAge: 0 })

  if (!saved || saved.exp < Date.now() || saved.state !== url.searchParams.get("state")) return back("expired")
  if (url.searchParams.get("error")) return back("cancelled")
  const ctx = await campaignsContext(BACK)
  if (ctx.tenant.id !== saved.tenantId || ctx.user.id !== saved.userId || !ctx.can("edit")) return back("expired")

  let account, pages
  try {
    const { token, expiresAt } = await exchangeCode(url.searchParams.get("code") ?? "")
    const granted = await grantedScopes(token)
    if (NEEDED.some((p) => !granted.includes(p))) return back("missing-permissions")
    account = { ...(await me(token)), token, expiresAt }
    pages = await myPages(token)
  } catch (err) {
    console.error("Facebook connect failed:", err.message)
    return back("failed")
  }

  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    // One Facebook connection per workspace: a new one replaces the old
    await trx("metaConnections").delete()
    await trx("metaConnections").insert({ fbUserId: account.id, fbUserName: account.name ?? null, userToken: sealSecret(account.token), tokenExpiresAt: account.expiresAt, createdBy: ctx.user.id })
    const known = await trx("metaPages").select("pageId", "subscribedAt")
    for (const p of pages) {
      const row = { name: p.name.slice(0, 150), pageToken: sealSecret(p.token), lastError: null, updatedAt: now, updatedBy: ctx.user.id }
      if (known.some((k) => k.pageId === p.id)) await trx("metaPages").where({ pageId: p.id }).update(row)
      else await trx("metaPages").insert({ ...row, pageId: p.id, createdBy: ctx.user.id })
    }
    // Pages this account no longer manages: dropped, unless they're receiving leads (their
    // own token keeps working until Facebook says otherwise)
    const listed = pages.map((p) => p.id)
    await trx("metaPages")
      .whereNull("subscribedAt")
      .modify((q) => (listed.length ? q.whereNotIn("pageId", listed) : q))
      .delete()
  })
  await logActivity(ctx.db, {
    type: "campaigns",
    action: "meta.connected",
    actorUserId: ctx.user.id,
    summary: `connected Facebook (${account.name ?? "account"}, ${pages.length} ${pages.length === 1 ? "Page" : "Pages"}) for lead ads`,
  })
  return back(pages.length ? "connected" : "no-pages")
}
