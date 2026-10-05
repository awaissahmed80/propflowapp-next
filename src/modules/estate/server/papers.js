import "server-only"
import { live } from "@/server/db/records"
import { maskCnic } from "@/lib/cnic"
import { getLookups } from "@/modules/lookups/server"
import { measures } from "@/modules/portfolio/constants"

// The papers a request gives out once it's done: the NDC certificate, the transfer letter and the
// possession letter. Each needs the people on it in full (father's/husband's name, address), so
// they're read here; CNICs stay masked for roles without contacts.cnic, as on sales documents.
//   request: getRequest() · doc: "ndc" | "transfer" | "possession"

export const PAPERS = {
  ndc: { title: "No Demand Certificate", file: "NDC" },
  transfer: { title: "Transfer letter", file: "Transfer letter" },
  possession: { title: "Possession letter", file: "Possession letter" },
}

const party = (ctx, p) =>
  p
    ? {
        name: p.name ?? null,
        relation: p.relation ?? p.guardianRelation ?? null,
        guardian: p.guardian ?? p.guardianName ?? null,
        cnic: maskCnic(p.cnic, ctx.grant?.("contacts.cnic")),
        phone: p.phone ?? null,
        address: p.address ?? null,
      }
    : null

const contactBy = (ctx, where) => live(ctx.db, "contacts").where(where).first("name", "phone", "cnic", "guardianRelation", "guardianName", "address")

// Which paper a request has, once it's been given → "ndc" | "transfer" | "possession" | null
export function paperFor(request) {
  if (!request || request.status !== "completed") return null
  if (request.type === "ndc" && request.data.number) return "ndc"
  if (request.type === "transfer" && request.data.letterNo) return "transfer"
  if (request.type === "possession" && request.data.letterNo) return "possession"
  return null
}

// → { doc, title, number, date, owner, from?, validTill?, purpose? } | null
export async function requestPaper(ctx, request, doc = paperFor(request)) {
  if (!doc || paperFor(request) !== doc) return null
  const d = request.data
  if (doc === "transfer") {
    const to = d.toContactId ? await contactBy(ctx, { id: d.toContactId }) : null
    return {
      doc,
      title: PAPERS.transfer.title,
      number: d.letterNo,
      date: d.completedAt ?? request.closedAt,
      from: party(ctx, d.from),
      owner: party(ctx, to ? { ...d.to, ...to } : d.to),
      biometricAt: d.biometricAt ?? null,
    }
  }
  const owner = request.contact ? await contactBy(ctx, { code: request.contact.code }) : null
  if (doc === "ndc") {
    const days = Number(d.validDays ?? request.settings?.ndc?.validDays ?? 30)
    const validTill = new Date(new Date(d.issuedAt ?? request.closedAt).getTime() + days * 86_400_000)
    return { doc, title: PAPERS.ndc.title, number: d.number, date: d.issuedAt ?? request.closedAt, owner: party(ctx, owner), validTill, purpose: d.purpose ?? null }
  }
  return {
    doc,
    title: PAPERS.possession.title,
    number: d.letterNo,
    date: d.letterAt ?? request.closedAt,
    owner: party(ctx, owner),
    demarcatedAt: d.demarcatedAt ?? null,
    handedOverAt: d.handedOverAt ?? d.letterAt ?? null,
  }
}

// "5 Marla residential plot" for the PDF (the browser uses useUnitText)
export async function unitTextFn(db) {
  const lists = await getLookups(db, ["unit-type", "area-unit", "block-category"])
  const m = measures(lists)
  const type = (v) => lists["unit-type"].find((x) => x.value === v)?.label ?? v
  return (u) => (u ? [u.sizeValue ? m.formatSize(Number(u.sizeValue), u.sizeUnit) : null, u.type ? String(type(u.type)).toLowerCase() : null].filter(Boolean).join(" ") : "")
}
