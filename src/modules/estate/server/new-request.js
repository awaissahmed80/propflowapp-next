import "server-only"
import { TYPES } from "../constants"
import { bookingOptions, serviceStaff, servicesSettings } from "./queries"

// What the New request dialog needs on a page: the files to pick from, who it can go to (with
// services.assign), and the fees and timelines for the fee hint. Nothing when the role can't log.
// types: the request types this workspace's plan has switched on.
//   → { canCreate, types, bookings, staff, canAssign, settings, me }
const TYPE_FEATURE = { transfer: "transfers", ndc: "ndc-possession", possession: "ndc-possession", complaint: "complaints" }

export async function newRequestProps(ctx) {
  const canCreate = ctx.can("create")
  const canAssign = Boolean(ctx.grant("estate.assign"))
  const me = { id: ctx.user.id, name: ctx.user.name }
  if (!canCreate) return { canCreate, types: [], bookings: [], staff: [], canAssign: false, settings: null, me }
  const types = TYPES.filter((t) => !TYPE_FEATURE[t] || ctx.has(TYPE_FEATURE[t]))
  const [bookings, staff, settings] = await Promise.all([bookingOptions(ctx), canAssign ? serviceStaff(ctx) : [], servicesSettings(ctx.db)])
  return { canCreate, types, bookings, staff, canAssign, settings, me }
}
