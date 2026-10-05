"use server"

import { dashboardsContext } from "./context"
import { dashboardByKey } from "../nav"
import { cleanLayout } from "./layouts"

// Save or reset how this person arranged a dashboard (hidden cards and their order). Only their
// own row; nothing anyone else sees changes.

async function guard(dashboard) {
  const ctx = await dashboardsContext()
  if (!ctx.can("view")) return { error: "Your role can't open Dashboards. Ask an administrator." }
  if (!dashboardByKey(dashboard) || !ctx.has(dashboard)) return { error: "That dashboard isn't in your workspace." }
  return { ctx }
}

// layout: { order: [card keys], hidden: [card keys] }
export async function saveLayout(dashboard, layout) {
  const { ctx, error } = await guard(dashboard)
  if (error) return { error }
  const clean = cleanLayout(dashboard, layout)
  await ctx
    .db("dashboardLayouts")
    .insert({ userId: ctx.user.id, dashboard, layout: JSON.stringify(clean), updatedAt: new Date() })
    .onConflict(["userId", "dashboard"])
    .merge(["layout", "updatedAt"])
  return { ok: true }
}

export async function resetLayout(dashboard) {
  const { ctx, error } = await guard(dashboard)
  if (error) return { error }
  await ctx.db("dashboardLayouts").where({ userId: ctx.user.id, dashboard }).del()
  return { ok: true }
}
