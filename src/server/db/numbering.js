// Human codes from the `sequences` table: TEN00042, INV-2026-00012, BPV-2627-00045.
// Call inside the transaction that saves the record, so two people saving at once never get
// the same number and a failed save doesn't use one up:
//   await db.transaction(async (trx) => { const code = await nextCode(trx, "invoice"); … })
// Format tokens: {PREFIX} {YYYY} {YY} {FY} {SEQ}, plus any passed in vars, e.g. {PROJECT}.

const PK_TZ = "Asia/Karachi"

// Year and month as they are in Pakistan right now
function pakistanDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: PK_TZ, year: "numeric", month: "numeric" }).formatToParts(now).map((p) => [p.type, p.value]))
  return { year: Number(parts.year), month: Number(parts.month) }
}

// Financial year July–June as "2627" for Jul 2026 – Jun 2027
export function financialYear(now = new Date()) {
  const { year, month } = pakistanDate(now)
  const start = month >= 7 ? year : year - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

function currentPeriod(reset, now) {
  if (reset === "yearly") return String(pakistanDate(now).year)
  if (reset === "fiscal") return financialYear(now)
  return null
}

export function formatCode(seq, value, vars = {}, now = new Date()) {
  const { year } = pakistanDate(now)
  const tokens = {
    PREFIX: seq.prefix,
    YYYY: String(year),
    YY: String(year).slice(-2),
    FY: financialYear(now),
    SEQ: String(value).padStart(seq.padding, "0"),
    ...vars,
  }
  return seq.format.replace(/\{([A-Z]+)\}/g, (m, t) => {
    if (tokens[t] === undefined) throw new Error(`Numbering format "${seq.format}" needs {${t}}.`)
    return tokens[t]
  })
}

// Works with or without the camelCase mapping (trx rows may be next_value or nextValue). Numbers
// that restart each year or financial year count per period (sequence_periods), so a record dated
// in an earlier period continues that period's numbers; `sequences` keeps the latest period's.
export async function nextCode(trx, key, vars = {}, now = new Date()) {
  const seq = await trx("sequences").where({ key }).forUpdate().first()
  if (!seq) throw new Error(`No numbering sequence "${key}".`)
  const camel = seq.nextValue !== undefined
  const next = Number(seq.nextValue ?? seq.next_value)
  const period = currentPeriod(seq.reset, now)
  const stored = seq.period ?? null
  let value = next
  if (period) {
    await trx.raw("insert ignore into sequence_periods (`key`, period, next_value) values (?, ?, ?)", [key, period, period === stored ? next : 1])
    const [rows] = await trx.raw("select next_value from sequence_periods where `key` = ? and period = ? for update", [key, period])
    value = Number(rows[0].next_value ?? rows[0].nextValue)
    await trx.raw("update sequence_periods set next_value = ? where `key` = ? and period = ?", [value + 1, key, period])
  }
  // An earlier period's number leaves the current counter alone
  if (!period || !stored || period >= stored) {
    await trx("sequences")
      .where({ key })
      .update({ [camel ? "nextValue" : "next_value"]: value + 1, period, [camel ? "updatedAt" : "updated_at"]: trx.fn.now(3) })
  }
  return formatCode(seq, value, vars, now)
}
