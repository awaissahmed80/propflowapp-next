import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { getLookups } from "@/modules/lookups/server"
import { ensureContact, linkContact } from "@/modules/contacts/server/links"
import { OWNER_TYPES, SALARY_PARTS, monthlyGross } from "@/modules/hr/constants"
import { hrRules } from "@/modules/hr/server/payroll"
import * as V from "../values"

// Employees import, like adding them by hand: designation and department from your lists,
// employment type (permanent when empty), CNIC unique among current employees, linked to a contact
// (matched by mobile). Pay (salary parts, bank) is taken only from people allowed to set salaries
// and must reach the minimum wage. A row matches a current employee with the same CNIC, or the
// same mobile; "update" fills that employee's empty fields.

const RELATIONS = { "s/o": "S/O", so: "S/O", "d/o": "D/O", do: "D/O", "w/o": "W/O", wo: "W/O" }

export const employeesImporter = {
  key: "employees",
  async prepare(ctx) {
    const [lists, rules] = await Promise.all([getLookups(ctx.db, ["designation", "department", "employment-type"]), hrRules(ctx.db)])
    return { ctx, lists, rules, salaries: Boolean(ctx.grant?.("hr.salaries")), seen: new Set() }
  },

  async check(prep, r) {
    const errors = []
    const warnings = []
    const take = (res, field, warn = false) => {
      if (!res) return null
      if (res.error) {
        ;(warn ? warnings : errors).push(`${field}: ${res.error}${warn ? " (left empty)" : ""}`)
        return null
      }
      return res.value
    }
    const name = take(V.text(r.name, 150), "Name")
    if (!name) errors.push("Name is empty")
    const joinedOn = take(V.date(r.joinedOn), "Joining date")
    if (!joinedOn && !errors.some((e) => e.startsWith("Joining"))) errors.push("Joining date is empty")
    const designation = take(V.lookup(prep.lists.designation, r.designation, "designation"), "Designation")
    if (V.isEmpty(r.designation)) errors.push("Designation is empty")
    const department = take(V.lookup(prep.lists.department, r.department, "department"), "Department")
    if (V.isEmpty(r.department)) errors.push("Department is empty")
    const employmentType = take(V.lookup(prep.lists["employment-type"], r.employmentType, "employment type"), "Employment type") ?? (V.isEmpty(r.employmentType) ? "permanent" : null)
    const relation = V.isEmpty(r.guardianRelation) ? null : (RELATIONS[String(r.guardianRelation).trim().toLowerCase()] ?? null)
    const g = String(r.gender ?? "")
      .trim()
      .toLowerCase()
    const gender = ["male", "m", "man"].includes(g) ? "male" : ["female", "f", "woman"].includes(g) ? "female" : null

    // Pay
    const parts = Object.fromEntries(SALARY_PARTS.map((p) => [p.key, take(V.money(r[p.key]), p.label)]))
    const hasPay = Object.values(parts).some((v) => v != null)
    let salary = null
    if (hasPay && !prep.salaries) warnings.push("Salary: your role can't set salaries (left at zero)")
    else if (hasPay) {
      salary = Object.fromEntries(SALARY_PARTS.map((p) => [p.key, parts[p.key] ?? 0]))
      if (!["daily-wage", ...OWNER_TYPES].includes(employmentType) && monthlyGross(salary) < prep.rules.minimumWage)
        errors.push(`Salary: below the minimum wage (Rs ${prep.rules.minimumWage.toLocaleString("en-US")} a month)`)
    }
    const iban = V.isEmpty(r.iban) ? null : String(r.iban).replace(/\s/g, "").toUpperCase()
    if (iban && !/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) errors.push(`IBAN: “${r.iban}” isn't an IBAN (PK36SCBL0000001123456702)`)
    const payMethod = /cash/i.test(String(r.payMethod ?? "")) ? "cash" : "bank"

    const data = {
      name,
      joinedOn,
      designation,
      department,
      employmentType,
      gender,
      guardianRelation: relation,
      guardianName: take(V.text(r.guardianName, 150), "Father / husband name"),
      cnic: take(V.cnic(r.cnic), "CNIC"),
      phone: take(V.phone(r.phone), "Mobile"),
      email: take(V.email(r.email), "Email", true),
      dateOfBirth: take(V.date(r.dateOfBirth), "Date of birth", true),
      eobiNo: take(V.text(r.eobiNo, 30), "EOBI no."),
      ntn: take(V.text(r.ntn, 20), "NTN"),
      address: take(V.text(r.address, 300), "Address"),
      notes: take(V.text(r.notes, 500), "Notes"),
      salary,
      payMethod,
      bankName: payMethod === "cash" ? null : take(V.text(r.bankName, 100), "Bank"),
      accountTitle: payMethod === "cash" ? null : take(V.text(r.accountTitle, 150), "Account title"),
      iban: payMethod === "cash" ? null : iban,
    }
    if (data.cnic && prep.seen.has(data.cnic)) errors.push("CNIC: on an earlier row too")
    return { data, errors, warnings, label: [name, data.cnic ?? data.phone].filter(Boolean).join(" · ") || "(empty row)" }
  },

  async match(prep, d) {
    const q = () => live(prep.ctx.db, "employees").where({ status: "active" }).select("id", "code")
    return (d.cnic ? await q().where({ cnic: d.cnic }).first() : null) ?? (d.phone ? await q().where({ phone: d.phone }).first() : null)
  },

  remember(prep, d) {
    if (d?.cnic) prep.seen.add(d.cnic)
  },

  async create(prep, d) {
    const uid = prep.ctx.user.id
    const { salary, ...rest } = d
    await prep.ctx.db.transaction(async (trx) => {
      const code = await nextCode(trx, "employee")
      const [id] = await trx("employees").insert({
        ...rest,
        code,
        status: "active",
        salary: JSON.stringify(salary ?? Object.fromEntries(SALARY_PARTS.map((p) => [p.key, 0]))),
        pf: false,
        createdBy: uid,
      })
      const contactId = await ensureContact(trx, { name: d.name, phone: d.phone, email: d.email, cnic: d.cnic }, uid)
      await linkContact(trx, contactId, { type: "employee", id, role: "employee" }, uid)
      await trx("employees").where({ id }).update({ contactId })
    })
  },

  async update(prep, existing, d) {
    const { db } = prep.ctx
    const e = await db("employees").where({ id: existing.id }).first()
    const patch = {}
    for (const k of ["gender", "guardianRelation", "guardianName", "cnic", "phone", "email", "dateOfBirth", "eobiNo", "ntn", "address", "bankName", "accountTitle", "iban"])
      if ((e[k] == null || e[k] === "") && d[k] != null) patch[k] = d[k]
    // Pay only when they had none yet
    const pay = typeof e.salary === "string" ? JSON.parse(e.salary) : (e.salary ?? {})
    if (d.salary && !monthlyGross(pay)) patch.salary = JSON.stringify(d.salary)
    if (!Object.keys(patch).length) return false
    await db("employees")
      .where({ id: e.id })
      .update({ ...patch, updatedAt: new Date(), updatedBy: prep.ctx.user.id })
    return true
  },
}
