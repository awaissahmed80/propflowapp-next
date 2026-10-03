"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { useList } from "@/modules/lookups/context"
import { useUnitText } from "@/modules/operations/components/sales-parts"
import { ContactCardPopover } from "@/modules/contacts/components/contact-card"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { BaseCheckbox } from "@/components/ui/checkbox"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { NDC_PURPOSES, TYPE_PAGES, UPDATE_FIELDS } from "../constants"
import { addRequestNote, assignRequest, completeTransfer, handOverPossession, issueNdc, setPriority, setRequestStatus, setStep, startNdcForTransfer } from "../server/actions"
import { ApprovalDialog, FeeDialog, ResolveDialog } from "./request-dialogs"
import { ServicePaper } from "./service-documents"
import { Assignee, CategoryLabel, DueLabel, PriorityBadge, StatusBadge, TypeBadge, unitLine } from "./service-parts"

// Estate Management › one request: what's asked, its checklist and fee, the file it's about, its
// timeline, and the type's own way to finish (issue the NDC, complete the transfer, hand over
// possession, or resolve) with the paper that comes out of it.
//   can: { edit, create, assign, ndc, transfer, possession, waive, sales } · staff: serviceStaff()
//   paper: requestPaper() once the request has given one · approval: pending approval { code } | null

const BACK = { transfer: "Transfers", ndc: "NDC", possession: "Possession", complaint: "Complaints" }
const PAPER_LABEL = { ndc: "Print NDC", transfer: "Transfer letter", possession: "Possession letter" }
const EVENT_ICON = { customer: "user-voice-line", note: "sticky-note-line", system: "settings-4-line" }
const RESOLVES = ["complaint", "document", "record-update"]
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s)

function Party({ title, person, tone }) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-xl border p-4", tone)}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {person?.name ? (
        <>
          <p className="mt-1 font-semibold">{person.name}</p>
          {(person.guardian || person.cnic) && (
            <p className="text-xs text-muted-foreground">{[person.guardian && `${person.relation ?? "S/O"} ${person.guardian}`, person.cnic && `CNIC ${person.cnic}`].filter(Boolean).join(" · ")}</p>
          )}
          {person.phone && <p className="text-xs text-muted-foreground tabular-nums">{formatPkPhone(person.phone)}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">—</p>
      )}
    </div>
  )
}

function TypePanel({ r }) {
  const documents = useList("service-document")
  const d = r.data
  switch (r.type) {
    case "transfer": {
      const done = r.status === "completed"
      return (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Party title={done ? "Sold by" : "Seller (current owner)"} person={done ? d.from : r.contact} />
          <Icon name="arrow-right-line" className="self-center text-xl text-muted-foreground max-sm:rotate-90" />
          <Party title={done ? "Now owned by" : "Purchaser"} person={d.to} tone="bg-primary/5" />
        </div>
      )
    }
    case "ndc":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailRow icon="flag-line" label="For">
            {NDC_PURPOSES.find((p) => p.value === d.purpose)?.label ?? d.purpose ?? "—"}
          </DetailRow>
          <DetailRow icon="shield-check-line" label="Certificate">
            {d.number ?? "Not issued yet"}
          </DetailRow>
          <DetailRow icon="calendar-line" label="Valid till">
            {d.issuedAt ? formatDate(new Date(d.issuedAt).getTime() + Number(d.validDays ?? r.settings.ndc.validDays) * 86_400_000) : `${r.settings.ndc.validDays} days from issue`}
          </DetailRow>
        </div>
      )
    case "possession":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailRow icon="ruler-line" label="Demarcation">
            {d.demarcatedAt ? formatDate(d.demarcatedAt) : "Not done"}
          </DetailRow>
          <DetailRow icon="file-text-line" label="Possession letter">
            {d.letterNo ?? "Not issued"}
          </DetailRow>
          <DetailRow icon="key-2-line" label="Handed over">
            {d.handedOverAt ? formatDate(d.handedOverAt) : "—"}
          </DetailRow>
        </div>
      )
    case "complaint":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailRow icon="price-tag-3-line" label="Category">
            <CategoryLabel category={d.category} />
          </DetailRow>
          <DetailRow icon="alarm-warning-line" label="Priority">
            <PriorityBadge priority={r.priority} />
          </DetailRow>
          <DetailRow icon="time-line" label="Response due">
            {r.dueAt ? formatDateTime(r.dueAt) : "—"}
          </DetailRow>
        </div>
      )
    case "document":
      return (
        <DetailRow icon="file-copy-2-line" label="Document">
          {documents.label(d.kind) ?? "—"}
        </DetailRow>
      )
    case "record-update":
      return (
        <DetailRow icon="edit-2-line" label="Change">
          {UPDATE_FIELDS.find((f) => f.value === d.field)?.label ?? d.field ?? "—"}
        </DetailRow>
      )
    default:
      return null
  }
}

// What the request asks for and the facts its type carries
function Timeline({ r, canNote, onNote, pending }) {
  const [text, setText] = useState("")
  const [kind, setKind] = useState("note")
  const [error, setError] = useState("")
  return (
    <SectionCard title="Activity" action={<span className="text-xs text-muted-foreground tabular-nums">{r.events.length}</span>}>
      {canNote && (
        <div className="mb-5 space-y-2 border-b pb-4">
          <Textarea
            aria-label="Add a note"
            rows={2}
            placeholder={kind === "customer" ? "What the buyer said: a call, a visit, a letter…" : "Add a note for the team…"}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError("")
            }}
            error={error}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              value={kind}
              onChange={setKind}
              options={[
                { value: "note", label: "Note", icon: "sticky-note-line" },
                { value: "customer", label: "Customer said", icon: "user-voice-line" },
              ]}
            />
            <Button
              size="sm"
              variant="outline"
              leftIcon="add-line"
              disabled={!text.trim() || pending}
              onClick={async () => {
                const res = await onNote({ kind, text })
                if (res?.fieldErrors) setError(res.fieldErrors.text)
                else if (!res?.error) setText("")
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
      {r.events.length ? (
        <ol className="space-y-4">
          {[...r.events].reverse().map((e) => (
            <li key={e.id} className="flex gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  e.kind === "customer" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : e.kind === "note" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon name={EVENT_ICON[e.kind] ?? "settings-4-line"} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className={cn("break-words whitespace-pre-line", e.kind === "system" && "text-muted-foreground")}>
                  {e.kind === "customer" && <span className="mr-1 text-xs font-medium text-amber-700 dark:text-amber-400">Customer:</span>}
                  {e.text}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTime(e.at)}>
                  {[e.by?.name, timeAgo(e.at)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      )}
    </SectionCard>
  )
}

export function RequestDetail({ request: r, staff = [], can, brand, paper, approval, accounts = [] }) {
  const router = useRouter()
  const unitText = useUnitText()
  const channels = useList("service-channel")
  const priorities = useList("service-priority")
  const statuses = useList("service-status")
  const methods = useList("payment-method")
  const [dialog, setDialog] = useState(null) // resolve | reject | fee | approval | paper
  const [pending, startTransition] = useTransition()

  // Run an action behind a toast, then refresh what the server shows → the action's result
  const run = (fn, messages, after) =>
    new Promise((resolve) =>
      startTransition(async () => {
        const res = await toastAction(fn, messages)
        if (!res?.error && !res?.fieldErrors) {
          after?.(res)
          router.refresh()
        }
        resolve(res)
      }),
    )
  const done = () => {
    setDialog(null)
    router.refresh()
  }

  const edit = can.edit
  const missing = r.steps.filter((s) => !s.done)
  const notReady = missing.length ? `Finish the checklist first: ${missing.map((s) => lower(s.label)).join(", ")}` : undefined
  const settled = !r.fee?.amount || r.fee.paidAt || r.fee.waived

  // The type's own way to finish, and the paper that comes out of it
  const finish = {
    ndc: can.ndc && {
      label: "Issue NDC",
      icon: "shield-check-line",
      ask: {
        title: `Issue the NDC for ${r.booking?.code ?? r.code}?`,
        description: `It's numbered and valid for ${r.settings.ndc.validDays} days from today. The request closes as done.`,
        confirmLabel: "Issue NDC",
        icon: "shield-check-line",
      },
      act: () => issueNdc(r.code),
      messages: { loading: "Issuing the NDC…", success: (x) => `NDC ${x.number} issued.` },
    },
    transfer: can.transfer && {
      label: "Complete transfer",
      icon: "arrow-left-right-line",
      ask: {
        title: `Transfer ${r.booking?.code ?? "the file"} to ${r.data.to?.name ?? "the purchaser"}?`,
        description: `The file moves out of ${r.contact?.name ?? "the current owner"}'s name. The purchaser becomes the owner of record and takes on the remaining installments. This can't be undone here.`,
        confirmLabel: "Complete transfer",
        icon: "arrow-left-right-line",
      },
      act: () => completeTransfer(r.code),
      messages: { loading: "Completing the transfer…", success: (x) => `Transfer complete (${x.letterNo}). The file is in ${r.data.to?.name ?? "the purchaser"}'s name now.` },
    },
    possession: can.possession && {
      label: "Hand over possession",
      icon: "key-2-line",
      ask: {
        title: `Hand over possession of ${r.unit ? unitLine(r.unit) : r.code}?`,
        description: "A possession letter is numbered, and the booking moves to Completed.",
        confirmLabel: "Hand over possession",
        icon: "key-2-line",
      },
      act: () => handOverPossession(r.code),
      messages: { loading: "Handing over…", success: (x) => `Possession handed over (${x.letterNo}).` },
    },
  }[r.type]
  const resolves = RESOLVES.includes(r.type)
  const canApprove = r.type === "transfer" && edit && !can.transfer && !approval

  const finishNow = async () => {
    if (!(await confirm(finish.ask))) return
    run(finish.act, finish.messages, () => setDialog("paper"))
  }
  const reject = async () => {
    if (r.type === "transfer" && approval) {
      const ok = await confirm({ title: "This transfer is waiting for approval", description: "Rejecting it here also withdraws the approval request.", confirmLabel: "Continue", destructive: true })
      if (!ok) return
    }
    setDialog("reject")
  }
  const assign = (person) => run(() => assignRequest(r.code, person?.id ?? null), { loading: "Saving…", success: person ? `${r.code} is with ${person.name} now.` : "Unassigned." })

  // Reopening a finished transfer, NDC or possession would undo paperwork that's been given, so
  // only rejected requests and resolved complaints, documents and record updates reopen
  const reopenable = r.closed && (r.status === "rejected" || resolves)
  const more = r.closed
    ? reopenable
      ? [{ label: "Reopen", icon: "restart-line", onClick: () => run(() => setRequestStatus(r.code, "in-progress"), { loading: "Reopening…", success: "Request reopened." }) }]
      : []
    : [
        ...["in-progress", "awaiting-customer"]
          .filter((s) => s !== r.status)
          .map((s) => ({
            label: `Mark ${lower(statuses.label(s))}`,
            icon: s === "awaiting-customer" ? "user-voice-line" : "play-circle-line",
            onClick: () => run(() => setRequestStatus(r.code, s), { loading: "Saving…", success: `Marked ${lower(statuses.label(s))}.` }),
          })),
        { type: "separator" },
        { label: "Reject…", icon: "close-circle-line", variant: "destructive", onClick: reject },
      ]

  const paperUrl = paper && `/estate-management/requests/${urlCode(r.code)}/print/${paper.doc}`

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-3">
        <Link href={TYPE_PAGES[r.type] ?? "/estate-management/requests"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> {BACK[r.type] ?? "Service desk"}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={r.type} />
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{r.subject}</h1>
              <StatusBadge status={r.status} />
              {r.type === "complaint" && <PriorityBadge priority={r.priority} />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{r.code}</span>
              {r.channel && <span>· {channels.label(r.channel)}</span>}
              <span title={formatDateTime(r.createdAt)}>· logged {timeAgo(r.createdAt)}</span>
              {r.closedAt && <span>· closed {formatDate(r.closedAt)}</span>}
              <DueLabel request={r} className="text-sm" />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!r.closed && finish && (
              <Button leftIcon={finish.icon} loading={pending} disabled={!r.ready} title={notReady} onClick={finishNow}>
                {finish.label}
              </Button>
            )}
            {!r.closed && canApprove && (
              <Button leftIcon="send-plane-line" disabled={!r.ready} title={notReady} onClick={() => setDialog("approval")}>
                Send for approval
              </Button>
            )}
            {!r.closed && resolves && edit && (
              <Button leftIcon="checkbox-circle-line" disabled={!r.ready} title={notReady} onClick={() => setDialog("resolve")}>
                {r.type === "complaint" ? "Resolve" : "Mark as done"}
              </Button>
            )}
            {paper && (
              <Button variant="outline" leftIcon="printer-line" onClick={() => setDialog("paper")}>
                {PAPER_LABEL[paper.doc]}
              </Button>
            )}
            {edit && more.length > 0 && <DropdownMenu align="end" items={more} trigger={<Button variant="outline" size="icon" leftIcon="more-2-line" aria-label="More actions" />} />}
          </div>
        </div>
        {!r.closed && (finish || canApprove || (resolves && edit)) && !r.ready && (
          <p className="text-sm text-muted-foreground">
            <Icon name="information-line" className="mr-1 align-[-2px]" />
            Before you can {lower((finish?.label ?? (canApprove ? "send it for approval" : r.type === "complaint" ? "resolve it" : "mark it done")).toString())}: {missing.map((s) => lower(s.label)).join(", ")}.
          </p>
        )}
        {!r.closed && !finish && !canApprove && !resolves && edit && r.type !== "transfer" && (
          <p className="text-sm text-muted-foreground">
            <Icon name="lock-line" className="mr-1 align-[-2px]" />
            Your role can&apos;t {r.type === "ndc" ? "issue NDCs" : "hand over possession"}. Work the checklist and someone who can will finish it.
          </p>
        )}
        {approval && !r.closed && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <Icon name="time-line" /> Waiting for approval since {timeAgo(approval.createdAt)} ({approval.code}). The transfer completes once it&apos;s approved.
          </p>
        )}
        {r.resolution && (
          <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", r.status === "rejected" ? "bg-muted" : "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200")}>
            <Icon name={r.status === "rejected" ? "close-circle-line" : "checkbox-circle-line"} className="mt-0.5" /> {r.resolution}
          </p>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Request">
            <div className="space-y-4">
              <TypePanel r={r} />
              {r.details && <p className="text-sm whitespace-pre-line">{r.details}</p>}
              {!r.details && r.type === "complaint" && <p className="text-sm text-muted-foreground">No details given.</p>}
            </div>
          </SectionCard>

          {r.steps.length > 0 && (
            <SectionCard
              title="Checklist"
              action={
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.steps.length - missing.length} of {r.steps.length} done
                </span>
              }
            >
              <ul className="-my-1 divide-y">
                {r.steps.map((s) => (
                  <li key={s.key} className="flex items-start gap-3 py-2.5">
                    {s.auto ? (
                      <Icon
                        name={s.done ? "checkbox-circle-fill" : "close-circle-line"}
                        className={cn("mt-0.5 text-lg", s.done ? "text-emerald-500" : "text-muted-foreground")}
                        aria-label={s.done ? "Done" : "Not done"}
                      />
                    ) : (
                      <span className="mt-0.5 inline-flex">
                        <BaseCheckbox
                          aria-label={s.label}
                          checked={s.done}
                          disabled={!edit || r.closed || pending}
                          onCheckedChange={(v) => run(() => setStep(r.code, s.key, Boolean(v)), { loading: "Saving…", success: v ? `Done: ${lower(s.label)}.` : "Unticked." })}
                        />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", s.done && "text-muted-foreground")}>{s.label}</span>
                      {(s.detail || (s.amount > 0 && !s.done)) && (
                        <span className={cn("block text-xs", !s.done && s.key === "dues" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                          {[s.detail, s.amount > 0 && !s.done ? `${formatPkr(s.amount)}${s.key === "paid" ? " still to pay" : ""}` : null].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    {s.auto && !s.done && !r.closed && s.key === "fee" && edit && (
                      <Button size="sm" variant="outline" onClick={() => setDialog("fee")}>
                        Record fee
                      </Button>
                    )}
                    {s.auto &&
                      !s.done &&
                      !r.closed &&
                      s.key === "ndc" &&
                      (r.openNdc ? (
                        <Button size="sm" variant="outline" rightIcon="arrow-right-s-line" nativeButton={false} render={<Link href={`/estate-management/requests/${urlCode(r.openNdc)}`} />}>
                          {r.openNdc}
                        </Button>
                      ) : (
                        can.create && (
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon="shield-check-line"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => startNdcForTransfer(r.code),
                                { loading: "Starting the NDC…", success: (x) => `NDC request ${x.code} started.` },
                                (x) => router.push(`/estate-management/requests/${urlCode(x.code)}`),
                              )
                            }
                          >
                            Start NDC
                          </Button>
                        )
                      ))}
                    {s.auto && (s.done || r.closed || !["fee", "ndc"].includes(s.key)) && <span className="text-[11px] text-muted-foreground">Automatic</span>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <Timeline r={r} canNote={edit} pending={pending} onNote={(v) => run(() => addRequestNote(r.code, v), { loading: "Adding…", success: v.kind === "customer" ? "Added what the customer said." : "Note added." })} />
        </div>

        <aside className="min-w-0 space-y-6">
          <SectionCard title="Handling">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted-foreground">Assigned to</p>
                  <Assignee person={r.assignee} />
                </div>
                {can.assign && (
                  <DropdownMenu
                    align="end"
                    className="max-h-80 w-64"
                    items={[
                      { type: "label", label: "Give this request to" },
                      ...staff.map((a) => ({
                        key: String(a.id),
                        label: a.team ? `${a.name} · ${a.team}` : a.name,
                        icon: <Avatar name={a.name} source={a.avatarUrl} size="sm" />,
                        selected: a.id === r.assignee?.id,
                        disabled: pending,
                        onClick: () => a.id !== r.assignee?.id && assign(a),
                      })),
                      ...(r.assignee ? [{ type: "separator" }, { key: "none", label: "Unassign", icon: "user-unfollow-line", disabled: pending, onClick: () => assign(null) }] : []),
                    ]}
                    trigger={
                      <Button size="sm" variant="outline" rightIcon="arrow-down-s-line">
                        {r.assignee ? "Reassign" : "Assign"}
                      </Button>
                    }
                  />
                )}
              </div>
              {r.type === "complaint" && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Priority</p>
                    <PriorityBadge priority={r.priority} />
                  </div>
                  {edit && !r.closed && (
                    <DropdownMenu
                      align="end"
                      items={[
                        { type: "label", label: "Priority (the due time follows)" },
                        ...priorities.options.map((p) => ({
                          key: p.value,
                          label: p.label,
                          selected: p.value === r.priority,
                          disabled: pending,
                          onClick: () => p.value !== r.priority && run(() => setPriority(r.code, p.value), { loading: "Saving…", success: `Priority: ${lower(p.label)}.` }),
                        })),
                      ]}
                      trigger={
                        <Button size="sm" variant="outline" rightIcon="arrow-down-s-line">
                          Change
                        </Button>
                      }
                    />
                  )}
                </div>
              )}
              {r.dueAt && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Due</p>
                  <p className="text-sm">
                    {formatDateTime(r.dueAt)} <DueLabel request={r} className="ml-1" />
                  </p>
                </div>
              )}
              {r.fee?.amount > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    Fee <span className="font-semibold tabular-nums">{formatPkr(r.fee.amount)}</span>
                    <span className={cn("block text-xs", settled ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                      {r.fee.waived
                        ? `Waived${r.fee.reason ? `: ${r.fee.reason}` : ""}`
                        : r.fee.paidAt
                          ? [`Paid ${formatDate(r.fee.paidAt)}`, r.fee.method && methods.label(r.fee.method), r.fee.ref].filter(Boolean).join(" · ")
                          : "Not paid yet"}
                    </span>
                  </span>
                  {edit && !settled && !r.closed && (
                    <Button size="sm" variant="outline" onClick={() => setDialog("fee")}>
                      Record
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={r.type === "complaint" ? "Resident" : r.type === "transfer" ? "Seller" : "Owner"}
            action={
              r.contact && (
                <ContactCardPopover
                  from={{ contact: r.contact.code }}
                  align="end"
                  trigger={
                    <button type="button" className="flex cursor-pointer items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                      <Icon name="contacts-book-2-line" /> Contact card
                    </button>
                  }
                />
              )
            }
          >
            {r.contact ? (
              <div className="divide-y">
                <DetailRow icon="user-3-line" label="Name">
                  {r.contact.name}
                  {r.contact.cnic && <span className="block font-mono text-xs text-muted-foreground">CNIC {r.contact.cnic}</span>}
                </DetailRow>
                <DetailRow icon="phone-line" label="Mobile">
                  {r.contact.phone ? (
                    <a href={`tel:${r.contact.phone}`} className="tabular-nums hover:text-primary">
                      {formatPkPhone(r.contact.phone)}
                    </a>
                  ) : (
                    "—"
                  )}
                </DetailRow>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No contact on this request.</p>
            )}
          </SectionCard>

          {(r.unit || r.booking) && (
            <SectionCard
              title="File"
              action={
                r.booking &&
                can.operations && (
                  <Link href={`/operations/bookings/${urlCode(r.booking.code)}`} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                    Open booking <Icon name="arrow-right-s-line" />
                  </Link>
                )
              }
            >
              <div className="divide-y">
                {r.unit && (
                  <DetailRow icon="map-2-line" label="Unit">
                    {unitLine(r.unit)}
                    <span className="block text-xs text-muted-foreground">{[unitText(r.unit), r.unit.phase].filter(Boolean).join(" · ")}</span>
                  </DetailRow>
                )}
                {r.booking && (
                  <>
                    <DetailRow icon="file-list-3-line" label="Booking">
                      <span className="tabular-nums">{r.booking.code}</span>
                    </DetailRow>
                    <DetailRow icon="wallet-3-line" label="Paid">
                      <span className="tabular-nums">
                        {formatPkr(r.booking.received)} of {formatPkr(r.booking.net)} ({r.booking.paidPct}%)
                      </span>
                      <span className={cn("block text-xs", r.booking.overdueAmount ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        {r.booking.overdueAmount ? `${formatPkr(r.booking.overdueAmount)} overdue` : r.booking.balance > 0 ? `${formatPkr(r.booking.balance)} still to pay` : "Fully paid"}
                      </span>
                    </DetailRow>
                    <DetailRow icon="team-line" label="Nominee">
                      {r.booking.nominee?.name ? `${r.booking.nominee.name}${r.booking.nominee.relation ? ` (${r.booking.nominee.relation})` : ""}` : "—"}
                    </DetailRow>
                  </>
                )}
                {r.ndcOnFile && r.type !== "ndc" && (
                  <DetailRow icon="shield-check-line" label="NDC on file">
                    {r.ndcOnFile.number ?? r.ndcOnFile.code}
                    <span className="block text-xs text-muted-foreground">Valid till {formatDate(r.ndcOnFile.validTill)}</span>
                  </DetailRow>
                )}
              </div>
            </SectionCard>
          )}

          {r.related.length > 0 && (
            <SectionCard title="Other requests on this file" bodyClassName="p-2">
              <ul>
                {r.related.map((x) => (
                  <li key={x.code}>
                    <Link href={`/estate-management/requests/${urlCode(x.code)}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/60">
                      <TypeBadge type={x.type} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{x.subject}</span>
                      <StatusBadge status={x.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </aside>
      </div>

      {(dialog === "resolve" || dialog === "reject") && <ResolveDialog request={r} outcome={dialog === "reject" ? "rejected" : "completed"} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "fee" && r.fee?.amount > 0 && <FeeDialog request={r} canWaive={can.waive} accounts={accounts} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "approval" && <ApprovalDialog request={r} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "paper" && paper && (
        <PrintPreviewDialog title={`${paper.title} ${paper.number}`} printUrl={paperUrl} pdfUrl={`/api/estate/requests/${urlCode(r.code)}/${paper.doc}/pdf`} onClose={() => setDialog(null)}>
          <ServicePaper r={r} paper={paper} brand={brand} unitText={unitText} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}
