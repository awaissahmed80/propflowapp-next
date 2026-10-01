"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { normalizeHex } from "@/lib/color"
import { DEFAULT_TEAM_COLOR } from "../constants"
import { usersAction } from "./context"
import { saveProfile } from "./profile"
import { listMembers } from "./queries"

// Sales teams: a lead, members (each person is in one team at most) and a monthly target

const teamSchema = z.object({
  name: z.string().trim().min(2, "Give the team a name.").max(80, "That's too long."),
  color: z.preprocess((v) => normalizeHex(v), z.string().nullable()).transform((v) => v ?? DEFAULT_TEAM_COLOR),
  description: z.string().trim().max(255, "Keep it under 255 characters.").optional().default(""),
  leadId: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  memberIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  target: z.object({
    bookings: z.coerce.number().int().min(0).max(100_000).catch(0),
    value: z.coerce.number().min(0).max(1e13).catch(0),
  }),
})

// { name, color, description, leadId, memberIds, target: { bookings, value } } → { ok, id } or { error, fieldErrors }
export async function saveTeam(input, id) {
  const { ctx, error } = await usersAction("edit")
  if (error) return { error }
  const parsed = teamSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const data = parsed.data

  const existing = id ? await live(ctx.db, "teams").where({ id: Number(id) }).first("id", "name") : null
  if (id && !existing) return { error: "That team was deleted." }
  const clash = await live(ctx.db, "teams").where({ name: data.name }).whereNot({ id: existing?.id ?? 0 }).first("id")
  if (clash) return { fieldErrors: { name: "Another team already has this name." } }

  // Lead and members must be active people in the workspace
  const members = await listMembers(ctx)
  // Dealer logins can't be in teams
  const active = new Map(members.filter((m) => m.status === "active" && !m.dealerId).map((m) => [m.id, m]))
  if (data.leadId && !active.has(data.leadId)) return { fieldErrors: { leadId: "Pick someone active in the workspace." } }
  const keep = new Set([...data.memberIds.filter((m) => active.has(m)), ...(data.leadId ? [data.leadId] : [])])

  const row = {
    name: data.name,
    color: data.color,
    description: data.description || null,
    leadUserId: data.leadId,
    targetBookings: data.target.bookings,
    targetValue: data.target.value,
  }
  let teamId = existing?.id
  if (existing) {
    await ctx.db("teams").where({ id: teamId }).update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
  } else {
    ;[teamId] = await ctx.db("teams").insert({ ...row, createdBy: ctx.user.id })
  }

  // Listed people join this team (leaving any other); people no longer listed leave it
  for (const m of members) {
    if (keep.has(m.id) && m.teamId !== teamId) {
      await saveProfile(ctx.db, m.id, { teamId }, ctx.user.id)
      // Someone moved here stops leading their old team
      if (m.teamId) await ctx.db("teams").where({ id: m.teamId, leadUserId: m.id }).update({ leadUserId: null, updatedAt: new Date(), updatedBy: ctx.user.id })
    }
    if (!keep.has(m.id) && m.teamId === teamId) await saveProfile(ctx.db, m.id, { teamId: null }, ctx.user.id)
  }

  await logActivity(ctx.db, {
    type: "team",
    action: existing ? "team.updated" : "team.created",
    actorUserId: ctx.user.id,
    summary: existing ? `updated ${data.name}` : `created ${data.name}`,
    subjectType: "team",
    subjectId: teamId,
  })
  return { ok: true, id: teamId }
}

// Its people stay in the workspace without a team
export async function deleteTeam(id) {
  const { ctx, error } = await usersAction("delete")
  if (error) return { error }
  const team = await live(ctx.db, "teams").where({ id: Number(id) }).first("id", "name")
  if (!team) return { error: "That team was already deleted." }
  const now = new Date()
  await ctx.db("teams").where({ id: team.id }).update({ deletedAt: now, deletedBy: ctx.user.id })
  await ctx.db("members").where({ teamId: team.id }).update({ teamId: null, updatedAt: now, updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "team", action: "team.deleted", actorUserId: ctx.user.id, summary: `deleted ${team.name}`, subjectType: "team", subjectId: team.id })
  return { ok: true }
}
