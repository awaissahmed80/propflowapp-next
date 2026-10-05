// Contacts rules shared by the server and the browser: who still needs a CNIC, how possible
// duplicates are found, and how the directory is searched.

// Types that need a CNIC on file: bookings, transfers / NDC and tenancy police registration
export const KYC_TYPES = ["customer", "owner", "tenant"]
export const needsKyc = (c) => !c.hasCnic && c.types.some((t) => KYC_TYPES.includes(t))

// The last 10 digits of a number, so 0300…, +92300… and 92300… match
export const phoneKey = (p) =>
  String(p ?? "")
    .replace(/\D/g, "")
    .slice(-10)
const digits = (s) => String(s ?? "").replace(/\D/g, "")

// Titles and family honorifics people add or leave off: "Ch. Asif Ali" and "Asif Ali" are one name
const HONORIFICS = ["dr", "mr", "mrs", "ms", "ch", "engr", "rana", "malik", "syed", "mian", "haji", "sheikh"]
const HONORIFIC = new RegExp(`^(${HONORIFICS.join("|")})\\.?\\s+`)
export function nameKey(name) {
  let n = String(name ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  for (let prev = null; prev !== n;) {
    prev = n
    n = n.replace(HONORIFIC, "")
  }
  return n.replace(/\./g, "").trim()
}

// Contacts that may be the same person: same CNIC, same mobile or the same name (titles aside).
// Matches chain (A shares a mobile with B, B a name with C → one group).
//   list: [{ id, name, phone, cnic }] (unmasked CNIC) → [{ ids: [...], reasons: ["cnic" | "phone" | "name"] }]
export function duplicateGroups(list) {
  const parent = new Map(list.map((c) => [c.id, c.id]))
  const find = (id) => {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)))
      id = parent.get(id)
    }
    return id
  }
  const reasons = new Map() // root → Set of reasons, filled after the unions
  const pairs = []
  const index = (reason, keyOf) => {
    const seen = new Map()
    for (const c of list) {
      const k = keyOf(c)
      if (!k) continue
      if (seen.has(k)) pairs.push([seen.get(k), c.id, reason])
      else seen.set(k, c.id)
    }
  }
  index("cnic", (c) => (digits(c.cnic).length === 13 ? digits(c.cnic) : null))
  index("phone", (c) => (phoneKey(c.phone).length === 10 ? phoneKey(c.phone) : null))
  index("name", (c) => {
    const k = nameKey(c.name)
    return k.length >= 3 ? k : null
  })
  for (const [a, b] of pairs) parent.set(find(a), find(b))
  for (const [a, , reason] of pairs) {
    const root = find(a)
    reasons.set(root, (reasons.get(root) ?? new Set()).add(reason))
  }
  const groups = new Map()
  for (const c of list) {
    const root = find(c.id)
    if (!reasons.has(root)) continue
    groups.set(root, [...(groups.get(root) ?? []), c.id])
  }
  const order = ["cnic", "phone", "name"]
  return [...groups.entries()].map(([root, ids]) => ({ ids, reasons: order.filter((r) => reasons.get(root).has(r)) }))
}

export const REASON_LABELS = { cnic: "Same CNIC", phone: "Same mobile", name: "Same name" }

// Directory search: name, email, company or code as typed; mobile and CNIC by 4+ digits
export function matchesSearch(c, query) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase()
  if (!q) return true
  if ([c.name, c.email, c.company, c.code].some((v) => v?.toLowerCase().includes(q))) return true
  // "0300 123…" finds +92300123…
  const qd = digits(q).replace(/^0+/, "")
  return qd.length >= 4 && [c.phone, c.cnic].some((v) => v && digits(v).includes(qd))
}
