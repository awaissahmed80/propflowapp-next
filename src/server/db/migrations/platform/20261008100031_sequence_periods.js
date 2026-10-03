// Numbers that restart each year or financial year keep one counter per period, so a record
// dated in an earlier period (a back-dated voucher after the new year started) continues that
// period's numbers instead of restarting at 1 and colliding. See src/server/db/numbering.js.
export async function up(knex) {
  await knex.schema.createTable("sequence_periods", (t) => {
    t.string("key", 60).notNullable()
    t.string("period", 10).notNullable()
    t.bigInteger("next_value").unsigned().notNullable().defaultTo(1)
    t.primary(["key", "period"])
  })
  // Start every period after the highest code already issued in it: the sequence's current
  // counter, and codes found in any table with a `code` column that match its format
  const next = new Map()
  const bump = (key, period, value) => next.set(`${key}|${period}`, Math.max(next.get(`${key}|${period}`) ?? 1, value))
  const seqs = await knex("sequences").whereNot({ reset: "never" }).select("key", "prefix", "format", "period", "next_value")
  const [cols] = await knex.raw("select table_name as t from information_schema.columns where table_schema = database() and column_name = 'code'")
  const tables = [...new Set(cols.map((c) => c.t ?? c.TABLE_NAME))]
  for (const s of seqs) {
    if (s.period) bump(s.key, s.period, Number(s.next_value))
    // "{PREFIX}-{FY}-{SEQ}" → /^BRV-(\d{4})-(\d+)$/ (period first, then the number)
    const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const parts = s.format.split(/(\{[A-Z]+\})/).filter(Boolean)
    if (!parts.includes("{SEQ}") || !parts.some((p) => ["{FY}", "{YYYY}"].includes(p))) continue
    const order = []
    const pattern = parts
      .map((p) => {
        if (p === "{PREFIX}") return esc(s.prefix)
        if (p === "{FY}" || p === "{YYYY}") return (order.push("period"), "(\\d{4})")
        if (p === "{SEQ}") return (order.push("seq"), "(\\d+)")
        if (/^\{[A-Z]+\}$/.test(p)) return ".+?"
        return esc(p)
      })
      .join("")
    const re = new RegExp(`^${pattern}$`)
    for (const t of tables) {
      const codes = await knex(t).where("code", "like", `${s.prefix}%`).pluck("code")
      for (const code of codes) {
        const m = re.exec(code)
        if (!m) continue
        const period = m[order.indexOf("period") + 1]
        bump(s.key, period, Number(m[order.indexOf("seq") + 1]) + 1)
      }
    }
  }
  if (next.size) await knex("sequence_periods").insert([...next].map(([k, v]) => ({ key: k.split("|")[0], period: k.split("|")[1], next_value: v })))
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sequence_periods")
}
