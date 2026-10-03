"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { paymentSchedule, planSummary } from "@/modules/portfolio/pricing"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker, DateTimePicker } from "@/components/ui/datetimepicker"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { createSalesBooking } from "../server/bookings"
import { ProofPicker, proofForm, useUnitText } from "./sales-parts"

// Sales › New booking, for buyers who walk in without a CRM lead: unit, buyer (as on CNIC),
// payment plan, and the token or down payment received. Leads book from CRM's Close deal tab.

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
// Now in Pakistan time, as the date-time picker's value ("2026-10-03T14:30")
const nowPk = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T")
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`
const formatCnic = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 13)
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join("-")
}

function Step({ n, title, done, children }) {
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {done ? <Icon name="check-line" /> : n}
          </span>
          {title}
        </span>
      }
    >
      {children}
    </SectionCard>
  )
}

//   canReceive: may take the token or down payment · receiveDirect: it counts at once (operations.receipts);
//   otherwise the booking is made and the payment waits in Approvals
export function NewBooking({ units, accounts, discountLimit, canReceive, receiveDirect = canReceive }) {
  const router = useRouter()
  const unitText = useUnitText()
  const methods = useList("payment-method")
  const [unitCode, setUnitCode] = useState(null)
  const [buyer, setBuyer] = useState({ name: "", phone: "", cnic: "", guardianRelation: "S/O", guardianName: "", address: "", city: "" })
  const [planKey, setPlanKey] = useState("")
  const [extra, setExtra] = useState(null)
  const [start, setStart] = useState(today())
  const [kind, setKind] = useState("booking")
  const [pay, setPay] = useState({ amount: null, method: "bank-transfer", reference: "", chequeNo: "", chequeBank: "", receivedOn: nowPk(), accountId: accounts.find((a) => a.isDefault)?.id ?? null })
  const [proof, setProof] = useState(null)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const unit = units.find((u) => u.code === unitCode) ?? null
  const plan = unit?.plans.find((p) => p.key === planKey) ?? null
  const limit = unit ? Math.round((unit.price * discountLimit) / 100) : 0
  const sched = useMemo(() => (unit && plan ? paymentSchedule(unit.price - (extra || 0), plan, new Date(`${start}T00:00:00`)) : null), [unit, plan, extra, start])
  const down = sched?.rows[0]
  const setB = (patch) => setBuyer((b) => ({ ...b, ...patch }))
  const setP = (patch) => setPay((p) => ({ ...p, ...patch }))
  const e = (k) => errors[k]

  const submit = () =>
    startTransition(async () => {
      setErrors({})
      setError("")
      const r = await createSalesBooking({ unitCode, buyer, planKey, extraDiscount: extra || 0, start, kind, payment: { ...pay, amount: pay.amount ?? 0 } }, proofForm(proof))
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else {
        if (!receiveDirect) toast.success(`Booked (${r.code}). The payment is waiting in Approvals and counts once it's approved.`)
        router.push(`/operations/bookings/${urlCode(r.code)}`)
      }
    })

  const buyerDone = buyer.name && buyer.phone && /^\d{5}-\d{7}-\d$/.test(buyer.cnic) && buyer.guardianName && buyer.address
  const cheque = pay.method === "cheque"

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/operations/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Bookings
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">New booking</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">For walk-in buyers. Leads book from CRM (the lead&apos;s Close deal tab).</p>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Step n={1} title="Unit" done={Boolean(unit)}>
            {units.length ? (
              <Combobox
                aria-label="Unit"
                placeholder="Search unit number, project or size…"
                value={unitCode}
                onChange={(v) => {
                  setUnitCode(v)
                  setPlanKey("")
                  setExtra(null)
                }}
                options={units.map((u) => ({
                  value: u.code,
                  label: `${u.project.name} · ${u.number}`,
                  description: `${unitText(u)}${u.block ? ` · ${u.block}` : ""} · ${formatPkr(u.price)}${u.status === "on-hold" ? " · on hold" : ""}`,
                }))}
                error={e("unitCode")}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No units can be booked: they need to be available (or on hold) in a project with an active price list that has payment plans.</p>
            )}
            {unit?.status === "on-hold" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">This unit is on hold. Booking it releases the hold.</p>}
          </Step>

          <Step n={2} title="Buyer, as on the CNIC" done={Boolean(buyerDone)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" required value={buyer.name} onChange={(ev) => setB({ name: ev.target.value })} error={e("buyer.name")} />
              <Input label="Mobile" required inputMode="tel" placeholder="0300 1234567" value={buyer.phone} onChange={(ev) => setB({ phone: ev.target.value })} error={e("buyer.phone")} />
              <Input label="CNIC" required inputMode="numeric" placeholder="35202-1234567-1" value={buyer.cnic} onChange={(ev) => setB({ cnic: formatCnic(ev.target.value) })} error={e("buyer.cnic")} />
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <Select label="Relation" value={buyer.guardianRelation} onChange={(v) => setB({ guardianRelation: v })} options={["S/O", "D/O", "W/O"].map((v) => ({ value: v, label: v }))} />
                <Input label="Father / husband" required value={buyer.guardianName} onChange={(ev) => setB({ guardianName: ev.target.value })} error={e("buyer.guardianName")} />
              </div>
              <div className="sm:col-span-2">
                <Input label="Postal address" required value={buyer.address} onChange={(ev) => setB({ address: ev.target.value })} error={e("buyer.address")} />
              </div>
              <Input label="City" value={buyer.city} onChange={(ev) => setB({ city: ev.target.value })} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Someone already in Contacts with this mobile is used, not duplicated. Add a nominee from the booking afterwards.</p>
          </Step>

          <Step n={3} title="Payment plan" done={Boolean(plan)}>
            {!unit ? (
              <p className="text-sm text-muted-foreground">Pick the unit first: plans come from its project&apos;s price list.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {unit.plans.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPlanKey(p.key)}
                      className={cn("cursor-pointer rounded-xl border p-3 text-left transition-colors", p.key === planKey ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}
                    >
                      <span className="block font-medium">{p.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{planSummary(p)}</span>
                    </button>
                  ))}
                </div>
                {e("planKey") && <p className="text-xs text-destructive">{e("planKey")}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <DatePicker label="Plan starts" value={start} onChange={(v) => v && setStart(v)} clearable={false} />
                  {limit > 0 && <NumberInput label={`Extra discount (up to ${discountLimit}%)`} prefix="Rs" min={0} max={limit} placeholder="None" value={extra} onChange={setExtra} error={e("extraDiscount")} />}
                </div>
                {sched && (
                  <div className="max-h-52 overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {sched.rows.map((r) => (
                          <tr key={r.key}>
                            <td className="px-3 py-1.5">{r.label}</td>
                            <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{formatDate(r.dueDate)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{rs(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step n={4} title="Token or down payment" done={Boolean(pay.amount)}>
            {!canReceive ? (
              <p className="text-sm text-muted-foreground">Your role can&apos;t record payments, so it can&apos;t take the token or down payment. Ask someone who can.</p>
            ) : (
              <div className="space-y-4">
                {!receiveDirect && (
                  <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    <Icon name="shield-check-line" className="mt-0.5 shrink-0" />
                    Your role can&apos;t record payments directly: the booking is made now and the payment is sent for approval. It counts once approved.
                  </p>
                )}
                <ToggleGroup
                  aria-label="Booking with"
                  value={kind}
                  onChange={(v) => v && setKind(v)}
                  options={[
                    { value: "booking", label: down ? `Down payment received (${formatPkr(down.amount)})` : "Down payment received" },
                    { value: "token", label: "Token only" },
                  ]}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberInput
                    label={kind === "token" ? "Token received" : "Amount received"}
                    required
                    prefix="Rs"
                    min={1}
                    placeholder={kind === "booking" && down ? String(down.amount) : ""}
                    value={pay.amount}
                    onChange={(v) => setP({ amount: v })}
                    error={e("payment.amount")}
                  />
                  <DateTimePicker label="Received on" value={pay.receivedOn} maxDate={today()} onChange={(v) => v && setP({ receivedOn: v })} clearable={false} error={e("payment.receivedOn")} />
                </div>
                <ToggleGroup
                  aria-label="Paid by"
                  value={pay.method}
                  onChange={(v) => v && setP({ method: v })}
                  options={methods.options.map((o) => ({ value: o.value, label: o.label.replace(/ \(.*\)$/, "") }))}
                  className="flex-wrap"
                />
                {e("payment.method") && <p className="text-xs text-destructive">{e("payment.method")}</p>}
                {cheque ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Cheque no." required value={pay.chequeNo} onChange={(ev) => setP({ chequeNo: ev.target.value })} error={e("payment.chequeNo")} />
                    <Input label="Bank" value={pay.chequeBank} onChange={(ev) => setP({ chequeBank: ev.target.value })} />
                  </div>
                ) : (
                  <Input label="Reference" placeholder="Transaction ID, pay order or receipt book no." value={pay.reference} onChange={(ev) => setP({ reference: ev.target.value })} />
                )}
                <ProofPicker value={proof} onChange={setProof} error={e("proof")} />
              </div>
            )}
          </Step>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <SectionCard title="Summary">
            <dl className="space-y-1.5 text-sm">
              {[
                ["Unit", unit ? `${unit.project.name} · ${unit.number}` : "—"],
                ["Buyer", buyer.name || "—"],
                ["Plan", plan?.name ?? "—"],
                ["List price", unit ? rs(unit.price) : "—"],
                ["Discount", sched && sched.discount + (extra || 0) > 0 ? `− ${rs(sched.discount + (extra || 0))}` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate text-right">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
                <dt>Net price</dt>
                <dd className="tabular-nums">{sched ? rs(sched.net) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <dt>{down?.label ?? "Down payment"}</dt>
                <dd className="tabular-nums">{down ? rs(down.amount) : "—"}</dd>
              </div>
            </dl>
            <Button className="mt-4 w-full" leftIcon="check-line" loading={pending} disabled={!unit || !plan || !buyerDone || !pay.amount || !canReceive} onClick={submit}>
              {kind === "token" ? "Record token" : "Confirm booking"}
            </Button>
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}
