"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Notice } from "@/modules/users/components/user-parts"
import { toHex } from "@/lib/color"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Icon } from "@/components/ui/icon"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createBooking, loadBookableUnits, setLeadStatus } from "../server/leads"

// The lead panel's "Close deal" tab: Won (mark as won, or pick a unit and create the booking) or
// Lost (why). Once closed it shows what happened: the booking up to the token (Sales sets up the payment plan), or the reason.
//   mode: "choose" | "won" | "lost" to start on (the status menu and the board pass one)

const today = () => new Date().toISOString().slice(0, 10)

export function DealTab({ lead, projects, canEdit, mode: startMode = "choose", onDone }) {
  const booked = lead.status === "booked"
  const lost = lead.status === "lost"
  const [mode, setMode] = useState(startMode)

  if (lost) return <LostSummary lead={lead} />
  if (booked && lead.booking) return <BookingSummary booking={lead.booking} />
  if (booked) return canEdit ? <WonForm lead={lead} projects={projects} alreadyWon onDone={onDone} /> : <WonNoUnit lead={lead} />
  if (!canEdit) return <p className="py-8 text-center text-[15px] text-muted-foreground">This lead is still open.</p>

  if (mode === "won") return <WonForm lead={lead} projects={projects} onBack={() => setMode("choose")} onDone={onDone} />
  if (mode === "lost") return <LostForm lead={lead} onBack={() => setMode("choose")} onDone={onDone} />
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Close this deal</h3>
        <p className="text-[15px] text-muted-foreground">Choose how to close the opportunity for {lead.name}.</p>
      </div>
      <div className="grid gap-3 @lg:grid-cols-2">
        <ChoiceCard tone="won" icon="trophy-line" title="Won" text="Move toward booking. You can attach a unit now or later." onClick={() => setMode("won")} />
        <ChoiceCard tone="lost" icon="close-circle-line" title="Lost" text="Client is not proceeding. Capture a short reason for the log." onClick={() => setMode("lost")} />
      </div>
    </section>
  )
}

function ChoiceCard({ tone, icon, title, text, onClick }) {
  const won = tone === "won"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer flex-col items-start rounded-xl border bg-background p-5 text-left shadow-xs transition outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0",
        won ? "hover:border-emerald-500/50" : "hover:border-red-500/50",
      )}
    >
      <span className={cn("flex size-11 items-center justify-center rounded-lg text-xl", won ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-red-500/12 text-red-600 dark:text-red-400")}>
        <Icon name={icon} />
      </span>
      <span className="mt-4 text-base font-semibold">{title}</span>
      <span className="mt-1 text-[15px] text-muted-foreground">{text}</span>
    </button>
  )
}

function Header({ title, text, onBack }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-[15px] text-muted-foreground">{text}</p>
      </div>
      {onBack && (
        <Button size="sm" variant="ghost" leftIcon="arrow-left-line" onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  )
}

// ---------- Lost ----------

function LostForm({ lead, onBack, onDone }) {
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const confirm = () =>
    startTransition(async () => {
      setError("")
      const r = await setLeadStatus(lead.code, "lost", { lossReason: reason, note: note.trim() })
      if (r?.error) setError(r.error)
      else onDone?.("Closed as lost.")
    })
  return (
    <section className="space-y-4 rounded-xl border bg-background p-5 shadow-xs">
      <Header title="Close as lost" text="The reason is saved on the lead's activity log." onBack={onBack} />
      {error && <Notice tone="error">{error}</Notice>}
      <LookupSelect list="loss-reason" label="Reason" value={reason} onChange={setReason} />
      <Textarea label="Note" rows={3} placeholder="Budget, timing, chose another project…" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button variant="destructive" leftIcon="close-circle-line" disabled={!reason} loading={pending} onClick={confirm}>
          Confirm lost
        </Button>
      </div>
    </section>
  )
}

function LostSummary({ lead }) {
  const reasons = useList("loss-reason")
  return (
    <section className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.05] p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/12 text-lg text-red-600 dark:text-red-400">
        <Icon name="close-circle-line" />
      </span>
      <div>
        <p className="font-semibold">Closed as lost</p>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          {lead.lossReason ? reasons.label(lead.lossReason) : "No reason recorded"}
          {lead.closedAt ? ` · ${timeAgo(lead.closedAt)}` : ""}
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">To work it again, change its status from the status menu.</p>
      </div>
    </section>
  )
}

// ---------- Won ----------

function WonNoUnit({ lead }) {
  return (
    <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
      <p className="font-semibold">Closed as won</p>
      <p className="mt-0.5 text-[15px] text-muted-foreground">No unit booked yet{lead.closedAt ? ` · ${timeAgo(lead.closedAt)}` : ""}.</p>
    </section>
  )
}

function WonForm({ lead, projects, alreadyWon = false, onBack, onDone }) {
  const [projectCode, setProjectCode] = useState(lead.interest?.project?.code ?? "")
  const [units, setUnits] = useState([])
  const [unitCode, setUnitCode] = useState("")
  const [kind, setKind] = useState("token")
  const [price, setPrice] = useState(null)
  const [token, setToken] = useState(null)
  const [tokenDue, setTokenDue] = useState(today)
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const unit = units.find((u) => u.code === unitCode)

  // Available units of the project
  useEffect(() => {
    let off = false
    if (projectCode)
      loadBookableUnits(projectCode).then((r) => {
        if (!off) setUnits(r.units ?? [])
      })
    return () => {
      off = true
    }
  }, [projectCode])

  const pickUnit = (code) => {
    setUnitCode(code)
    const u = units.find((x) => x.code === code)
    setPrice(u ? u.price : null)
    setErrors({})
  }
  const markWon = () =>
    startTransition(async () => {
      setError("")
      const r = await setLeadStatus(lead.code, "booked", { note: note.trim() })
      if (r?.error) setError(r.error)
      else onDone?.("Marked as won. You can attach a unit later.")
    })
  const book = () =>
    startTransition(async () => {
      setError("")
      setErrors({})
      const r = await createBooking(lead.code, {
        projectCode,
        unitCode,
        kind,
        agreedPrice: price,
        tokenAmount: kind === "token" ? token : null,
        tokenDueDate: kind === "token" ? tokenDue : "",
        notes: note.trim(),
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.error) setError(r.error)
      else onDone?.(`Booking ${r.booking} created. Well done!`)
    })

  return (
    <section className="space-y-4 rounded-xl border bg-background p-5 shadow-xs">
      <Header
        title="Complete the booking"
        text={unit ? `Create a booking for ${lead.name}.` : alreadyWon ? "Won without a unit so far: pick one to create the booking." : "Mark as won now, or pick a unit to create the booking."}
        onBack={onBack}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-4 @lg:grid-cols-2">
        <Select
          label="Project"
          value={projectCode}
          onChange={(v) => (setProjectCode(v), pickUnit(""))}
          placeholder="Pick the project"
          options={projects.map((p) => ({ value: p.code, label: p.name }))}
          error={errors.projectCode}
        />
        <Select
          label="Unit"
          value={unitCode}
          onChange={pickUnit}
          placeholder={projectCode ? (units.length ? "Optional — choose when ready" : "No available units") : "Pick a project first"}
          options={[{ value: "", label: "No unit yet" }, ...units.map((u) => ({ value: u.code, label: `${u.number} · ${formatPkr(u.price)}` }))]}
          error={errors.unitCode}
        />
      </div>

      {!unit ? (
        <>
          <p className="rounded-lg border border-dashed px-4 py-3 text-[15px] text-muted-foreground">No unit selected yet — negotiations can continue. You can attach a unit later and create the booking from this tab.</p>
          <Textarea label="Note" rows={3} placeholder="Deal terms agreed, awaiting unit selection…" value={note} onChange={(e) => setNote(e.target.value)} />
          {!alreadyWon && (
            <div className="flex justify-end border-t pt-4">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-600/90" leftIcon="trophy-line" loading={pending} onClick={markWon}>
                Mark as won
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-4 border-t pt-4 @lg:grid-cols-2">
            <Select
              label="Booking"
              value={kind}
              onChange={setKind}
              options={[
                { value: "token", label: "Token" },
                { value: "booking", label: "Full booking" },
              ]}
            />
            <NumberInput label="Agreed price" required min={1} prefix="Rs" value={price} onChange={setPrice} error={errors.agreedPrice} />
            {kind === "token" && (
              <>
                <NumberInput label="Token amount" min={0} prefix="Rs" placeholder="Optional" value={token} onChange={setToken} error={errors.tokenAmount} />
                <DatePicker label="Token due date" clearable={false} value={tokenDue} onChange={(v) => v && setTokenDue(v)} error={errors.tokenDueDate} />
              </>
            )}
          </div>

          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3.5 py-2.5 text-[14px] text-muted-foreground">
            <Icon name="information-line" className="mt-0.5 shrink-0" />
            The payment plan (one payment or installments) is set up in Operations once the booking is made.
          </p>
          <Textarea label="Note" rows={2} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />

          <div className="flex justify-end border-t pt-4">
            <Button leftIcon="file-paper-2-line" loading={pending} disabled={!price} onClick={book}>
              Create booking
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

// A booking's stage (Token → … → Completed) or status (Current, Overdue…), from Lists & Labels
function BookingBadge({ list, value }) {
  const v = useList(list).map[value]
  return (
    <Badge color={toHex(v?.color) ?? "gray"} dot>
      {v?.label ?? value}
    </Badge>
  )
}

function BookingSummary({ booking: b }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-lg text-emerald-600 dark:text-emerald-400">
          <Icon name="trophy-line" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Booked · {b.project}, unit {b.unit.number}
          </p>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            {b.code} · {b.kind === "token" ? "Token" : "Full booking"} · {formatDate(b.bookedAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <BookingBadge list="booking-stage" value={b.stage} />
            <BookingBadge list="booking-status" value={b.status} />
          </div>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 rounded-xl border p-5 text-[15px] @lg:grid-cols-2">
        {[
          ["Agreed price", formatPkr(b.agreedPrice)],
          ["Token", b.tokenAmount ? formatPkr(b.tokenAmount) : "—"],
          ["Token due", b.tokenDueDate ? formatDate(b.tokenDueDate) : "—"],
          [
            "In Operations",
            <Link key="operations" href={`/operations/bookings/${b.code.toLowerCase()}`} className="text-primary hover:underline">
              Open booking
            </Link>,
          ],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
