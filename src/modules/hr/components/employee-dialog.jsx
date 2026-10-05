"use client"

import { useMemo, useState, useTransition } from "react"
import { toastAction } from "@/lib/toast-action"
import { formatCnic } from "@/lib/cnic"
import { formatPkPhone } from "@/lib/phone"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { SALARY_PARTS, monthlyGross } from "../constants"
import { saveEmployee } from "../server/employee-actions"
import { pkToday, rs } from "./people-parts"

const zeroSalary = Object.fromEntries(SALARY_PARTS.map((p) => [p.key, 0]))

// Pakistani split of a gross figure: basic ≈ 60%, house rent 45% of basic, utilities and
// medical 10% of basic each; fuel and other allowances stay as entered
function splitGross(gross, salary) {
  const fixed = Number(salary.fuel ?? 0) + Number(salary.other ?? 0)
  const basic = Math.round(Math.max(0, gross - fixed) / 1.65 / 100) * 100
  const utilities = Math.round(basic * 0.1)
  const medical = Math.round(basic * 0.1)
  return { ...salary, basic, house: Math.max(0, gross - fixed - basic - utilities - medical), utilities, medical }
}

// New employee, or edit one (employee: getEmployee()).
//   teams: [{ id, name }] · projects: [{ code, name }] · canPay: hr.salaries (salary and bank)
export function EmployeeDialog({ employee, teams, projects, canPay, onClose, onSaved }) {
  const employmentTypes = useList("employment-type")
  const designations = useList("designation")
  const departments = useList("department")
  const initial = useMemo(() => {
    const e = employee ?? {}
    return {
      name: e.name ?? "",
      gender: e.gender ?? "male",
      guardianRelation: e.guardianRelation ?? "S/O",
      guardianName: e.guardianName ?? "",
      cnic: e.cnicMasked ? null : (e.cnic ?? ""),
      phone: e.phone ? formatPkPhone(e.phone) : "",
      email: e.email ?? "",
      dateOfBirth: e.dateOfBirth ?? "",
      designation: e.designation ?? designations.defaultValue ?? "",
      department: e.department ?? departments.defaultValue ?? "",
      teamId: e.teamId ?? null,
      project: e.project?.code ?? "",
      employmentType: e.employmentType ?? (employmentTypes.map.probation ? "probation" : (employmentTypes.defaultValue ?? "")),
      joinedOn: e.joinedOn ?? pkToday(),
      eobiNo: e.eobiNo ?? "",
      ntn: e.ntn ?? "",
      address: e.address ?? "",
      emergency: { name: e.emergency?.name ?? "", relation: e.emergency?.relation ?? "", phone: e.emergency?.phone ?? "" },
      notes: e.notes ?? "",
      ...(canPay
        ? {
            salary: { ...zeroSalary, ...(e.pay?.salary ?? {}) },
            pf: e.pay?.pf ?? false,
            payMethod: e.pay?.payMethod ?? "bank",
            bankName: e.pay?.bankName ?? "",
            accountTitle: e.pay?.accountTitle ?? "",
            iban: e.pay?.iban ?? "",
          }
        : {}),
    }
  }, [employee, canPay, designations.defaultValue, departments.defaultValue, employmentTypes.map.probation, employmentTypes.defaultValue])
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  const gross = canPay ? monthlyGross(f.salary) : 0

  const save = () =>
    startTransition(async () => {
      setErrors({})
      const { cnic, ...rest } = f
      const input = cnic === null ? rest : { ...rest, cnic }
      const r = await toastAction(() => saveEmployee(employee?.code ?? null, input), { loading: "Saving…", success: (x) => (employee ? `${f.name} saved.` : `${f.name} added (${x.code}).`) })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onSaved(r)
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={employee ? `Edit ${employee.name}` : "New employee"}
      description={employee ? null : "Anyone on the payroll, with or without a portal login. Link a login afterwards from their page."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} disabled={!f.name.trim() || (employee && !dirty)} onClick={save}>
            {employee ? "Save changes" : "Add employee"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name as on CNIC" required value={f.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
          {f.cnic === null ? (
            <Input label="CNIC" value={employee.cnic} disabled info="Your role sees CNICs masked, so it can't be changed here." />
          ) : (
            <Input label="CNIC" inputMode="numeric" placeholder="35202-1234567-1" value={f.cnic} onChange={(e) => set({ cnic: formatCnic(e.target.value) })} error={errors.cnic} />
          )}
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <Select
              label="Relation"
              value={f.guardianRelation}
              onChange={(v) => set({ guardianRelation: v })}
              options={[
                { value: "S/O", label: "S/O" },
                { value: "D/O", label: "D/O" },
                { value: "W/O", label: "W/O" },
              ]}
            />
            <Input label={f.guardianRelation === "W/O" ? "Husband's name" : "Father's name"} value={f.guardianName} onChange={(e) => set({ guardianName: e.target.value })} error={errors.guardianName} />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">Gender</p>
            <ToggleGroup
              value={f.gender}
              onChange={(v) => set({ gender: v })}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
            />
          </div>
          <Input label="Mobile" inputMode="tel" placeholder="0300 1234567" value={f.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
          <DatePicker label="Date of birth" value={f.dateOfBirth} onChange={(v) => set({ dateOfBirth: v || "" })} error={errors.dateOfBirth} />
          <Input label="Address" value={f.address} onChange={(e) => set({ address: e.target.value })} error={errors.address} />
        </div>

        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Job</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <LookupSelect list="designation" label="Designation" value={f.designation} onChange={(v) => set({ designation: v })} error={errors.designation} />
            <LookupSelect list="department" label="Department" value={f.department} onChange={(v) => set({ department: v })} error={errors.department} />
            <Select label="Employment" value={f.employmentType} onChange={(v) => set({ employmentType: v ?? "" })} options={employmentTypes.options} error={errors.employmentType} />
            <DatePicker label="Joined on" clearable={false} value={f.joinedOn} onChange={(v) => v && set({ joinedOn: v })} error={errors.joinedOn} />
            <Select
              label="Based at"
              value={f.project}
              onChange={(v) => set({ project: v ?? "" })}
              options={[{ value: "", label: "Head office" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]}
              error={errors.project}
            />
            <Select
              label="Team"
              placeholder="No team"
              value={f.teamId ? String(f.teamId) : ""}
              onChange={(v) => set({ teamId: v ? Number(v) : null })}
              options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))]}
              error={errors.teamId}
            />
            <Input label="EOBI no." value={f.eobiNo} onChange={(e) => set({ eobiNo: e.target.value })} error={errors.eobiNo} />
            <Input label="NTN" value={f.ntn} onChange={(e) => set({ ntn: e.target.value })} error={errors.ntn} />
          </div>
        </fieldset>

        {canPay && (
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Monthly salary · gross {rs(gross)}</legend>
            <div className="flex flex-wrap items-end gap-3">
              <NumberInput
                className="w-48"
                label="Split a gross figure"
                prefix="Rs"
                min={0}
                step={1000}
                format={{ maximumFractionDigits: 0 }}
                value={gross}
                onChange={(v) => set({ salary: splitGross(v ?? 0, f.salary) })}
              />
              <p className="pb-2 text-xs text-muted-foreground">Basic about 60%, house rent 45% of basic, utilities and medical 10% of basic each.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SALARY_PARTS.map((p) => (
                <NumberInput
                  key={p.key}
                  label={p.label}
                  min={0}
                  step={500}
                  format={{ maximumFractionDigits: 0 }}
                  value={f.salary[p.key] ?? 0}
                  onChange={(v) => set({ salary: { ...f.salary, [p.key]: v ?? 0 } })}
                  error={errors[`salary.${p.key}`]}
                />
              ))}
            </div>
            <Checkbox label="Provident fund member" description="Employee and employer each put a share of basic in every month." checked={f.pf} onChange={(v) => set({ pf: v })} />
            <div className="space-y-3 border-t pt-3">
              <ToggleGroup
                value={f.payMethod}
                onChange={(v) => set({ payMethod: v })}
                options={[
                  { value: "bank", label: "Paid into a bank account", icon: "bank-line" },
                  { value: "cash", label: "Paid in cash", icon: "wallet-3-line" },
                ]}
              />
              {f.payMethod === "bank" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Bank" placeholder="e.g. Meezan Bank" value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} error={errors.bankName} />
                  <Input label="Account title" value={f.accountTitle} onChange={(e) => set({ accountTitle: e.target.value })} error={errors.accountTitle} />
                  <Input label="IBAN" placeholder="PK36SCBL0000001123456702" value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })} error={errors.iban} />
                </div>
              )}
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Emergency contact</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Name" value={f.emergency.name} onChange={(e) => set({ emergency: { ...f.emergency, name: e.target.value } })} />
            <Input label="Relation" placeholder="e.g. Brother" value={f.emergency.relation} onChange={(e) => set({ emergency: { ...f.emergency, relation: e.target.value } })} />
            <Input label="Mobile" inputMode="tel" value={f.emergency.phone} onChange={(e) => set({ emergency: { ...f.emergency, phone: e.target.value } })} />
          </div>
        </fieldset>
        <Textarea label="Notes" rows={2} maxLength={500} value={f.notes} onChange={(e) => set({ notes: e.target.value })} error={errors.notes} />
      </div>
    </Dialog>
  )
}
