import { appClosed, json, mobileRoute } from "@/modules/mobile/server/api"
import { contactLists, contactsContext } from "@/modules/contacts/server/context"

// GET /api/mobile/v1/contacts/lists: the pick-lists the Contacts screens need (contact types with
// their colors and icons, cities) → { lists, can: { create, edit, review } }. docs/mobile-api.md
export const GET = mobileRoute(async () => {
  const ctx = await contactsContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  return json({ lists: await contactLists(ctx), can: { create: ctx.can("create"), edit: ctx.can("edit"), review: ctx.has("review") } })
})
