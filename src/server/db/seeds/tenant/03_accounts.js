// Starting chart of accounts for a Pakistani developer. Only adds missing codes, so a workspace's
// own accounts and renames are kept. Bank accounts aren't seeded: each workspace adds its real
// banks during setup (the first becomes the default for receipts).
// [code, name, type, parent, { header, kind, system }]
const CHART = [
  ["1000", "Assets", "asset", null, { header: true }],
  ["1100", "Cash & bank", "asset", "1000", { header: true }],
  ["1110", "Cash in hand", "asset", "1100", { kind: "cash", system: true }],
  ["1120", "Petty cash", "asset", "1100", { kind: "cash" }],
  ["1200", "Cheques in clearing", "asset", "1000", { system: true }],
  ["1300", "Receivable from buyers", "asset", "1000", { system: true }],
  ["1400", "Advance income tax", "asset", "1000"],
  ["1500", "Advances to contractors", "asset", "1000"],
  ["1600", "Land", "asset", "1000"],
  ["1700", "Vehicles & equipment", "asset", "1000"],
  ["1800", "Loans & advances to staff", "asset", "1000", { system: true }],
  ["2000", "Liabilities", "liability", null, { header: true }],
  ["2100", "Payable to contractors & vendors", "liability", "2000"],
  ["2300", "Income tax withheld", "liability", "2000", { system: true }],
  ["2400", "Refunds payable to buyers", "liability", "2000", { system: true }],
  ["2500", "Security deposits", "liability", "2000"],
  ["2600", "Running finance", "liability", "2000"],
  ["2700", "EOBI & provident fund payable", "liability", "2000", { system: true }],
  ["3000", "Equity", "equity", null, { header: true }],
  ["3100", "Owners' capital", "equity", "3000"],
  ["3200", "Retained earnings", "equity", "3000"],
  ["3300", "Drawings", "equity", "3000"],
  ["4000", "Income", "income", null, { header: true }],
  ["4100", "Sale of plots & units", "income", "4000", { system: true }],
  ["4200", "Transfer fees", "income", "4000", { system: true }],
  ["4300", "NDC & document fees", "income", "4000", { system: true }],
  ["4400", "Possession fees", "income", "4000", { system: true }],
  ["4500", "Cancellation deductions", "income", "4000", { system: true }],
  ["4600", "Other income", "income", "4000"],
  ["5000", "Cost of sales", "expense", null, { header: true }],
  ["5100", "Development works", "expense", "5000"],
  ["5200", "Construction", "expense", "5000"],
  ["5300", "Approvals & NOC fees", "expense", "5000"],
  ["6000", "Expenses", "expense", null, { header: true }],
  ["6100", "Dealer & agent commission", "expense", "6000", { system: true }],
  ["6200", "Marketing & advertising", "expense", "6000"],
  ["6300", "Salaries & wages", "expense", "6000", { system: true }],
  ["6400", "Office rent", "expense", "6000"],
  ["6500", "Utilities", "expense", "6000"],
  ["6600", "Vehicles & fuel", "expense", "6000"],
  ["6700", "Legal & professional", "expense", "6000"],
  ["6800", "Bank charges", "expense", "6000"],
  ["6900", "General & admin", "expense", "6000"],
]

export async function seed(knex) {
  const existing = new Set(await knex("accounts").whereNull("deleted_at").pluck("code"))
  const rows = CHART.filter(([code]) => !existing.has(code)).map(([code, name, type, parent, o = {}]) => ({
    code,
    name,
    type,
    parent_code: parent,
    is_header: Boolean(o.header),
    kind: o.kind ?? null,
    is_system: Boolean(o.system),
    is_default: code === "1110",
    sort_order: Number(code),
  }))
  if (rows.length) await knex("accounts").insert(rows)
}
