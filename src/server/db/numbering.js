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

// Works with or without the camelCase mapping (trx rows may be next_value or nextValue)
export async function nextCode(trx, key, vars = {}, now = new Date()) {
  const seq = await trx("sequences").where({ key }).forUpdate().first()
  if (!seq) throw new Error(`No numbering sequence "${key}".`)
  const period = currentPeriod(seq.reset, now)
  const stored = seq.period ?? null
  const next = Number(seq.nextValue ?? seq.next_value)
  // A new year or financial year starts again from 1
  const value = period && period !== stored ? 1 : next
  await trx("sequences")
    .where({ key })
    .update({ [seq.nextValue !== undefined ? "nextValue" : "next_value"]: value + 1, period, [seq.nextValue !== undefined ? "updatedAt" : "updated_at"]: trx.fn.now(3) })
  return formatCode(seq, value, vars, now)
}
