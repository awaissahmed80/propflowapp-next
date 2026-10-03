"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { urlCode } from "@/lib/url"
import { confirm } from "@/components/alert-context"
import { useList } from "@/modules/lookups/context"
import { chargeAmount, chargeText, planSummary } from "@/modules/portfolio/pricing"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { Tabs } from "@/components/ui/tabs"
import { Tooltip } from "@/components/ui/tooltip"
import { setBookingDealer, issueAllotment, moveBookingStage, setBookingHold, setReceiptStatus } from "../server/bookings"
import { BuyerDialog, CancelDialog, PlanDialog, ReceiptDialog } from "./booking-dialogs"
import { BookingActivity } from "./booking-activity"
import { BookingDocuments } from "./booking-documents"
import { BookingOverview } from "./booking-overview"
import { BookingHandler } from "./booking-handler"
import { ContactCardPopover } from "@/modules/contacts/components/contact-card"
import { ApprovalReasonDialog, SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { AllotmentLetter, ReceiptDocument, StatementDocument } from "./documents"
import { CommissionBadge, LineBadge, MethodText, PaidMeter, ProofLink, ReceiptBadge, STAGES, StageBadge, StatusBadge, confirmBounce, useUnitText } from "./sales-parts"

// Sales › one booking: where it is (stage), what's owed and paid, and the next thing to do.
//   can: { edit, receipts, cheques, allot, cancel, discount (%), paymentRequest }; receiptsDirect,
//   chequesDirect, cancelDirect: has the grant (without it the action is sent for approval)
const CLOSED = ["cancelled", "refunded"]

// What to do next at each point, for the stepper's hint and the main button
function nextStep(b, can) {
  if (CLOSED.includes(b.status)) return null
  if (!b.buyerDetails.hasCnic || !b.buyerDetails.guardianName) return { text: "Add the buyer's CNIC and father's or husband's name", action: "buyer", label: "Add buyer details", icon: "user-add-line" }
  if (!b.plan) return { text: "Choose the payment plan from the project's price list", action: "plan", label: "Set up payment plan", icon: "calendar-todo-line" }
  const down = b.lines.find((l) => l.kind === "down" || l.kind === "full")
  if (!b.allotment && down && down.state !== "paid")
    return {
      text: `Receive the ${down.kind === "full" ? "full payment" : "down payment"} (${formatPkr(down.balance)} left)`,
      action: can.receipts ? "receipt" : null,
      label: "Record payment",
      icon: "money-dollar-circle-line",
    }
  const missing = (gate) => {
    const upTo = ["allotment", "handover", "possession"].slice(0, ["allotment", "handover", "possession"].indexOf(gate) + 1)
    return b.documents.enforce ? b.documents.checklist.filter((c) => c.required && c.gate && upTo.includes(c.gate) && !c.files.length) : []
  }
  if (!b.allotment && missing("allotment").length)
    return {
      text: `Upload ${missing("allotment")
        .map((c) => c.label)
        .join(", ")} for the allotment letter`,
      action: "documents",
      label: "Upload documents",
      icon: "upload-2-line",
    }
  if (!b.allotment) return { text: "Down payment is in: issue the allotment letter", action: can.allot ? "allot" : null, label: "Issue allotment", icon: "file-paper-2-line" }
  if (b.stage === "active" && b.balance > 0)
    return {
      text: b.overdueAmount > 0 ? `${formatPkr(b.overdueAmount)} is overdue` : `Collect installments: ${formatPkr(b.balance)} left`,
      action: can.receipts ? "receipt" : null,
      label: "Record payment",
      icon: "money-dollar-circle-line",
    }
  if (b.stage === "active" && missing("handover").length)
    return {
      text: `Paid in full. Upload ${missing("handover")
        .map((c) => c.label)
        .join(", ")} for handover`,
      action: "documents",
      label: "Upload documents",
      icon: "upload-2-line",
    }
  if (b.stage === "active") return { text: "Paid in full: mark it ready for handover", action: "handover", label: "Ready for handover", icon: "key-2-line" }
  if (b.stage === "handover") return { text: "Hand over possession to the buyer", action: "completed", label: "Possession given", icon: "home-smile-line" }
  return null
}

function Stepper({ stage, cancelled }) {
  const list = useList("booking-stage")
  const at = STAGES.indexOf(stage)
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {STAGES.map((st, i) => {
        const done = i < at || (i === at && st === "completed")
        const here = i === at && !done
        return (
          <li key={st} className="flex min-w-0 shrink-0 items-center gap-1.5">
            {i > 0 && <span className={cn("h-px w-5 sm:w-8", i <= at ? "bg-primary/50" : "bg-border")} aria-hidden />}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] whitespace-nowrap",
                done && "text-primary",
                here && (cancelled ? "bg-muted font-medium text-muted-foreground" : "bg-primary/10 font-semibold text-primary"),
                !done && !here && "text-muted-foreground",
              )}
              aria-current={here ? "step" : undefined}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold", done && "border-primary bg-primary text-primary-foreground", here && "border-primary")}>
                {done ? <Icon name="check-line" /> : i + 1}
              </span>
              {list.label(st)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// One money figure in the summary: small label, the amount, an optional note beside it
function Figure({ label, value, note, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</span>
        {note && <span className="truncate text-[13px] text-muted-foreground">{note}</span>}
      </div>
    </div>
  )
}

// A small label-over-value fact; wide spans both columns
function Fact({ label, children, wide }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-[15px]">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

function Group({ title, action, children }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex h-7 items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </div>
  )
}

export function BookingDetail({ booking: b, can, brand, marlaSqft = 225 }) {
  const router = useRouter()
  const unitText = useUnitText()
  const methods = useList("payment-method")
  const features = useList("feature")
  const [tab, setTab] = useState("overview")
  const [dialog, setDialog] = useState(null) // plan | buyer | receipt | cancel | { doc, receipt? } | { chequeAsk: { receipt, status } }
  // Acknowledgements and errors as toasts
  const setNotice = (n) => n && (n.tone === "error" ? toast.error(n.text) : toast.success(n.text))
  const [pending, startTransition] = useTransition()
  const step = nextStep(b, can)
  const closed = CLOSED.includes(b.status)

  const done = (text) => {
    setDialog(null)
    setNotice({ tone: "success", text })
    router.refresh()
  }
  const run = (fn, ok) =>
    startTransition(async () => {
      const r = await fn()
      if (r?.error) setNotice({ tone: "error", text: r.error })
      else done(r?.pending ? SENT_FOR_APPROVAL : typeof ok === "function" ? ok(r) : ok)
    })
  // Cleared or bounced: at once with a cheques grant, otherwise asked for (with an optional note)
  const markCheque = async (r, status) => {
    if (!can.chequesDirect) return setDialog({ chequeAsk: { receipt: r, status } })
    if (status === "bounced" && !(await confirmBounce(r))) return
    run(() => setReceiptStatus(r.code, status), status === "cleared" ? `${r.code} cleared.` : `${r.code} marked bounced: the installment is due again.`)
  }
  const act = async (action) => {
    if (action === "documents") return setTab("documents")
    if (action === "allot") {
      const ok = await confirm({
        title: `Issue the allotment letter for ${b.code}?`,
        description: `${b.buyer.name} is allotted the unit and it's marked sold. The payment plan can't be changed after this.`,
        confirmLabel: "Issue allotment",
        icon: "file-paper-2-line",
      })
      if (ok)
        run(
          () => issueAllotment(b.code),
          (r) => `Allotment ${r.no} issued.`,
        )
      return
    }
    if (action === "handover") {
      const ok = await confirm({
        title: `Mark ${b.code} ready for handover?`,
        description: "It moves to the Handover stage and goes to whoever handles handovers.",
        confirmLabel: "Mark ready",
        icon: "key-2-line",
      })
      if (ok) run(() => moveBookingStage(b.code, "handover"), "Marked ready for handover.")
      return
    }
    if (action === "completed") {
      const ok = await confirm({
        title: `Give possession and complete ${b.code}?`,
        description: `Record that ${b.buyer.name} has taken possession. The booking is closed as complete.`,
        confirmLabel: "Complete booking",
        icon: "checkbox-circle-line",
      })
      if (ok) run(() => moveBookingStage(b.code, "completed"), "Possession given. The booking is complete.")
      return
    }
    setDialog(action)
  }

  const methodLabel = (m) => methods.label(m)
  const docProps = { booking: b, brand, unitText, methodLabel, featureLabel: features.label }
  const marla = (() => {
    if (b.unit.sizeUnit === "kanal") return b.unit.sizeValue * 20
    if (b.unit.sizeUnit === "marla") return b.unit.sizeValue
    return null
  })()

  // Everything about the booking in one card: small label-over-value facts, grouped
  const details = (
    <section className="divide-y rounded-xl border bg-background shadow-xs">
      <Group
        title="Buyer"
        action={
          <div className="flex items-center gap-0.5">
            {b.buyerDetails.code && (
              <ContactCardPopover
                from={{ booking: b.code }}
                align="end"
                trigger={
                  <button
                    type="button"
                    aria-label="Contact card"
                    title="Contact card"
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon name="contacts-book-2-line" />
                  </button>
                }
              />
            )}
            {can.edit && !closed && (
              <Tooltip content="Edit buyer details">
                <button
                  type="button"
                  aria-label="Edit buyer details"
                  onClick={() => setDialog("buyer")}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Icon name="edit-line" />
                </button>
              </Tooltip>
            )}
          </div>
        }
      >
        <Fact label="Name">{b.buyerDetails.name}</Fact>
        <Fact label={b.buyerDetails.guardianRelation ?? "S/O"}>{b.buyerDetails.guardianName}</Fact>
        <Fact label="CNIC">{b.buyerDetails.cnic && <span className="font-mono text-[13px]">{b.buyerDetails.cnic}</span>}</Fact>
        <Fact label="Mobile">
          {b.buyerDetails.phone && (
            <a href={`tel:${b.buyerDetails.phone}`} className="hover:text-primary">
              {formatPkPhone(b.buyerDetails.phone)}
            </a>
          )}
        </Fact>
        <Fact label="Address" wide>
          {[b.buyerDetails.address, b.buyerDetails.city].filter(Boolean).join(", ")}
        </Fact>
        {b.nominee?.name && (
          <Fact label="Nominee" wide>
            {b.nominee.name} <span className="text-muted-foreground">({b.nominee.relation})</span>
          </Fact>
        )}
      </Group>

      <Group title="Unit">
        <Fact label="Project">{b.project.name}</Fact>
        <Fact label="Unit">
          {b.unit.number}
          {b.unit.block && <span className="text-muted-foreground"> · {b.unit.block}</span>}
        </Fact>
        <Fact label="Size">{unitText(b.unit)}</Fact>
        <Fact label="Features">{(b.unitFeatures ?? []).map(features.label).join(", ")}</Fact>
      </Group>

      <Group title="Price">
        <Fact label="List price">{formatPkr(b.listPrice)}</Fact>
        <Fact label="Net price">
          <span className="font-semibold">{formatPkr(b.net)}</span>
          {b.planDiscount + b.extraDiscount > 0 && <span className="text-xs text-emerald-700 dark:text-emerald-400"> −{formatPkr(b.planDiscount + b.extraDiscount)}</span>}
        </Fact>
        <Fact label="Plan" wide>
          {b.plan && <span title={planSummary(b.plan)}>{b.plan.name}</span>}
        </Fact>
        {b.charges.length > 0 && (
          <Fact label="Other charges" wide>
            <span className="block text-[13px] whitespace-normal">
              {b.charges.map((c, k) => (
                <span key={c.key ?? c.name}>
                  {k > 0 && <span className="text-muted-foreground"> · </span>}
                  {c.name}{" "}
                  <span className="tabular-nums">{marla != null || c.basis !== "per-marla" ? formatPkr(chargeAmount(c, { marla, areaSqft: marla ? marla * marlaSqft : null, price: b.net })) : chargeText(c)}</span>
                </span>
              ))}
            </span>
          </Fact>
        )}
      </Group>

      <Group title="Sale">
        <Fact label="Sold by">
          {(b.soldBy ?? b.agent) && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={(b.soldBy ?? b.agent).name} source={(b.soldBy ?? b.agent).avatarUrl} size="xs" />
              {(b.soldBy ?? b.agent).name}
            </span>
          )}
        </Fact>
        <Fact label="Handled by">
          {b.agent && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={b.agent.name} source={b.agent.avatarUrl} size="xs" />
              {b.agent.name}
            </span>
          )}
        </Fact>
        <Fact label="Dealer">
          <span className="inline-flex items-center gap-0.5">
            {b.dealer ? b.dealer.name : "Direct sale"}
            {can.edit && !closed && b.commission?.status !== "paid" && b.dealers.length > 0 && (
              <DropdownMenu
                align="start"
                className="max-h-80 w-60"
                items={[
                  { type: "label", label: "Who brought the buyer" },
                  { key: "none", label: "Direct sale (no dealer)", icon: "user-line", selected: !b.dealer, onClick: () => b.dealer && run(() => setBookingDealer(b.code, null), "Marked as a direct sale.") },
                  ...b.dealers.map((d) => ({
                    key: d.code,
                    label: d.name,
                    icon: "shake-hands-line",
                    selected: b.dealer?.code === d.code,
                    onClick: () => b.dealer?.code !== d.code && run(() => setBookingDealer(b.code, d.code), `Dealer set to ${d.name}.`),
                  })),
                ]}
                trigger={
                  <button type="button" aria-label="Change dealer" className="flex h-6 w-4 cursor-pointer items-center justify-center rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Icon name="arrow-down-s-line" />
                  </button>
                }
              />
            )}
          </span>
        </Fact>
        {b.commission && (
          <Fact label="Commission">
            <span className="tabular-nums">
              {formatPkr(b.commission.amount)} <span className="text-muted-foreground">· {b.commission.pct}%</span>
            </span>{" "}
            <CommissionBadge status={b.commission.status} />
          </Fact>
        )}
        {b.lead && (
          <Fact label="From lead">
            <Link href={`/crm/leads?lead=${urlCode(b.lead.code)}`} className="text-primary hover:underline">
              {b.lead.code}
            </Link>
          </Fact>
        )}
      </Group>
    </section>
  )

  const tabs = [
    {
      value: "overview",
      label: "Overview",
      icon: "dashboard-line",
      content: <BookingOverview booking={b} details={details} onTab={setTab} onReceipt={(r) => setDialog({ doc: "receipt", receipt: r })} />,
    },
    {
      value: "schedule",
      label: "Payment schedule",
      icon: "calendar-todo-line",
      count: b.lines.length || null,
      content: b.lines.length ? (
        <div className="overflow-x-auto rounded-xl border bg-background shadow-xs">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Installment</th>
                <th className="px-3 py-2.5 font-medium">Due</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="w-24 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {b.lines.map((l) => (
                <tr key={l.id} className={cn("group", l.state === "overdue" && "bg-red-500/[0.04]")}>
                  <td className="px-4 py-2.5 font-medium">{l.label}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(l.dueDate)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatPkr(l.amount)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{l.paid ? formatPkr(l.paid) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <LineBadge line={l} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {can.receipts && !closed && l.balance > 0 && ["overdue", "due-soon", "partial"].includes(l.state) && (
                      <Button size="sm" variant="outline" className="opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100" onClick={() => setDialog({ receiptFor: l })}>
                        Receive
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">
          <Icon name="calendar-todo-line" className="text-2xl" />
          <p className="mt-1">No payment plan yet.</p>
          {can.edit && !closed && (
            <Button className="mt-4" variant="outline" leftIcon="calendar-todo-line" onClick={() => setDialog("plan")}>
              Set up payment plan
            </Button>
          )}
        </div>
      ),
    },
    {
      value: "receipts",
      label: "Receipts",
      icon: "receipt-line",
      count: b.receipts.length || null,
      content: b.receipts.length ? (
        <ul className="divide-y rounded-xl border bg-background shadow-xs">
          {b.receipts.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{formatPkr(r.amount)}</span>
                  <MethodText method={r.method} className="text-muted-foreground" />
                  <ReceiptBadge status={r.status} />
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[formatDateTime(r.receivedOn), r.code, r.chequeNo && `Cheque ${r.chequeNo}${r.chequeBank ? ` · ${r.chequeBank}` : ""}`, r.reference, r.notes, r.by && `by ${r.by.name}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <ProofLink proof={r.proof} className="mr-1" />
                {r.status === "clearing" && can.cheques && (
                  <>
                    <Button size="sm" variant="outline" leftIcon="checkbox-circle-line" disabled={pending} onClick={() => markCheque(r, "cleared")}>
                      {can.chequesDirect ? "Cleared" : "Request clear"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      leftIcon="close-circle-line"
                      disabled={pending}
                      onClick={() => markCheque(r, "bounced")}
                    >
                      {can.chequesDirect ? "Bounced" : "Request bounce"}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" leftIcon="printer-line" onClick={() => setDialog({ doc: "receipt", receipt: r })}>
                  Receipt
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">
          <Icon name="receipt-line" className="text-2xl" />
          <p className="mt-1">No payments recorded yet.</p>
        </div>
      ),
    },
  ]

  tabs.push({
    value: "documents",
    label: "Documents",
    icon: "folder-shield-2-line",
    count: b.documents.files.length || null,
    content: <BookingDocuments booking={b} canEdit={can.documents && !closed} onOpenDoc={(doc) => setDialog({ doc })} />,
  })

  const more = [
    { label: "Statement of account", icon: "file-list-3-line", onClick: () => setDialog({ doc: "statement" }) },
    ...(b.allotment ? [{ label: "Allotment letter", icon: "file-paper-2-line", onClick: () => setDialog({ doc: "allotment" }) }] : []),
    ...(can.paymentRequest && !closed && b.balance > 0 ? [{ label: "Payment request", icon: "file-text-line", onClick: () => router.push(`/finance/payment-requests?new=${urlCode(b.code)}`) }] : []),
    ...(can.edit && !closed
      ? [
          { type: "separator" },
          { label: "Buyer details", icon: "user-settings-line", onClick: () => setDialog("buyer") },
          ...(!b.allotment ? [{ label: b.plan ? "Change payment plan" : "Set up payment plan", icon: "calendar-todo-line", onClick: () => setDialog("plan") }] : []),
          {
            label: b.status === "on-hold" ? "Take off hold" : "Put on hold",
            icon: b.status === "on-hold" ? "play-circle-line" : "pause-circle-line",
            onClick: () => run(() => setBookingHold(b.code, b.status !== "on-hold"), b.status === "on-hold" ? "Off hold." : "Put on hold."),
          },
          ...(can.cancel && b.stage !== "completed"
            ? [{ type: "separator" }, { label: can.cancelDirect ? "Cancel booking…" : "Request cancellation…", icon: "close-circle-line", variant: "destructive", onClick: () => setDialog("cancel") }]
            : []),
        ]
      : []),
  ]

  return (
    // The header (who, where it is, what to do) across the top; under it two columns on large
    // screens, each scrolling on its own: the booking on the left, its activity on the right.
    // Smaller screens: header, the booking, then the activity.
    <div className="xl:flex xl:h-[calc(100svh-3.5rem)] xl:flex-col">
      <header className="shrink-0 space-y-3 border-b bg-background px-4 pt-4 pb-4 sm:px-6 lg:px-8">
        <Link href="/operations/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Bookings
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
              {b.buyer.name}
              <StageBadge stage={b.stage} className="h-7 px-2.5 text-sm" />
              <StatusBadge status={b.status} className="h-7 px-2.5 text-sm" />
              <BookingHandler booking={b} canReassign={can.reassign && !closed} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">{[b.code, b.project.name, b.unit.number].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {step?.action && (can.edit || ["receipt"].includes(step.action)) && (
              <Button leftIcon={step.icon} loading={pending && ["allot", "handover", "completed"].includes(step.action)} onClick={() => act(step.action)}>
                {step.label}
              </Button>
            )}
            {can.receipts && !closed && b.balance > 0 && step?.action !== "receipt" && (
              <Button variant="outline" leftIcon="money-dollar-circle-line" onClick={() => setDialog("receipt")}>
                Record payment
              </Button>
            )}
            <DropdownMenu align="end" items={more} trigger={<Button variant="outline" leftIcon="more-2-line" aria-label="More" />} />
          </div>
        </div>
      </header>
      <div className="min-h-0 xl:flex xl:flex-1">
        <ScrollView variant="subtle" className="min-w-0 flex-1 xl:h-full" viewportClassName="space-y-4 p-4 sm:p-6">
          {b.cancellation ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.04] px-4 py-3 text-sm">
              <Icon name="close-circle-line" className="text-lg text-red-600 dark:text-red-400" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">Canceled {timeAgo(b.cancellation.at)}</span>
                {b.cancellation.by && ` by ${b.cancellation.by.name}`}: {b.cancellation.reason}
              </span>
              <span className="tabular-nums">
                Refund due <span className="font-semibold">{formatPkr(b.cancellation.refund)}</span> <span className="text-muted-foreground">after {b.cancellation.deductionPct}% deduction</span>
              </span>
            </div>
          ) : (
            <section className="divide-y rounded-xl border bg-background shadow-xs">
              <div className="px-4 py-3">
                <Stepper stage={b.stage} cancelled={closed} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-4">
                <Figure label="Net price" value={formatPkr(b.net)} />
                <Figure label="Received" value={formatPkr(b.received)} tone="text-emerald-700 dark:text-emerald-400" note={`${b.paidPct}%`} />
                <Figure label="Balance" value={formatPkr(b.balance)} />
                {b.overdueAmount > 0 ? (
                  <Figure label="Overdue" value={formatPkr(b.overdueAmount)} tone="text-red-600 dark:text-red-400" note={`${b.overdueCount} ${b.overdueCount === 1 ? "payment" : "payments"}`} />
                ) : (
                  <Figure label="Next due" value={b.nextDue ? formatPkr(b.nextDue.balance) : "—"} note={b.nextDue ? formatDate(b.nextDue.dueDate) : null} />
                )}
                <PaidMeter pct={b.paidPct} overdue={b.overdueAmount > 0} className="col-span-full h-1" />
              </div>
              {!b.access.works && b.access.seller && (
                <p className="flex items-center gap-2 bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
                  <Icon name="user-shared-line" className="text-base" />
                  You sold this booking{b.agent ? `; ${b.agent.name} handles it now` : ""}. You can follow it, add notes and files{!b.allotment ? ", and upload documents until the allotment letter" : ""}.
                </p>
              )}
              {step && (b.access.works || !b.access.seller) && (
                <p className="flex items-center gap-2 px-4 py-2.5 text-[15px]">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Next</span>
                  <span className="min-w-0 truncate">{step.text}</span>
                  {b.stage === "token" && b.tokenAmount && (
                    <span className="ml-auto shrink-0 text-xs text-amber-700 dark:text-amber-400">
                      Token {formatPkr(b.tokenAmount)}
                      {b.tokenDueDate ? ` due ${formatDate(b.tokenDueDate)}` : ""}
                    </span>
                  )}
                </p>
              )}
            </section>
          )}

          <div className="min-w-0">
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
          </div>
        </ScrollView>

        <aside className="flex h-[75svh] flex-col border-t bg-background xl:h-full xl:w-[26rem] xl:shrink-0 xl:border-t-0 xl:border-l 2xl:w-[28rem]">
          <BookingActivity booking={b} canEdit={can.notes} />
        </aside>
      </div>

      {dialog === "plan" && <PlanDialog booking={b} discountLimit={can.discount} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "buyer" && <BuyerDialog booking={b} onClose={() => setDialog(null)} onDone={done} />}
      {(dialog === "receipt" || dialog?.receiptFor) && <ReceiptDialog booking={b} line={dialog?.receiptFor ?? null} direct={can.receiptsDirect} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "cancel" && <CancelDialog booking={b} direct={can.cancelDirect} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.chequeAsk && (
        <ApprovalReasonDialog
          title={`Request to mark ${dialog.chequeAsk.receipt.chequeNo ? `cheque ${dialog.chequeAsk.receipt.chequeNo}` : dialog.chequeAsk.receipt.code} ${dialog.chequeAsk.status}`}
          description={`Your role can't clear or bounce cheques. Someone who can gets this in their Approvals inbox; ${dialog.chequeAsk.status === "cleared" ? "it counts once they approve" : "the installment is due again once they approve"}.`}
          placeholder={dialog.chequeAsk.status === "cleared" ? "e.g. Showing in the bank statement today." : "e.g. Returned by the bank: insufficient funds."}
          onSend={async (reason) => {
            const r = await setReceiptStatus(dialog.chequeAsk.receipt.code, dialog.chequeAsk.status, reason)
            if (r?.error) setNotice({ tone: "error", text: r.error })
            else done(SENT_FOR_APPROVAL)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.doc && (
        <PrintPreviewDialog
          title={dialog.doc === "statement" ? "Statement of account" : dialog.doc === "allotment" ? "Allotment letter" : `Receipt ${dialog.receipt.code}`}
          printUrl={`/operations/bookings/${urlCode(b.code)}/print?doc=${dialog.doc}${dialog.receipt ? `&receipt=${urlCode(dialog.receipt.code)}` : ""}`}
          onClose={() => setDialog(null)}
        >
          {dialog.doc === "statement" && <StatementDocument {...docProps} />}
          {dialog.doc === "allotment" && <AllotmentLetter {...docProps} />}
          {dialog.doc === "receipt" && <ReceiptDocument {...docProps} receipt={dialog.receipt} />}
        </PrintPreviewDialog>
      )}
    </div>
  )
}
