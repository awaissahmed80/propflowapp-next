"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Dialog } from "@/components/ui/dialog"
import { formatSize, sizedInSqft } from "../constants"
import { allocateUnits, releaseHolds, unblockUnits } from "../server/inventory"
import { BlockDialog, EditUnitDialog, HoldDialog, UnitStatusBadge, holdLeft, unitPlace, unitRate, useUnitLabel } from "./unit-parts"

const full = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

// One unit in a modal: where it is, its price, and what can be done with it
export function UnitDialog({ unit: u, priceList, canEdit, dealers, onClose }) {
  const router = useRouter()
  const unitLabel = useUnitLabel()
  const types = useList("unit-type")
  const features = useList("feature")
  const reasons = useList("hold-reason")
  const categories = useList("block-category")
  const [dialog, setDialog] = useState(null) // "hold" | "extend" | "block" | "edit"
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [now] = useState(() => Date.now())
  const act = (fn) =>
    startTransition(async () => {
      setError("")
      const r = await fn()
      if (r?.error) setError(r.error)
      else router.refresh()
    })

  const left = u.hold ? holdLeft(u.hold.expiresAt, now) : null
  const premiumTotal = u.premiums.reduce((s, p) => s + (u.basePrice * Number(p.percent)) / 100, 0)
  const allocatable = ["available", "on-hold"].includes(u.status)
  const editable = ["available", "on-hold", "blocked"].includes(u.status)

  const footer = canEdit && (
    <>
      {editable && (
        <Button variant="outline" leftIcon="pencil-line" className="sm:mr-auto" onClick={() => setDialog("edit")}>
          Edit unit
        </Button>
      )}
      {u.status === "available" && (
        <>
          <Button variant="outline" leftIcon="forbid-line" onClick={() => setDialog("block")}>
            Block
          </Button>
          <Button leftIcon="lock-line" onClick={() => setDialog("hold")}>
            Put on hold
          </Button>
        </>
      )}
      {u.status === "on-hold" && (
        <>
          <Button variant="outline" leftIcon="lock-unlock-line" loading={pending} onClick={() => act(() => releaseHolds([u.code]))}>
            Release
          </Button>
          <Button leftIcon="time-line" onClick={() => setDialog("extend")}>
            Extend hold
          </Button>
        </>
      )}
      {u.status === "blocked" && (
        <Button leftIcon="checkbox-circle-line" loading={pending} onClick={() => act(() => unblockUnits([u.code]))}>
          Unblock
        </Button>
      )}
      {["booked", "sold"].includes(u.status) && <p className="flex-1 text-xs text-muted-foreground">Bookings are managed in the Sales app.</p>}
      {allocatable && dealers.length > 0 && (
        <DropdownMenu
          align="end"
          side="top"
          items={[
            { type: "label", label: "Dealer quota" },
            ...dealers.map((d) => ({ key: d.code, label: d.name, selected: u.dealer?.code === d.code, onClick: () => act(() => allocateUnits([u.code], d.code)) })),
            ...(u.dealer ? [{ type: "separator" }, { label: "Return to company stock", icon: "arrow-go-back-line", onClick: () => act(() => allocateUnits([u.code], null)) }] : []),
          ]}
          trigger={<Button variant="outline" size="icon" leftIcon="shake-hands-line" aria-label="Allocate to a dealer" disabled={pending} />}
        />
      )}
    </>
  )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-3xl"
      title={
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-lg text-white" style={{ backgroundColor: u.project?.color }}>
            <Icon name={types.map[u.type]?.icon ?? "layout-grid-line"} />
          </span>
          <span className="min-w-0">
            <span className="block">{unitLabel(u)}</span>
            <span className="block text-sm font-normal text-muted-foreground">
              {u.project?.name} · {u.phase?.name}
            </span>
          </span>
        </span>
      }
      footer={footer}
    >
      <div className="flex flex-wrap gap-1.5">
        <UnitStatusBadge status={u.status} />
        {u.features.map((f) => (
          <Badge key={f} color="gray">
            {features.label(f)}
          </Badge>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {u.hold && (
        <div className={cn("rounded-lg border p-3 text-sm", left.expired ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10")}>
          <p className="flex items-center gap-1.5 font-medium">
            <Icon name="lock-line" /> On hold · {left.text}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {reasons.label(u.hold.reason)}
            {u.hold.by ? ` · held by ${u.hold.byMe ? "you" : u.hold.by}` : ""}
          </p>
        </div>
      )}
      {u.status === "blocked" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Icon name="forbid-line" /> Blocked by the company
          </p>
          <p className="mt-0.5 text-muted-foreground">{u.blockReason || "Not available for sale"}</p>
        </div>
      )}
      {u.dealer && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Icon name="shake-hands-line" /> Allocated to {u.dealer.name}
          </p>
          <p className="mt-0.5 text-muted-foreground">Part of the dealer&apos;s quota{u.dealer.city ? ` · ${u.dealer.city}` : ""}</p>
        </div>
      )}
      {u.phase?.stage === "unballoted" && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Icon name="file-paper-2-line" /> Unballoted file
          </p>
          <p className="mt-0.5 text-muted-foreground">Plot number and block are assigned at balloting.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Price</h3>
          <dl className="divide-y">
            <Row label="Base price">
              {full(u.basePrice)}
              <span className="block text-xs font-normal text-muted-foreground">
                {formatPkr(unitRate(u))}/{sizedInSqft(u.type) ? "sq ft" : "marla"} × {formatSize(u.sizeValue, u.sizeUnit)}
              </span>
            </Row>
            {u.premiums.map((p) => (
              <Row key={p.feature} label={`${features.label(p.feature)} +${p.percent}%`}>
                + {full((u.basePrice * Number(p.percent)) / 100)}
              </Row>
            ))}
            <Row label="Total">
              <span className="text-base">{full(u.price)}</span>
              <span className="block text-xs font-normal text-muted-foreground">{formatPkr(u.price)}</span>
            </Row>
          </dl>
          {premiumTotal > 0 && <p className="mt-1 text-xs text-muted-foreground">Premiums add {formatPkr(premiumTotal)}.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Development and possession charges are billed separately as per the project price list.</p>
        </section>

        <section className="rounded-xl border p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Details</h3>
          <dl className="divide-y">
            <Row label="Location">{unitPlace(u) || "—"}</Row>
            <Row label="Size">
              {formatSize(u.sizeValue, u.sizeUnit)}
              <span className="block text-xs font-normal text-muted-foreground">{[`${new Intl.NumberFormat("en-PK").format(u.areaSqft)} sq ft`, u.dimensions && `${u.dimensions} ft`].filter(Boolean).join(" · ")}</span>
            </Row>
            {u.bedrooms != null && <Row label="Bedrooms">{u.bedrooms}</Row>}
            <Row label="Category">{categories.label(u.category)}</Row>
            <Row label="Unit code">
              <span className="font-mono text-xs">{u.code}</span>
            </Row>
          </dl>
        </section>
      </div>

      {dialog === "hold" && <HoldDialog codes={[u.code]} title={`Put ${unitLabel(u)} on hold`} onClose={() => setDialog(null)} />}
      {dialog === "extend" && <HoldDialog codes={[u.code]} title={`Extend hold on ${unitLabel(u)}`} extending currentReason={u.hold?.reason} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditUnitDialog unit={u} priceList={priceList} title={`Edit ${unitLabel(u)}`} onClose={() => setDialog(null)} />}
      {dialog === "block" && <BlockDialog codes={[u.code]} title={`Block ${unitLabel(u)}`} onClose={() => setDialog(null)} />}
    </Dialog>
  )
}
