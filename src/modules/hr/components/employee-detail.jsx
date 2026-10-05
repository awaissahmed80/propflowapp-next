"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, tenure } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Textarea } from "@/components/ui/textarea"
import { RUN_STATUS, SALARY_PARTS } from "../constants"
import { endEmployment, linkLogin } from "../server/employee-actions"
import { EmployeeDialog } from "./employee-dialog"
import { ApplyLeaveDialog } from "./leave-dialogs"
import { LeaveBalance, LeaveStatusBadge, LeaveTypeBadge, LoanStatusBadge, MoreLink, dateRange, daysLabel, monthLabel, pkToday, rs } from "./people-parts"

const num = (v) => new Intl.NumberFormat("en-PK").format(Math.round(Number(v) || 0))

// HR › Employees › one employee.
//   employee: getEmployee() · teams / projects: for editing · members: logins that can be linked
//   leave: { employees, balances } when leave can be applied for here
//   can: { edit, create, pay (hr.salaries), approveLeave, payroll (feature) }
export function EmployeeDetail({ employee: e, teams, projects, members, leave, can }) {
  const router = useRouter()
  const designations = useList("designation")
  const departments = useList("department")
  const employmentTypes = useList("employment-type")
  const [dialog, setDialog] = useState(null) // edit | leave | end | login
  const [, startTransition] = useTransition()
  const done = () => {
    setDialog(null)
    router.refresh()
  }

  const unlink = async () => {
    const ok = await confirm({
      title: `Unlink ${e.login.name}'s login?`,
      description: "The employee record stays; they just stop seeing their own leave and payslips in My Desk. Their access to the workspace isn't changed.",
      confirmLabel: "Unlink",
      destructive: true,
      icon: "link-unlink",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => linkLogin(e.code, null), { loading: "Saving…", success: "Login unlinked." })
      if (r?.ok) router.refresh()
    })
  }

  const menu = [
    ...(can.edit && !e.login ? [{ label: "Link a portal login", icon: "link", onClick: () => setDialog("login") }] : []),
    ...(can.edit && e.login ? [{ label: "Unlink portal login", icon: "link-unlink", onClick: unlink }] : []),
    ...(can.edit && e.status === "active" && !e.isMe ? [{ type: "separator" }, { label: "End employment", icon: "door-open-line", variant: "destructive", onClick: () => setDialog("end") }] : []),
  ]
  const p = e.pay

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/hrm/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Employees
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={e.name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{e.name}</h1>
                {e.status === "left" ? <Badge color="gray">Left {formatDate(e.leftOn)}</Badge> : e.onLeave ? <Badge color="sky">On leave</Badge> : null}
                {e.employmentType === "probation" && e.status === "active" && <Badge color="amber">{employmentTypes.label("probation")}</Badge>}
                {e.isMe && <Badge color="blue">You</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{[designations.label(e.designation), departments.label(e.department), e.code].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {leave && (
              <Button variant="outline" leftIcon="calendar-check-line" onClick={() => setDialog("leave")}>
                Apply for leave
              </Button>
            )}
            {can.edit && (
              <Button variant="outline" leftIcon="edit-line" onClick={() => setDialog("edit")}>
                Edit
              </Button>
            )}
            {menu.length > 0 && <DropdownMenu align="end" items={menu} trigger={<IconButton icon="more-2-line" variant="outline" aria-label="More actions" tooltip={false} />} />}
          </div>
        </div>
        {e.status === "left" && e.endReason && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Icon name="door-open-line" /> Last working day {formatDate(e.leftOn)}: {e.endReason}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {p && (
            <SectionCard title="Salary" action={<span className="text-sm font-semibold tabular-nums">{rs(p.gross)} a month</span>}>
              {p.gross ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {SALARY_PARTS.map((s) => (
                      <div key={s.key} className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-sm font-medium tabular-nums">{num(p.salary[s.key])}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {p.pf ? "Provident fund member" : "No provident fund"} ·{" "}
                    {p.payMethod === "cash" ? "Paid in cash" : `Paid into ${[p.bankName, p.iban ? `••••${p.iban.slice(-4)}` : null].filter(Boolean).join(" ") || "a bank account"}`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No salary set yet. {can.edit && can.pay ? "Edit to add it; payroll pays nothing until then." : ""}</p>
              )}
            </SectionCard>
          )}

          <SectionCard title={`Leave in ${e.year}`} action={<MoreLink href="/hrm/leave">Leave</MoreLink>}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {e.balances.map((b) => (
                <LeaveBalance key={b.type} balance={b} />
              ))}
            </div>
            {e.leaves.length > 0 && (
              <ul className="mt-4 divide-y border-t">
                {e.leaves.map((l) => (
                  <li key={l.code} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <LeaveTypeBadge type={l.type} />
                    <span className="min-w-0 flex-1">
                      {dateRange(l.startOn, l.endOn)} · {daysLabel(l.days)}
                      {(l.reason || l.decisionNote) && <span className="block truncate text-xs text-muted-foreground">{[l.reason, l.decisionNote && `Note: ${l.decisionNote}`].filter(Boolean).join(" · ")}</span>}
                    </span>
                    <LeaveStatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {p && can.payroll && (
            <SectionCard title="Payslips" bodyClassName="p-2">
              {e.payslips.length ? (
                <ul>
                  {e.payslips.map((s) => (
                    <li key={s.run}>
                      <Link href={`/hrm/payroll/${urlCode(s.run)}?employee=${urlCode(e.code)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60">
                        <Icon name="file-list-3-line" className="text-muted-foreground" />
                        <span className="flex-1">{monthLabel(s.month)}</span>
                        <span className="text-xs text-muted-foreground">{s.status === "paid" ? `Paid ${formatDate(s.paidAt)}` : RUN_STATUS[s.status]?.label}</span>
                        <span className="w-28 text-right font-medium tabular-nums">{rs(s.net)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-2 text-sm text-muted-foreground">No payslips yet. They show here once a payroll run with {e.name} is approved.</p>
              )}
            </SectionCard>
          )}
        </div>

        <aside className="space-y-6">
          <SectionCard title="Personal">
            <div className="divide-y">
              <DetailRow icon="user-3-line" label="Name">
                {e.name}
                {e.guardianName && (
                  <span className="block text-xs text-muted-foreground">
                    {e.guardianRelation} {e.guardianName}
                  </span>
                )}
              </DetailRow>
              <DetailRow icon="bank-card-2-line" label="CNIC">
                <span className="tabular-nums">{e.cnic ?? "—"}</span>
              </DetailRow>
              <DetailRow icon="phone-line" label="Mobile">
                {e.phone ? (
                  <a href={`tel:${e.phone}`} className="tabular-nums hover:text-primary">
                    {formatPkPhone(e.phone)}
                  </a>
                ) : (
                  "—"
                )}
              </DetailRow>
              {e.email && (
                <DetailRow icon="mail-line" label="Email">
                  {e.email}
                </DetailRow>
              )}
              {e.dateOfBirth && (
                <DetailRow icon="cake-2-line" label="Date of birth">
                  {formatDate(e.dateOfBirth)}
                </DetailRow>
              )}
              <DetailRow icon="map-pin-2-line" label="Address">
                {e.address ?? "—"}
              </DetailRow>
              <DetailRow icon="first-aid-kit-line" label="Emergency contact">
                {e.emergency ? (
                  <>
                    {e.emergency.name}
                    {e.emergency.relation && ` (${e.emergency.relation})`}
                    {e.emergency.phone && <span className="block text-xs text-muted-foreground tabular-nums">{formatPkPhone(e.emergency.phone)}</span>}
                  </>
                ) : (
                  "—"
                )}
              </DetailRow>
            </div>
          </SectionCard>

          <SectionCard title="Job">
            <div className="divide-y">
              <DetailRow icon="briefcase-line" label="Designation">
                {designations.label(e.designation) || "—"}
                <span className="block text-xs text-muted-foreground">{[departments.label(e.department), e.team?.name].filter(Boolean).join(" · ")}</span>
              </DetailRow>
              <DetailRow icon="community-line" label="Based at">
                {e.project?.name ?? "Head office"}
              </DetailRow>
              <DetailRow icon="contract-line" label="Employment">
                {employmentTypes.label(e.employmentType)}
              </DetailRow>
              <DetailRow icon="calendar-line" label="Joined">
                {formatDate(e.joinedOn)}
                <span className="block text-xs text-muted-foreground">{e.status === "left" ? `Left ${formatDate(e.leftOn)}` : tenure(e.joinedOn)}</span>
              </DetailRow>
              <DetailRow icon="shield-check-line" label="EOBI no.">
                {e.eobiNo ?? "—"}
              </DetailRow>
              <DetailRow icon="government-line" label="NTN">
                {e.ntn ?? "—"}
              </DetailRow>
              <DetailRow icon="login-box-line" label="Portal login">
                {e.login ? (
                  <span className="flex items-center justify-between gap-2">
                    {e.login.href ? (
                      <Link href={e.login.href} className="truncate text-primary hover:underline">
                        {e.login.email}
                      </Link>
                    ) : (
                      <span className="truncate">{e.login.email}</span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">None</span>
                    {can.edit && (
                      <Button size="sm" variant="outline" leftIcon="link" onClick={() => setDialog("login")}>
                        Link
                      </Button>
                    )}
                  </span>
                )}
              </DetailRow>
            </div>
            {e.notes && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">{e.notes}</p>}
          </SectionCard>

          {e.loans.length > 0 && (
            <SectionCard title="Loans & advances" action={can.payroll && <MoreLink href="/hrm/loans">All</MoreLink>}>
              <ul className="space-y-3 text-sm">
                {e.loans.map((l) => (
                  <li key={l.code}>
                    <p className="flex items-center justify-between gap-2">
                      <span>
                        {l.kind === "advance" ? "Salary advance" : "Loan"} <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                      </span>
                      <span className="tabular-nums">{rs(l.amount)}</span>
                    </p>
                    <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">{l.status === "active" ? `${rs(l.left)} left · ${rs(l.installment)} a month` : l.reason || "—"}</span>
                      <LoanStatusBadge status={l.status} />
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </aside>
      </div>

      {dialog === "edit" && <EmployeeDialog employee={e} teams={teams} projects={projects} canPay={can.pay} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog === "leave" && leave && (
        <ApplyLeaveDialog employees={leave.employees} balances={leave.balances} canPickOthers={can.create} approver={can.approveLeave} fixed={e.code} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog === "end" && <EndEmploymentDialog employee={e} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "login" && <LinkLoginDialog employee={e} members={members} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}

// Last working day and why → status "left". Their portal login is left alone.
function EndEmploymentDialog({ employee, onClose, onDone }) {
  const [f, setF] = useState({ lastDay: pkToday(), reason: "" })
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title={`End ${employee.name}'s employment`}
      description={`Payroll pays them up to this day.${employee.login ? " Their portal login isn't touched; remove it in Users & Teams if they shouldn't sign in any more." : ""}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            leftIcon="door-open-line"
            loading={pending}
            disabled={f.reason.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                setErrors({})
                const r = await toastAction(() => endEmployment(employee.code, f), { loading: "Saving…", success: `${employee.name}'s employment ended.` })
                if (r?.fieldErrors) setErrors(r.fieldErrors)
                else if (r?.ok) onDone()
              })
            }
          >
            End employment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DatePicker label="Last working day" clearable={false} value={f.lastDay} onChange={(v) => v && setF((x) => ({ ...x, lastDay: v }))} error={errors.lastDay} />
        <Textarea
          label="Reason"
          required
          rows={2}
          maxLength={300}
          placeholder="e.g. Resigned, joined another company"
          value={f.reason}
          onChange={(ev) => setF((x) => ({ ...x, reason: ev.target.value }))}
          error={errors.reason}
        />
      </div>
    </Dialog>
  )
}

// Pick the workspace member this employee signs in as
function LinkLoginDialog({ employee, members, onClose, onDone }) {
  const [userId, setUserId] = useState(null)
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title={`Link ${employee.name}'s portal login`}
      description="They then see their own leave, payslips and duties in My Desk. Invite people in Users & Teams first."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            leftIcon="link"
            loading={pending}
            disabled={!userId}
            onClick={() =>
              startTransition(async () => {
                const r = await toastAction(() => linkLogin(employee.code, userId), { loading: "Saving…", success: "Login linked." })
                if (r?.ok) onDone()
              })
            }
          >
            Link login
          </Button>
        </>
      }
    >
      {members.length ? (
        <Combobox label="Workspace member" placeholder="Search by name…" options={members.map((m) => ({ value: m.id, label: m.name, description: m.email }))} value={userId} onChange={setUserId} />
      ) : (
        <p className="text-sm text-muted-foreground">Everyone in Users & Teams is already linked to an employee. Invite them there first.</p>
      )}
    </Dialog>
  )
}
