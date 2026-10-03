"use client"

import { useState, useTransition } from "react"
import { toHex } from "@/lib/color"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { downloadExcel } from "@/lib/export-excel"
import { formatPkPhone } from "@/lib/phone"
import { useList } from "@/modules/lookups/context"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { ReportDocument } from "@/components/reports/report-document"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { OPEN_STEPS, budgetText, interestText } from "../constants"
import { archiveLeads, assignLeads, setLeadsPriority, setLeadsStatus } from "../server/leads"
import { ArchiveDialog } from "./lead-dialog"
import { StatusChangeDialog } from "./status-change-dialog"
import { formatPkr } from "@/lib/format"

// The bar over the leads table while rows are ticked: assign, status, temperature, archive (or
// restore, in the Archived tab) and export. Archived leads can only be restored or exported.
//   picked: the ticked leads (shaped like listLeads); onDone({ tone, text }): after a change (already shown as a toast); onClear()
export function BulkActions({ picked, archivedTab, access, agents, me, brand, userName, onDone, onClear }) {
  const statuses = useList("lead-status")
  const priorities = useList("lead-priority")
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState(null) // { kind: "status", status } | { kind: "archive" } | { kind: "export" }
  const { confirm } = useAlert()
  const codes = picked.map((l) => l.code)
  const n = picked.length
  const many = `${n} ${n === 1 ? "lead" : "leads"}`

  const act = (fn, done) =>
    startTransition(async () => {
      const r = await toastAction(fn, { loading: `Updating ${many}…`, success: (x) => done(x?.count ?? n) })
      setDialog(null)
      onDone(r?.error ? { tone: "error", text: r.error } : { tone: "success", text: done(r?.count ?? n) })
    })
  const leadsWord = (c) => `${c} ${c === 1 ? "lead" : "leads"}`
  // Changes to many leads at once ask first (one lead goes straight through)
  const sure = (options) => (n > 1 ? confirm(options) : true)

  const pickStatus = async (status) => {
    if (status === "lost" || access.statusNote) return setDialog({ kind: "status", status })
    if (!(await sure({ title: `Move ${many} to ${statuses.label(status)}?`, description: "Each lead's current status is replaced.", confirmLabel: `Move ${many}`, icon: "flag-line" }))) return
    act(
      () => setLeadsStatus(codes, status),
      (c) => `${leadsWord(c)} moved to ${statuses.label(status)}.`,
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
        <span className="font-semibold tabular-nums">{n} selected</span>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {access.edit && !archivedTab && (
            <>
              {access.reassign && (
                <DropdownMenu
                  align="end"
                  className="max-h-80 w-60"
                  items={[
                    { type: "label", label: `Give ${many} to` },
                    ...agents.map((a) => ({
                      key: String(a.id),
                      label: a.id === me ? `${a.name} (me)` : a.name,
                      icon: "user-line",
                      onClick: async () =>
                        (await sure({ title: `Give ${many} to ${a.name}?`, description: "They're taken off whoever has them now.", confirmLabel: "Reassign", icon: "user-shared-line" })) &&
                        act(
                          () => assignLeads(codes, a.id),
                          () => `${many} given to ${a.name}.`,
                        ),
                    })),
                    { type: "separator" },
                    {
                      label: "Unassign",
                      icon: "user-unfollow-line",
                      onClick: async () =>
                        (await sure({
                          title: `Unassign ${many}?`,
                          description: "They're taken off their agents and nobody follows them up until they're given to someone.",
                          confirmLabel: "Unassign",
                          icon: "user-unfollow-line",
                        })) &&
                        act(
                          () => assignLeads(codes, null),
                          () => `${many} unassigned.`,
                        ),
                    },
                  ]}
                  trigger={
                    <Button size="sm" variant="outline" leftIcon="user-shared-line" disabled={pending}>
                      Assign
                    </Button>
                  }
                />
              )}
              <DropdownMenu
                align="end"
                items={[
                  { type: "label", label: `Move ${many} to` },
                  ...OPEN_STEPS.map((st) => ({ key: st, label: statuses.label(st), icon: <Icon name="flag-fill" style={{ color: toHex(statuses.map[st]?.color) }} />, onClick: () => pickStatus(st) })),
                  { type: "separator" },
                  { label: "Lost…", icon: "close-circle-line", variant: "destructive", onClick: () => pickStatus("lost") },
                ]}
                trigger={
                  <Button size="sm" variant="outline" leftIcon="flag-line" disabled={pending}>
                    Status
                  </Button>
                }
              />
              <DropdownMenu
                align="end"
                items={[
                  { type: "label", label: "Temperature" },
                  ...priorities.options.map((o) => ({
                    key: o.value,
                    label: o.label,
                    icon: <Icon name={priorities.map[o.value]?.icon ?? "temp-hot-line"} style={{ color: toHex(priorities.map[o.value]?.color) }} />,
                    onClick: async () =>
                      (await sure({ title: `Set ${many} to ${o.label.toLowerCase()}?`, description: "Their current temperature is replaced.", confirmLabel: "Set temperature", icon: "fire-line" })) &&
                      act(
                        () => setLeadsPriority(codes, o.value),
                        (c) => `${leadsWord(c)} set to ${o.label.toLowerCase()}.`,
                      ),
                  })),
                ]}
                trigger={
                  <Button size="sm" variant="outline" leftIcon="fire-line" disabled={pending}>
                    Temperature
                  </Button>
                }
              />
              <Button size="sm" variant="outline" leftIcon="archive-line" disabled={pending} onClick={() => setDialog({ kind: "archive" })}>
                Archive
              </Button>
            </>
          )}
          {access.edit && archivedTab && (
            <Button
              size="sm"
              variant="outline"
              leftIcon="inbox-unarchive-line"
              loading={pending}
              onClick={async () =>
                (await sure({
                  title: `Restore ${many} to the pipeline?`,
                  description: "They're back on the board and in the lists, and their follow-ups show as due again.",
                  confirmLabel: "Restore",
                  icon: "inbox-unarchive-line",
                })) &&
                act(
                  () => archiveLeads(codes, { archive: false }),

                  (c) => `${leadsWord(c)} restored to the pipeline.`,
                )
              }
            >
              Restore
            </Button>
          )}
          <Button size="sm" variant="outline" leftIcon="download-2-line" onClick={() => setDialog({ kind: "export" })}>
            Export
          </Button>
        </div>
      </div>

      {dialog?.kind === "status" && (
        <StatusChangeDialog
          name={many}
          status={dialog.status}
          needUpdate={access.statusNote}
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={(v) =>
            act(
              () => setLeadsStatus(codes, dialog.status, v),
              (c) => `${leadsWord(c)} ${dialog.status === "lost" ? "marked as lost" : `moved to ${statuses.label(dialog.status)}`}.`,
            )
          }
        />
      )}
      {dialog?.kind === "archive" && (
        <ArchiveDialog
          name={n === 1 ? picked[0].name : many}
          many={n > 1}
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={(note) =>
            act(
              () => archiveLeads(codes, { archive: true, note }),
              (c) => `${leadsWord(c)} archived.`,
            )
          }
        />
      )}
      {dialog?.kind === "export" && <ExportPreview leads={picked} brand={brand} userName={userName} onClose={() => setDialog(null)} />}
    </>
  )
}

// The ticked leads as a report: preview (A4) and Excel
function ExportPreview({ leads, brand, userName, onClose }) {
  const statuses = useList("lead-status")
  const sources = useList("lead-source")
  const priorities = useList("lead-priority")
  const types = useList("unit-type")
  const report = { title: "Leads" }
  const result = {
    scope: `${leads.length} selected ${leads.length === 1 ? "lead" : "leads"}`,
    summary: [
      { label: "Leads", value: leads.length },
      { label: "Open", value: leads.filter((l) => OPEN_STEPS.includes(l.status) && !l.archivedAt).length },
      { label: "Booked", value: leads.filter((l) => l.status === "booked").length },
      { label: "Lost", value: leads.filter((l) => l.status === "lost").length },
    ],
    columns: [
      { key: "code", header: "Lead", width: 10 },
      { key: "name", header: "Name", width: 22 },
      { key: "phone", header: "Mobile", width: 16 },
      { key: "city", header: "City", width: 14 },
      { key: "interest", header: "Looking for", width: 28 },
      { key: "budget", header: "Budget", width: 18 },
      { key: "source", header: "Source", width: 14 },
      { key: "status", header: "Status", width: 14 },
      { key: "temperature", header: "Temperature", width: 12 },
      { key: "score", header: "Score", type: "number", width: 8 },
      { key: "agent", header: "Agent", width: 16 },
      { key: "added", header: "Added", width: 12 },
    ],
    rows: leads.map((l) => ({
      code: l.code,
      name: l.name,
      phone: formatPkPhone(l.phone),
      city: [l.city, l.overseas && "Overseas"].filter(Boolean).join(" · "),
      interest: interestText(l.interest, { typeLabel: types.label }).replace(/^—$/, ""),
      budget: budgetText(l.interest, formatPkr) ?? "",
      source: l.source ? sources.label(l.source) : "",
      status: `${statuses.label(l.status)}${l.archivedAt ? " (archived)" : ""}`,
      temperature: priorities.label(l.priority),
      score: l.score?.value ?? null,
      agent: l.agent?.name ?? "Unassigned",
      added: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium" }).format(new Date(l.createdAt)),
    })),
  }
  const meta = [result.scope, `Generated ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date())} by ${userName}`]
  return (
    <PrintPreviewDialog
      title="Export leads"
      description={`${leads.length} ${leads.length === 1 ? "lead" : "leads"} · download as Excel`}
      onExcel={() => downloadExcel({ title: "Leads", columns: result.columns }, result, meta)}
      onClose={onClose}
    >
      <ReportDocument report={report} result={result} brand={brand} generatedBy={userName} />
    </PrintPreviewDialog>
  )
}
