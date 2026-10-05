import "server-only"
import { live } from "@/server/db/records"
import { siteUrl } from "@/lib/sites"
import { formatPkr } from "@/lib/format"
import { getLookups } from "@/modules/lookups/server"
import { THEME_DEFAULTS } from "../landing/library"
import { shapeForm } from "./forms"

// Landing pages: sections built in the app (src/modules/campaigns/landing), published at
// campaigns.<domain>/<workspace>/<slug>. Views count on public loads; entries are the leads whose
// landing_page_id is the page.

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

export const pageUrl = (workspaceSlug, slug) => siteUrl("campaigns", `/${workspaceSlug}/${slug}`)

export function shapePage(p) {
  return {
    code: p.code,
    name: p.name,
    slug: p.slug,
    template: p.template,
    status: p.status,
    theme: { ...THEME_DEFAULTS, ...json(p.theme, {}) },
    seo: { title: "", description: "", image: "", ...json(p.seo, {}) },
    sections: json(p.sections, []),
    views: Number(p.views ?? 0),
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt ?? p.createdAt,
  }
}

export async function listPages(ctx) {
  const pages = await live(ctx.db, "landingPages").orderBy("id", "desc")
  const ids = pages.map((p) => p.id)
  const [entries, campaigns, projects, forms] = await Promise.all([
    ids.length ? live(ctx.db, "leads").whereIn("landingPageId", ids).groupBy("landingPageId").select("landingPageId").count({ n: "id" }) : [],
    live(ctx.db, "campaigns").select("id", "code", "name"),
    live(ctx.db, "projects").select("id", "code", "name"),
    live(ctx.db, "leadForms").select("id", "code", "name"),
  ])
  return pages.map((p) => {
    const shaped = shapePage(p)
    const n = Number(entries.find((e) => e.landingPageId === p.id)?.n ?? 0)
    const pick = (list, id) => {
      const x = list.find((r) => r.id === id)
      return x ? { code: x.code, name: x.name } : null
    }
    // The card thumbnail: the top of the page
    const preview = shaped.sections.filter((x) => !x.hidden).slice(0, 2)
    return {
      code: shaped.code,
      name: shaped.name,
      slug: shaped.slug,
      status: shaped.status,
      theme: shaped.theme,
      preview,
      sectionCount: shaped.sections.length,
      campaign: pick(campaigns, p.campaignId),
      project: pick(projects, p.projectId),
      form: pick(forms, p.formId),
      views: shaped.views,
      entries: n,
      conversion: shaped.views ? n / shaped.views : null,
      url: pageUrl(ctx.tenant.slug, shaped.slug),
      updatedAt: shaped.updatedAt,
    }
  })
}

// What {project}, {location}… fill in with, from a project
export async function projectVars(db, projectId, workspaceName = "") {
  const p = projectId ? await live(db, "projects").where({ id: projectId }).first("name", "location", "city", "authority", "nocNumber") : null
  const authorities = p?.authority ? (await getLookups(db, ["authority"])).authority : []
  return {
    project: p?.name ?? "Our project",
    location: [p?.location, p?.city].filter(Boolean).join(", ") || "the city",
    city: p?.city ?? "",
    authority: authorities.find((a) => a.value === p?.authority)?.label ?? p?.authority ?? "the authority",
    noc: p?.nocNumber ?? "",
    workspace: workspaceName,
  }
}

// Starting prices from the project's available inventory: one row per size and type (max 6)
export async function inventoryRows(db, projectId) {
  if (!projectId) return []
  const units = await live(db, "units").where({ projectId, status: "available" }).select("type", "sizeValue", "sizeUnit", "price")
  const types = (await getLookups(db, ["unit-type"]))["unit-type"]
  const groups = new Map()
  for (const u of units) {
    const size = `${Number(u.sizeValue)} ${u.sizeUnit === "sqft" ? "sq ft" : u.sizeUnit[0].toUpperCase() + u.sizeUnit.slice(1)}`
    const key = `${size}|${u.type}`
    const g = groups.get(key) ?? { size, type: types.find((t) => t.value === u.type)?.label ?? u.type, min: Infinity, count: 0 }
    g.min = Math.min(g.min, Number(u.price))
    g.count += 1
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.min - b.min)
    .slice(0, 6)
    .map((g) => ({ label: `${g.size} ${g.type}`.trim(), price: `From ${formatPkr(g.min)}`, detail: `${g.count} available` }))
}

// One page for the builder, with what its pickers and preview need
export async function getPage(ctx, code) {
  const p = await live(ctx.db, "landingPages")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!p) return null
  const [campaigns, projects, forms, form, vars, cities] = await Promise.all([
    live(ctx.db, "campaigns").orderBy("startDate", "desc").select("id", "code", "name", "projectId"),
    live(ctx.db, "projects").orderBy("name").select("id", "code", "name"),
    live(ctx.db, "leadForms").whereNull("provider").orderBy("name").select("id", "code", "name", "status"),
    p.formId ? live(ctx.db, "leadForms").where({ id: p.formId }).first() : null,
    projectVars(ctx.db, p.projectId, ctx.tenant.name),
    getLookups(ctx.db, ["city"]).then((l) => l.city.filter((c) => c.isActive).map((c) => ({ value: c.value, label: c.label }))),
  ])
  const code_ = (list, id) => list.find((x) => x.id === id)?.code ?? null
  return {
    page: { ...shapePage(p), campaign: code_(campaigns, p.campaignId), project: code_(projects, p.projectId), form: code_(forms, p.formId), url: pageUrl(ctx.tenant.slug, p.slug) },
    options: {
      campaigns: campaigns.map((c) => ({ value: c.code, label: c.name, project: projects.find((x) => x.id === c.projectId)?.code ?? null })),
      projects: projects.map((x) => ({ value: x.code, label: x.name })),
      forms: forms.map((f) => ({ value: f.code, label: f.name, status: f.status })),
    },
    form: form ? shapeForm(form) : null,
    vars,
    cities,
    workspace: { name: ctx.tenant.name, slug: ctx.tenant.slug },
    base: pageUrl(ctx.tenant.slug, ""),
  }
}

// A published page by address (the public site) → { page, form, cities } | null
export async function publicPage(db, slug) {
  const p = await live(db, "landingPages")
    .where({ slug: String(slug ?? "").toLowerCase(), status: "published" })
    .first()
  if (!p) return null
  const form = p.formId ? await live(db, "leadForms").where({ id: p.formId }).first() : null
  const cities = form ? (await getLookups(db, ["city"])).city.filter((c) => c.isActive).map((c) => ({ value: c.value, label: c.label })) : []
  return { id: p.id, page: shapePage(p), form: form && form.status === "active" ? { ...shapeForm(form) } : null, formId: form?.id ?? null, cities }
}

export const recordPageView = (db, pageId, formId) => Promise.all([db("landingPages").where({ id: pageId }).increment("views", 1), formId ? db("leadForms").where({ id: formId }).increment("views", 1) : null])
