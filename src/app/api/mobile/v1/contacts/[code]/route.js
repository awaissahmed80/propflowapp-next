import { z } from "zod"
import { appClosed, fail, json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { contactsContext } from "@/modules/contacts/server/context"
import { contactDetail } from "@/modules/contacts/server/queries"
import { saveContact } from "@/modules/contacts/server/actions"
import { contactAnswer } from "@/modules/mobile/server/contacts"

const GONE = { message: "That contact was removed or isn't yours to see." }

// GET /api/mobile/v1/contacts/<code>: one contact with their leads, bookings, requests and one
// timeline, as the web's contact page (only what this person's apps let them see) → { contact, can }.
// PATCH { contact: { …fields to change }, opId? }: change their details; fields left out keep their
// values (a masked CNIC means unchanged) → { ok, code }. docs/mobile-api.md
export const GET = mobileRoute(async (request, access, { code }) => {
  const ctx = await contactsContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const contact = await contactDetail(ctx, code)
  return contact ? json({ contact, can: { edit: ctx.can("edit") } }) : fail("not_found", GONE)
})

const schema = z.object({ contact: z.record(z.string(), z.unknown()), opId: opIdField })
export const PATCH = mobileRoute(async (request, access, { code }) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const ctx = await contactsContext()
  const c = await contactDetail(ctx, code)
  if (!c) return fail("not_found", GONE)
  // The web form sends every field: start from the contact as it is
  const base = {
    kind: c.kind,
    name: c.name,
    phone: c.phone,
    whatsapp: c.whatsapp,
    email: c.email ?? "",
    cnic: c.cnic ?? "",
    city: c.city ?? "",
    overseas: c.overseas,
    address: c.address ?? "",
    company: c.company ?? "",
    designation: c.designation ?? "",
    guardianRelation: c.guardianRelation ?? "",
    guardianName: c.guardianName ?? "",
    notes: c.notes ?? "",
    types: c.types,
  }
  return contactAnswer(await onceOp(access, "contacts.update", data.opId, () => saveContact(c.code, { ...base, ...data.contact })))
})
