import { z } from "zod"
import { appClosed, json, mobileRoute, paging, readBody } from "@/modules/mobile/server/api"
import { contactAnswer } from "@/modules/mobile/server/contacts"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { contactsContext } from "@/modules/contacts/server/context"
import { contactsList } from "@/modules/contacts/server/queries"
import { saveContact } from "@/modules/contacts/server/actions"
import { needsKyc, phoneKey } from "@/modules/contacts/review"

// GET /api/mobile/v1/contacts?view=all|type:<role>|missing-cnic&q=&page=&size=
// One page of the directory this person may see (their role's scope: linked or all), newest first
// → { rows, total, page, size, counts: { all, types: { <role>: n }, missingCnic }, can }.
// q matches a name, company, code, email or mobile (any form: 0300…, +92300…).
// POST { contact: { kind?, name, phone, whatsapp?, email?, cnic?, city?, … types }, opId? }: add a
// contact → { ok, code }; a mobile or CNIC someone else has → 409 duplicate with { clash }.
// docs/mobile-api.md
export const GET = mobileRoute(async (request) => {
  const ctx = await contactsContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const sp = new URL(request.url).searchParams
  const { page, size } = paging(request.url, { size: 30, max: 100 })
  const view = sp.get("view") ?? "all"
  const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 100)

  const { rows: all } = await contactsList(ctx, "all")
  const types = {}
  for (const c of all) for (const t of new Set(c.types)) types[t] = (types[t] ?? 0) + 1
  const review = ctx.has("review")
  let rows = all
  if (view.startsWith("type:")) rows = all.filter((c) => c.types.includes(view.slice(5)))
  else if (view === "missing-cnic" && review) rows = all.filter(needsKyc)
  if (q) {
    const digits = q.replace(/\D/g, "")
    rows = rows.filter(
      (c) =>
        [c.name, c.company, c.code, c.email].some((v) => String(v ?? "").toLowerCase().includes(q)) ||
        (digits.length >= 3 && phoneKey(c.phone).includes(digits.slice(-10))),
    )
  }
  return json({
    rows: rows.slice((page - 1) * size, page * size),
    total: rows.length,
    page,
    size,
    counts: { all: all.length, types, ...(review ? { missingCnic: all.filter(needsKyc).length } : {}) },
    can: { create: ctx.can("create"), edit: ctx.can("edit"), review },
  })
})

const schema = z.object({ contact: z.record(z.string(), z.unknown()), opId: opIdField })
export const POST = mobileRoute(async (request, access) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  return contactAnswer(await onceOp(access, "contacts.create", data.opId, () => saveContact("", data.contact)))
})
