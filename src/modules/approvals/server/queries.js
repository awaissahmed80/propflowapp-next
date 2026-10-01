import "server-only"
import { live } from "@/server/db/records"
import { isFullAccess } from "@/modules/users/permissions"
import { peopleByIds } from "@/modules/users/server/queries"
import { HANDLERS } from "./handlers"

// Can these permissions decide this type of request?
export const canDecideType = (permissions, type) => isFullAccess(permissions) || Boolean(HANDLERS[type]?.canDecide(permissions))

const shape = (a, people) => ({
  code: a.code,
  type: a.type,
  status: a.status,
  title: a.title,
  details: a.details,
  amount: a.amount == null ? null : Number(a.amount),
  link: a.link,
  reason: a.reason,
  note: a.decisionNote,
  requestedAt: a.createdAt,
  decidedAt: a.decidedAt,
  requester: people.get(a.requestedBy) ? { name: people.get(a.requestedBy).name, avatarUrl: people.get(a.requestedBy).avatarUrl } : null,
  decider: a.decidedBy && people.get(a.decidedBy) ? { name: people.get(a.decidedBy).name } : null,
})

// The inbox for one person: waiting for them, what they asked for, what they decided
export async function listApprovals(ctx) {
  const me = ctx.user.id
  const types = Object.keys(HANDLERS).filter((t) => canDecideType(ctx.permissions, t))
  const [waiting, mine, decided] = await Promise.all([
    types.length ? live(ctx.db, "approvals").where({ status: "pending" }).whereIn("type", types).whereNot({ requestedBy: me }).orderBy("id", "desc").limit(200) : [],
    live(ctx.db, "approvals").where({ requestedBy: me }).orderBy("id", "desc").limit(100),
    live(ctx.db, "approvals").where({ decidedBy: me }).whereNot({ requestedBy: me }).whereIn("status", ["approved", "rejected"]).orderBy("decidedAt", "desc").limit(100),
  ])
  const people = await peopleByIds([...waiting, ...mine, ...decided].flatMap((a) => [a.requestedBy, a.decidedBy]))
  return { waiting: waiting.map((a) => shape(a, people)), mine: mine.map((a) => shape(a, people)), decided: decided.map((a) => shape(a, people)) }
}

// How many requests are waiting for this person
export async function waitingCount(ctx) {
  const types = Object.keys(HANDLERS).filter((t) => canDecideType(ctx.permissions, t))
  if (!types.length) return 0
  const r = await live(ctx.db, "approvals").where({ status: "pending" }).whereIn("type", types).whereNot({ requestedBy: ctx.user.id }).count("id as n").first()
  return Number(r?.n ?? 0)
}
