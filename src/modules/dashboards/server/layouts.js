import "server-only"
import { cardsOf } from "./cards"

// Each person's arrangement of a dashboard (dashboard_layouts): { order: [card keys], hidden: [card keys] }.
// No row means the default: every card, in the order cards.js lists them.

const parse = (v) => {
  if (v == null) return null
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

// Only keys of this dashboard's cards, each once
export function cleanLayout(dashboard, input) {
  const keys = new Set(cardsOf(dashboard).map((c) => c.key))
  const pick = (list) => [...new Set((Array.isArray(list) ? list : []).filter((k) => typeof k === "string" && keys.has(k)))]
  return { order: pick(input?.order), hidden: pick(input?.hidden) }
}

export async function getLayout(ctx, dashboard) {
  const row = await ctx.db("dashboardLayouts").where({ userId: ctx.user.id, dashboard }).first("layout")
  return row ? cleanLayout(dashboard, parse(row.layout)) : null
}

// Cards in the person's order (cards new since they arranged it go after, in the default order),
// each marked hidden or not → [{ card, src, hidden }]
export function arrange(visible, layout) {
  if (!layout) return visible.map((v) => ({ ...v, hidden: false }))
  const at = (key) => {
    const i = layout.order.indexOf(key)
    return i === -1 ? Infinity : i
  }
  return visible
    .map((v, i) => ({ ...v, i, hidden: layout.hidden.includes(v.card.key) }))
    .sort((a, b) => at(a.card.key) - at(b.card.key) || a.i - b.i)
    .map(({ i, ...v }) => v)
}
