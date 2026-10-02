import "server-only"
import { can } from "@/modules/users/permissions"
import { closeApproval } from "./requests"
import { activateList, returnToDraft } from "@/modules/estate/server/price-list-ops"

// What each approval type does when decided from the inbox. ctx: { db, user, permissions }.
//   canDecide(permissions)        who may approve or reject it (never the person who asked)
//   approve(ctx, a) → { message } | { error }
//   reject(ctx, a, note), withdraw(ctx, a)
const priceListRow = (ctx, a) => ctx.db("priceLists").where({ id: a.subjectId }).whereNull("deletedAt").first()

export const HANDLERS = {
  "price-list": {
    canDecide: (permissions) => can(permissions, "estate", "approve"),
    async approve(ctx, a) {
      const list = await priceListRow(ctx, a)
      if (!list) return { error: "That price list was deleted." }
      const r = await activateList(ctx.db, ctx.user.id, list, { apply: a.payload?.apply !== false })
      if (r.error) return r
      return { message: `${list.name} is active.${a.payload?.apply !== false ? ` ${r.repriced} unsold ${r.repriced === 1 ? "unit" : "units"} re-priced.` : ""}` }
    },
    async reject(ctx, a, note) {
      const list = await priceListRow(ctx, a)
      if (list?.status === "pending") await returnToDraft(ctx.db, ctx.user.id, list, { status: "rejected", note })
      else await closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note })
      return { ok: true }
    },
    async withdraw(ctx, a) {
      const list = await priceListRow(ctx, a)
      if (list?.status === "pending") await returnToDraft(ctx.db, ctx.user.id, list, { status: "withdrawn" })
      else await closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id })
      return { ok: true }
    },
  },
}
