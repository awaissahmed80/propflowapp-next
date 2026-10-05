import { datetime, externalId, money, tableDefaults, timestamps } from "../../columns.js"

// HR & Payroll: everyone on the payroll (an employee may or may not have a portal login), leave,
// loans and advances recovered through payroll, duty posts with shifts and weekly patterns,
// daily attendance, and monthly payroll runs with one payslip line per employee.
export async function up(knex) {
  await knex.schema.createTable("employees", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable().unique() // EMP-00001
    externalId(t, "user_id").nullable().index() // portal login, when they have one
    t.bigInteger("contact_id").unsigned().nullable().index()
    t.string("name", 150).notNullable()
    t.string("gender", 10).nullable() // male | female
    t.string("guardian_relation", 5).nullable() // S/O | D/O | W/O
    t.string("guardian_name", 150).nullable()
    t.string("cnic", 15).nullable().index()
    t.string("phone", 20).nullable()
    t.string("email", 150).nullable()
    t.date("date_of_birth").nullable()
    t.string("designation", 50).nullable() // designation lookup
    t.string("department", 50).nullable() // department lookup
    t.bigInteger("team_id").unsigned().nullable()
    t.bigInteger("project_id").unsigned().nullable() // where they're based; null: head office
    t.string("employment_type", 20).notNullable().defaultTo("permanent") // employment-type lookup
    t.date("joined_on").notNullable()
    t.date("left_on").nullable()
    t.string("end_reason", 300).nullable()
    t.string("status", 12).notNullable().defaultTo("active").index() // active | left
    t.json("salary").notNullable() // { basic, house, utilities, medical, fuel, other } per month
    t.boolean("pf").notNullable().defaultTo(false) // provident fund member
    t.string("pay_method", 10).notNullable().defaultTo("bank") // bank | cash
    t.string("bank_name", 100).nullable()
    t.string("account_title", 150).nullable()
    t.string("iban", 34).nullable()
    t.string("eobi_no", 30).nullable()
    t.string("ntn", 20).nullable()
    t.string("address", 300).nullable()
    t.json("emergency").nullable() // { name, relation, phone }
    t.string("notes", 500).nullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("leave_requests", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable().unique() // LV-2026-00001
    t.bigInteger("employee_id").unsigned().notNullable().index()
    t.string("type", 20).notNullable() // leave-type lookup
    t.date("start_on").notNullable()
    t.date("end_on").notNullable()
    t.decimal("days", 5, 1).notNullable()
    t.string("reason", 500).nullable()
    t.string("status", 12).notNullable().defaultTo("pending").index() // pending | approved | rejected | cancelled
    externalId(t, "decided_by").nullable()
    datetime(t, "decided_at").nullable()
    t.string("decision_note", 500).nullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("loans", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable().unique() // LN-00001
    t.bigInteger("employee_id").unsigned().notNullable().index()
    t.string("kind", 10).notNullable() // loan | advance
    money(t, "amount").notNullable()
    money(t, "installment").notNullable() // recovered each payroll month
    t.string("start_month", 7).notNullable() // first month recovered: 2026-11
    t.string("reason", 500).nullable()
    t.string("status", 12).notNullable().defaultTo("pending").index() // pending | active | closed | rejected
    t.bigInteger("account_id").unsigned().nullable() // paid out from (cash / bank)
    datetime(t, "given_at").nullable()
    externalId(t, "approved_by").nullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("duty_posts", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable().unique() // PST-00001
    t.string("name", 120).notNullable()
    t.bigInteger("project_id").unsigned().nullable() // null: head office
    t.string("kind", 20).notNullable() // post-kind lookup: security, maintenance, site, office, transport…
    t.json("shifts").notNullable() // [{ key: day|night|…, label, start: "08:00", end: "20:00", needed, days?: [0-6] }]
    t.boolean("is_active").notNullable().defaultTo(true)
    timestamps(t, knex)
  })
  // Who regularly works which shift on which weekdays (0 = Sunday), optionally swapping day and
  // night every other week, or only in odd / even weeks
  await knex.schema.createTable("duty_patterns", (t) => {
    t.bigIncrements("id")
    t.bigInteger("employee_id").unsigned().notNullable().index()
    t.bigInteger("post_id").unsigned().notNullable().index()
    t.string("shift_key", 20).notNullable()
    t.json("days").notNullable()
    t.boolean("rotate").notNullable().defaultTo(false)
    t.string("weeks", 4).nullable() // odd | even
    externalId(t, "created_by").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3))
  })
  // One-day changes to the pattern: someone taken off, or someone covering
  await knex.schema.createTable("duty_overrides", (t) => {
    t.bigIncrements("id")
    t.date("on_date").notNullable().index()
    t.bigInteger("employee_id").unsigned().notNullable()
    t.bigInteger("post_id").unsigned().notNullable()
    t.string("shift_key", 20).notNullable()
    t.string("kind", 10).notNullable() // add | remove
    t.string("note", 300).nullable()
    externalId(t, "created_by").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3))
  })
  await knex.schema.createTable("attendance", (t) => {
    t.bigIncrements("id")
    t.bigInteger("employee_id").unsigned().notNullable()
    t.date("on_date").notNullable()
    t.string("status", 10).notNullable() // present | late | absent
    t.string("note", 300).nullable()
    externalId(t, "marked_by").nullable()
    datetime(t, "marked_at").notNullable().defaultTo(knex.fn.now(3))
    t.unique(["employee_id", "on_date"])
  })
  await knex.schema.createTable("payroll_runs", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable().unique() // PR-2026-10
    t.string("month", 7).notNullable().unique() // 2026-10
    t.string("status", 12).notNullable().defaultTo("draft").index() // draft | approved | paid
    money(t, "gross").notNullable().defaultTo(0)
    money(t, "deductions").notNullable().defaultTo(0)
    money(t, "net").notNullable().defaultTo(0)
    t.integer("people").notNullable().defaultTo(0)
    externalId(t, "approved_by").nullable()
    datetime(t, "approved_at").nullable()
    externalId(t, "paid_by").nullable()
    datetime(t, "paid_at").nullable()
    t.bigInteger("account_id").unsigned().nullable() // bank transfers paid from
    t.string("notes", 500).nullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("payroll_lines", (t) => {
    t.bigIncrements("id")
    t.bigInteger("run_id").unsigned().notNullable().index()
    t.bigInteger("employee_id").unsigned().notNullable().index()
    t.json("earnings").notNullable() // the salary parts paid this month (pro-rated for part months)
    money(t, "gross").notNullable()
    t.decimal("unpaid_days", 5, 1).notNullable().defaultTo(0) // unpaid leave + absences + extra
    t.decimal("extra_unpaid_days", 5, 1).notNullable().defaultTo(0) // added by hand on the draft
    money(t, "unpaid_deduction").notNullable().defaultTo(0)
    money(t, "bonus").notNullable().defaultTo(0) // bonus / overtime
    money(t, "other_deduction").notNullable().defaultTo(0)
    money(t, "taxable").notNullable().defaultTo(0)
    money(t, "tax").notNullable().defaultTo(0)
    money(t, "eobi").notNullable().defaultTo(0)
    money(t, "eobi_employer").notNullable().defaultTo(0)
    money(t, "pf").notNullable().defaultTo(0)
    money(t, "pf_employer").notNullable().defaultTo(0)
    money(t, "loan").notNullable().defaultTo(0)
    t.json("loans").nullable() // [{ loanId, code, amount }]
    money(t, "net").notNullable()
    t.string("pay_method", 10).notNullable() // bank | cash
    t.string("note", 300).nullable() // printed on the payslip
    t.unique(["run_id", "employee_id"])
  })
  for (const [key, prefix, format, padding, reset] of [
    ["employee", "EMP", "{PREFIX}-{SEQ}", 5, "never"],
    ["leave", "LV", "{PREFIX}-{YYYY}-{SEQ}", 5, "yearly"],
    ["loan", "LN", "{PREFIX}-{SEQ}", 5, "never"],
    ["duty-post", "PST", "{PREFIX}-{SEQ}", 4, "never"],
  ])
    await knex("sequences").insert({ key, prefix, format, padding, reset, next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  for (const t of ["payroll_lines", "payroll_runs", "attendance", "duty_overrides", "duty_patterns", "duty_posts", "loans", "leave_requests", "employees"]) await knex.schema.dropTableIfExists(t)
  await knex("sequences").whereIn("key", ["employee", "leave", "loan", "duty-post"]).delete()
}
