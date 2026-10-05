import { INTEGRATION_OFF, integrationOn } from "@/server/integrations"
import { LEAD_SOURCES } from "@/modules/integrations/leads/sources"
import { fromGoogleAds, fromGoogleForms, receiveExternal, sameKey, siteByCode, sourceSettings } from "@/modules/integrations/leads/server"

// Leads posted to PropFlow: POST /api/leads/<source>/<workspace code>
//   google-ads: Google Ads lead form webhook (the key comes as google_key)
//   google-forms: the Apps Script in a Google Form (key, and test: true when it's installed)
// The key is the workspace's key for that source (Settings › Integrations). While the integration
// is switched off for the workspace, leads are kept waiting (paused) instead of lost.

const PARSE = { "google-ads": [fromGoogleAds, (p) => p?.google_key], "google-forms": [fromGoogleForms, (p) => p?.key] }

export async function POST(request, { params }) {
  const { source, tenant: code } = await params
  const src = LEAD_SOURCES[source]
  if (!src) return Response.json({ error: "Unknown source" }, { status: 404 })
  const payload = await request.json().catch(() => null)
  if (!payload) return Response.json({ error: "Send JSON" }, { status: 400 })
  const site = await siteByCode(code)
  const settings = site ? await sourceSettings(site.db, source) : null
  const [parse, keyOf] = PARSE[source]
  if (!site || !settings?.key || !sameKey(keyOf(payload), settings.key)) return Response.json({ error: "Wrong address or key" }, { status: 401 })

  const ext = parse(payload)
  // The Apps Script's install ping: note the form and its questions, no lead
  if (source === "google-forms" && ext.isTest && ext.fieldData.every((f) => !f.values?.[0])) {
    await receiveExternal(site, source, ext, { register: true })
    return Response.json({ ok: true, registered: true })
  }
  const held = (await integrationOn(site.tenant.id, src.integration)) ? null : INTEGRATION_OFF
  const r = await receiveExternal(site, source, ext, { held })
  return Response.json({ ok: true, status: r.status })
}
