"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { urlCode } from "@/lib/url"
import { useList, useMeasures } from "@/modules/lookups/context"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { Notice } from "@/modules/users/components/user-parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Tabs } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { projectHref } from "../links"
import { listImpact, planProblems } from "../pricing"
import { activatePriceList, applyPriceList, createPriceList, deletePriceList, rejectPriceList, savePriceList, submitPriceList, withdrawPriceList } from "../server/price-lists"
import { PriceListDocument } from "./price-list-document"
import { PriceCalculator } from "./price-calculator"
import { ChargesTab, PlansTab, RatesTab } from "./price-list-parts"
import { PRICE_LIST_STATUS, priceListHref } from "./price-lists-view"
import { ProjectMark } from "./project-parts"

const EDITABLE = ["name", "effectiveFrom", "notes", "floorRisePct", "rates", "premiums", "charges", "plans"]
const pick = (l) => Object.fromEntries(EDITABLE.map((k) => [k, l[k]]))

function Impact({ impact }) {
  const types = useList("unit-type")
  const diff = impact.after - impact.before
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Units re-priced</dt>
          <dd className="font-medium tabular-nums">
            {impact.changed} <span className="font-normal text-muted-foreground">of {impact.unsold} unsold</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Stock value now</dt>
          <dd className="font-medium tabular-nums">{formatPkr(impact.before)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">After</dt>
          <dd className="font-medium tabular-nums">
            {formatPkr(impact.after)}{" "}
            {diff !== 0 && (
              <span className={diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                ({diff > 0 ? "+" : ""}
                {((diff / (impact.before || 1)) * 100).toFixed(1)}%)
              </span>
            )}
          </dd>
        </div>
      </dl>
      {impact.unpriced.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <Icon name="error-warning-line" className="mt-px" />
          No rate for {impact.unpriced.map((u) => `${u.count} × ${types.label(u.type)} ${u.size}`).join(", ")}. Those units keep their current price.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Booked and sold units keep the price agreed at booking.</p>
    </div>
  )
}

export function PriceListView({ list, brand, canEdit, canApprove }) {
  const router = useRouter()
  const features = useList("feature")
  const [draft, setDraft] = useState(() => (list.status === "draft" ? pick(list) : null))
  const [saved, setSaved] = useState(() => JSON.stringify(pick(list)))
  const [dialog, setDialog] = useState(null) // "activate" | "submit" | "reject" | "apply" | "print" | "deleting"
  const [note, setNote] = useState("")
  const [apply, setApply] = useState(true)
  const [pending, startTransition] = useTransition()
  const { confirm } = useAlert()

  const editing = Boolean(draft) && canEdit
  const current = draft ? { ...list, ...draft } : list
  const dirty = Boolean(draft) && JSON.stringify(draft) !== saved
  const patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const problems = draft ? [...draft.plans.flatMap((p) => planProblems(p).map((x) => `${p.name || "Plan"}: ${x}`)), ...(draft.rates.some((r) => !(r.rate > 0)) ? ["Every rate needs an amount"] : [])] : []
  const m = useMeasures()
  const opts = { marlaSqft: list.project.marlaSqft, featurePremium: (f) => Number(features.map[f]?.meta?.premium ?? 0), m }
  const impact = listImpact(current, list.units, opts)
  const building = ["apartments", "commercial", "mixed-use"].includes(list.project.type) || list.units.some((u) => u.floor > 0)
  const status = PRICE_LIST_STATUS[list.status]
  const request = list.request
  const waiting = list.status === "pending"
  // Approvers decide others' requests; the person who sent it can only withdraw
  const canDecide = canApprove && !(waiting && request?.byMe)

  // msg: the loading and success toasts ({ loading, success }); errors show as a toast too
  const run = (fn, done, msg) =>
    startTransition(async () => {
      const r = await toastAction(fn, msg)
      if (!r?.error) done?.(r)
    })
  const save = () =>
    run(
      () => savePriceList(list.code, draft),
      () => {
        setSaved(JSON.stringify(draft))
        router.refresh()
      },
      { loading: "Saving…", success: "Draft saved." },
    )
  const remove = async () => {
    const ok = await confirm({
      title: `Delete the draft “${list.name}”?`,
      description: "The draft and its changes are removed. Active and archived lists aren't affected. This can't be undone.",
      confirmLabel: "Delete draft",
      destructive: true,
    })
    if (!ok) return
    setDialog("deleting")
    startTransition(async () => {
      const r = await toastAction(() => deletePriceList(list.code), { loading: "Deleting…" })
      if (r?.error) setDialog(null)
      else router.replace("/project-portfolio/price-lists")
    })
  }

  const newVersion = () =>
    run(
      () =>
        createPriceList({
          projectCode: list.project.code,
          source: list.code,
          name: `${list.project.name} price list ${new Date().getFullYear()} v${list.version + 1}`,
          effectiveFrom: new Date().toISOString().slice(0, 10),
        }),
      (r) => router.push(priceListHref(r.code)),
      { loading: "Creating a new version…" },
    )

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/project-portfolio/price-lists" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Price lists
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <ProjectMark project={list.project} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{current.name}</h1>
                <Badge color={status.color} dot>
                  {status.label}
                </Badge>
                <span className="rounded border px-1.5 font-mono text-xs text-muted-foreground">v{list.version}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link href={projectHref(list.project.code)} className="hover:text-foreground hover:underline">
                  {list.project.name}
                </Link>{" "}
                · {["draft", "pending"].includes(list.status) ? "Proposed" : "Effective"} from {formatDate(current.effectiveFrom)}
                {list.createdBy ? ` · Prepared by ${list.createdBy}` : ""}
                {list.activatedBy ? ` · Activated by ${list.activatedBy}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" leftIcon="printer-line" disabled={dirty} title={dirty ? "Save the draft first" : undefined} onClick={() => setDialog("print")}>
              Print
            </Button>
            {canEdit && list.status === "draft" && (
              <>
                <Button
                  variant="outline"
                  leftIcon="delete-bin-6-line"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40"
                  loading={pending && dialog === "deleting"}
                  onClick={remove}
                >
                  Delete
                </Button>
                <Button variant="outline" leftIcon="save-3-line" loading={pending && dialog === null} disabled={!dirty} onClick={save}>
                  Save draft
                </Button>
              </>
            )}
            {list.status === "draft" && canApprove && (
              <Button leftIcon="checkbox-circle-line" disabled={dirty || problems.length > 0} title={dirty ? "Save the draft first" : undefined} onClick={() => setDialog("activate")}>
                Activate
              </Button>
            )}
            {list.status === "draft" && canEdit && !canApprove && (
              <Button
                leftIcon="send-plane-line"
                disabled={dirty || problems.length > 0}
                title={dirty ? "Save the draft first" : undefined}
                onClick={() => {
                  setNote("")
                  setDialog("submit")
                }}
              >
                Send for approval
              </Button>
            )}
            {waiting && request?.byMe && (
              <Button
                variant="outline"
                leftIcon="arrow-go-back-line"
                loading={pending && dialog === null}
                onClick={() =>
                  run(
                    () => withdrawPriceList(list.code),
                    () => router.refresh(),
                    { loading: "Withdrawing…" },
                  )
                }
              >
                Withdraw
              </Button>
            )}
            {waiting && canDecide && (
              <>
                <Button
                  variant="outline"
                  leftIcon="reply-line"
                  onClick={() => {
                    setNote("")
                    setDialog("reject")
                  }}
                >
                  Send back
                </Button>
                <Button
                  leftIcon="checkbox-circle-line"
                  onClick={() => {
                    setApply(request?.apply !== false)
                    setDialog("activate")
                  }}
                >
                  Approve & activate
                </Button>
              </>
            )}
            {canEdit && list.status === "active" && (
              <>
                <Button variant="outline" leftIcon="price-tag-3-line" onClick={() => setDialog("apply")}>
                  Apply to inventory
                </Button>
                <Button leftIcon="file-copy-2-line" loading={pending} onClick={newVersion}>
                  New version
                </Button>
              </>
            )}
            {canEdit && list.status === "archived" && (
              <Button variant="outline" leftIcon="file-copy-2-line" loading={pending} onClick={newVersion}>
                New version from this
              </Button>
            )}
          </div>
        </div>
      </div>

      {waiting && request && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-sm">
          <Icon name="time-line" className="mt-0.5 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Waiting for approval · sent by {request.byMe ? "you" : (request.requester ?? "someone")} {timeAgo(request.requestedAt)}
            </p>
            {request.reason && <p className="mt-0.5 text-muted-foreground">“{request.reason}”</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canDecide ? "Approve to make it the active price list, or send it back with what needs changing." : "It can't be changed while it waits. Withdraw it to make changes."}
            </p>
          </div>
        </div>
      )}
      {list.status === "draft" && request?.status === "rejected" && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm">
          <Icon name="reply-line" className="mt-0.5 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Sent back by {request.decider ?? "an approver"} {request.decidedAt ? timeAgo(request.decidedAt) : ""}
            </p>
            {request.note && <p className="mt-0.5">{request.note}</p>}
          </div>
        </div>
      )}
      {list.status === "draft" && !canApprove && canEdit && request?.status !== "rejected" && (
        <Notice icon="information-line">When the draft is ready, send it for approval. Someone with approval rights in Project Portfolio activates it.</Notice>
      )}
      {editing && problems.length > 0 && <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Fix before activating: {problems.join(" · ")}</div>}

      {editing ? (
        <div className="grid gap-4 rounded-xl border bg-background p-4 shadow-xs md:grid-cols-[minmax(0,1fr)_14rem]">
          <Input label="Name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          <DatePicker label="Effective from" clearable={false} value={draft.effectiveFrom} onChange={(v) => v && patch({ effectiveFrom: v })} />
          <div className="md:col-span-2">
            <Textarea label="Notes printed on the price list" rows={2} placeholder="e.g. Prices are subject to change without notice." value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </div>
        </div>
      ) : (
        list.notes && <p className="text-sm text-muted-foreground italic">{list.notes}</p>
      )}

      <Tabs
        tabs={[
          {
            value: "rates",
            label: "Rates",
            icon: "price-tag-3-line",
            count: current.rates.length,
            content: <RatesTab list={current} units={list.units} marlaSqft={list.project.marlaSqft} editing={editing} onChange={(rates) => patch({ rates })} />,
          },
          {
            value: "charges",
            label: "Premiums & charges",
            icon: "star-smile-line",
            count: current.premiums.length + current.charges.length,
            content: <ChargesTab list={current} editing={editing} building={building} onChange={patch} />,
          },
          { value: "plans", label: "Payment plans", icon: "calendar-check-line", count: current.plans.length, content: <PlansTab list={current} editing={editing} onChange={(plans) => patch({ plans })} /> },
          {
            value: "calculator",
            label: "Calculator",
            icon: "calculator-line",
            content: <PriceCalculator key={JSON.stringify([current.rates, current.plans.map((p) => p.key)])} list={current} units={list.units} marlaSqft={list.project.marlaSqft} brand={brand} printable={!dirty} />,
          },
        ]}
      />

      {dialog === "activate" && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          className="sm:max-w-lg"
          title={waiting ? `Approve and activate ${list.name}?` : `Activate ${list.name}?`}
          description={`It becomes ${list.project.name}'s price list from ${formatDate(list.effectiveFrom)}. The current active list is archived.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                leftIcon="checkbox-circle-line"
                loading={pending}
                onClick={() =>
                  run(
                    () => activatePriceList(list.code, { apply }),
                    () => {
                      setDialog(null)
                      setDraft(null)
                      router.refresh()
                    },
                    { loading: "Activating…", success: (r) => (apply ? `Price list activated. ${r.repriced} unsold ${r.repriced === 1 ? "unit" : "units"} re-priced.` : "Price list activated.") },
                  )
                }
              >
                Activate
              </Button>
            </>
          }
        >
          <Checkbox label="Re-price unsold inventory now" description="Available, on-hold and blocked units move to the new rates and premiums." checked={apply} onChange={setApply} />
          {apply && <Impact impact={impact} />}
        </Dialog>
      )}
      {dialog === "submit" && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          className="sm:max-w-lg"
          title="Send for approval"
          description={`Someone with approval rights activates ${list.name}. It can't be changed while it waits.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                leftIcon="send-plane-line"
                loading={pending}
                onClick={() =>
                  run(
                    () => submitPriceList(list.code, { note, apply }),
                    () => {
                      setDialog(null)
                      setDraft(null)
                      router.refresh()
                    },
                    { loading: "Sending…", success: "Sent for approval. It's in their My Desk now." },
                  )
                }
              >
                Send
              </Button>
            </>
          }
        >
          <Textarea label="Note for the approver" rows={3} placeholder="e.g. 10% increase on 5 Marla, new 3-year plan" value={note} onChange={(e) => setNote(e.target.value)} />
          <Checkbox label="Re-price unsold inventory when activated" description="Available, on-hold and blocked units move to the new rates and premiums." checked={apply} onChange={setApply} />
          {apply && <Impact impact={impact} />}
        </Dialog>
      )}
      {dialog === "reject" && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          className="sm:max-w-md"
          title="Send back"
          description={`${list.name} goes back to draft${request?.requester ? ` for ${request.requester}` : ""}.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                leftIcon="reply-line"
                loading={pending}
                disabled={!note.trim()}
                onClick={() =>
                  run(
                    () => rejectPriceList(list.code, note),
                    () => {
                      setDialog(null)
                      router.refresh()
                    },
                    { loading: "Sending back…", success: "Sent back for changes." },
                  )
                }
              >
                Send back
              </Button>
            </>
          }
        >
          <Textarea label="What needs changing? (they'll see this)" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
        </Dialog>
      )}
      {dialog === "print" && (
        <PrintPreviewDialog
          title={list.name}
          description={`Price list · v${list.version} · print preview (A4)`}
          printUrl={`/project-portfolio/price-lists/${urlCode(list.code)}/print`}
          pdfUrl={`/api/portfolio/price-lists/${urlCode(list.code)}/pdf`}
          onClose={() => setDialog(null)}
        >
          <PriceListDocument list={list} brand={brand} />
        </PrintPreviewDialog>
      )}
      {dialog === "apply" && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          className="sm:max-w-lg"
          title="Apply to inventory"
          description={`Re-price unsold units of ${list.project.name} using this list.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                leftIcon="price-tag-3-line"
                loading={pending}
                disabled={!impact.changed}
                onClick={() =>
                  run(
                    () => applyPriceList(list.code),
                    () => {
                      setDialog(null)
                      router.refresh()
                    },
                    { loading: "Re-pricing…", success: (r) => `${r.repriced} unsold ${r.repriced === 1 ? "unit" : "units"} re-priced.` },
                  )
                }
              >
                Re-price {impact.changed} {impact.changed === 1 ? "unit" : "units"}
              </Button>
            </>
          }
        >
          {impact.changed ? <Impact impact={impact} /> : <p className="text-sm text-muted-foreground">All unsold units already match this price list.</p>}
        </Dialog>
      )}
    </div>
  )
}
