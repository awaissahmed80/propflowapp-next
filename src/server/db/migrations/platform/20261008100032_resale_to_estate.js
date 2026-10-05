// "Resale & rentals" moved from Project Portfolio to Estate Management (it's about units buyers
// own). Plans and workspaces that had it switched off keep it switched off, now on Estate Management.
const parse = (v) => (Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v || "[]") : [])

async function move(knex, from, to) {
  const apps = Object.fromEntries((await knex("apps").whereIn("code", [from, to]).select("id", "code")).map((a) => [a.code, a.id]))
  if (!apps[from] || !apps[to]) return
  for (const [table, owner] of [
    ["tenant_apps", "tenant_id"],
    ["plan_apps", "plan_id"],
  ]) {
    const rows = await knex(table).where({ app_id: apps[from] }).whereNotNull("off_features").select(owner, "off_features")
    for (const r of rows) {
      const off = parse(r.off_features)
      if (!off.includes("resale")) continue
      await knex(table)
        .where({ [owner]: r[owner], app_id: apps[from] })
        .update({ off_features: JSON.stringify(off.filter((k) => k !== "resale")) })
      const target = await knex(table)
        .where({ [owner]: r[owner], app_id: apps[to] })
        .first("off_features")
      if (target) {
        const t = parse(target.off_features)
        if (!t.includes("resale"))
          await knex(table)
            .where({ [owner]: r[owner], app_id: apps[to] })
            .update({ off_features: JSON.stringify([...t, "resale"]) })
      }
    }
  }
}

export const up = (knex) => move(knex, "portfolio", "estate")
export const down = (knex) => move(knex, "estate", "portfolio")
