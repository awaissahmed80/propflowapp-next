"use client"

import Link from "next/link"
import { formatAmount, formatDate, formatPkr } from "@/lib/format"
import { useList, useMeasures } from "@/modules/lookups/context"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { chargeText, isCashPlan, planLength, planSummary, quote, rateBasis, ratePrice, rateSize } from "../pricing"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const STATUS_NOTE = { draft: "Draft · not yet in effect", pending: "Awaiting approval · not yet in effect", archived: "Archived · no longer in effect" }
const sizeOrder = (r, m) => (r.sizeValue == null ? Infinity : (m.sizeInMarla(r.sizeValue, r.sizeUnit) ?? r.sizeValue))

export function PriceListNotFound() {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <Icon name="price-tag-3-line" className="text-4xl text-muted-foreground" />
      <h1 className="mt-3 text-xl font-semibold">Price list not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been a draft that was deleted.</p>
      <Button className="mt-6" variant="outline" leftIcon="arrow-left-line" nativeButton={false} render={<Link href="/project-portfolio/price-lists" />}>
        Back to price lists
      </Button>
    </div>
  )
}

const H = ({ children }) => <h2 className="mt-7 mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">{children}</h2>

// The price list on A4: rates, premiums, charges and payment plans, under the workspace letterhead
export function PriceListDocument({ list, brand }) {
  const types = useList("unit-type")
  const m = useMeasures()
  const categories = useList("block-category")
  const features = useList("feature")
  const rates = [...list.rates].filter((r) => r.rate > 0).sort((a, b) => a.type.localeCompare(b.type) || a.category.localeCompare(b.category) || sizeOrder(a, m) - sizeOrder(b, m))
  return (
    <A4Page label={list.name}>
      <WorkspaceLetterhead brand={brand} title="Price list" meta={`${list.project.name} · v${list.version}`} />
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">{list.name}</p>
        <p className="text-sm text-gray-600">
          {["draft", "pending"].includes(list.status) ? "Proposed" : "Effective"} from {formatDate(list.effectiveFrom)}
        </p>
      </div>
      {STATUS_NOTE[list.status] && <p className="mt-1 text-xs font-semibold text-amber-700 uppercase">{STATUS_NOTE[list.status]}</p>}

      <H>Rates</H>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs text-gray-500">
            <th className="py-1.5 font-semibold">Unit</th>
            <th className="py-1.5 font-semibold">Category</th>
            <th className="py-1.5 text-right font-semibold">Rate</th>
            <th className="py-1.5 text-right font-semibold">Price</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => {
            const price = ratePrice(r, list.project.marlaSqft, m)
            return (
              <tr key={r.key} className="border-b border-gray-100">
                <td className="py-1.5">
                  {types.label(r.type)} · {rateSize(r, m)}
                </td>
                <td className="py-1.5 text-gray-600">{categories.label(r.category)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  Rs {number(r.rate)}/{rateBasis(r.type, m) === "marla" ? "marla" : "sq ft"}
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums">{price ? formatAmount(price) : "By size"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {(list.premiums.length > 0 || list.floorRisePct > 0) && (
        <>
          <H>Premium locations</H>
          <p className="text-sm">{[...list.premiums.map((p) => `${features.label(p.feature)} +${p.percent}%`), ...(list.floorRisePct > 0 ? [`Floor rise +${list.floorRisePct}% per floor`] : [])].join(" · ")}</p>
          <p className="mt-1 text-xs text-gray-500">Premiums are charged on the base price.</p>
        </>
      )}

      {list.plans.length > 0 && (
        <>
          <H>Payment plans</H>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs text-gray-500">
                <th className="py-1.5 font-semibold">Plan</th>
                <th className="py-1.5 font-semibold">Terms</th>
                <th className="py-1.5 text-right font-semibold">Length</th>
              </tr>
            </thead>
            <tbody>
              {list.plans.map((p) => (
                <tr key={p.key} className="border-b border-gray-100 align-top">
                  <td className="py-1.5 pr-4 font-medium">{p.name}</td>
                  <td className="py-1.5 pr-4">
                    {planSummary(p)}
                    {p.note && <span className="block text-xs text-gray-500">{p.note}</span>}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">{isCashPlan(p) ? "—" : planLength(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {list.charges.length > 0 && (
        <>
          <H>Other charges</H>
          <table className="w-full text-sm">
            <tbody>
              {list.charges.map((c) => (
                <tr key={c.key} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4">{c.name}</td>
                  <td className="py-1.5 pr-4 tabular-nums">{chargeText(c)}</td>
                  <td className="py-1.5 text-right text-gray-600">{c.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {list.notes && <p className="mt-8 text-sm whitespace-pre-line text-gray-600">{list.notes}</p>}
      <p className="mt-6 text-xs text-gray-400">Printed {formatDate(new Date())}</p>
    </A4Page>
  )
}

// One unit's payment schedule on A4
export function ScheduleDocument({ list, unit, input, planKey, start, brand, preparedBy }) {
  const types = useList("unit-type")
  const m = useMeasures()
  const features = useList("feature")
  const q = input.sizeValue > 0 ? quote(list, input, planKey, start, { marlaSqft: list.project.marlaSqft, featurePremium: (f) => Number(features.map[f]?.meta?.premium ?? 0), m }) : null
  const what = `${types.label(input.type)} ${unit ? unit.number : ""} · ${m.formatSize(input.sizeValue, input.sizeUnit)}`.replace("  ", " ")
  return (
    <A4Page label="Payment schedule">
      <WorkspaceLetterhead brand={brand} title="Payment schedule" meta={list.project.name} />
      {!q ? (
        <p className="mt-6 text-sm">No rate in {list.name} covers this unit.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p>
              <span className="text-gray-500">Unit</span> {what}
            </p>
            <p className="text-right">
              <span className="text-gray-500">Plan</span> {q.plan.name}
            </p>
            <p>
              <span className="text-gray-500">Premiums</span> {q.premiums.length ? q.premiums.map((p) => `${features.label(p.feature)} +${p.percent}%`).join(", ") : "None"}
              {q.floorRise ? ` · floor rise ${q.floorRise}%` : ""}
            </p>
            <p className="text-right text-gray-600">{planSummary(q.plan)}</p>
          </div>
          {list.status !== "active" && <p className="mt-2 text-xs font-semibold text-amber-700 uppercase">{STATUS_NOTE[list.status]}</p>}

          <dl className="mt-5 grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Price</dt>
              <dd className="font-semibold tabular-nums">{formatPkr(q.price)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{q.schedule.discount ? "Cash discount" : "Down payment"}</dt>
              <dd className="font-semibold tabular-nums">{formatPkr(q.schedule.discount || q.schedule.rows[0].amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Payable</dt>
              <dd className="font-semibold tabular-nums">{formatPkr(q.schedule.net)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Other charges</dt>
              <dd className="font-semibold tabular-nums">{formatPkr(q.chargesTotal)}</dd>
            </div>
          </dl>

          <H>Schedule</H>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs text-gray-500">
                <th className="py-1.5 font-semibold">#</th>
                <th className="py-1.5 font-semibold">Due date</th>
                <th className="py-1.5 font-semibold">Payment</th>
                <th className="py-1.5 text-right font-semibold">Amount (Rs)</th>
                <th className="py-1.5 text-right font-semibold">Balance (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {q.schedule.rows.map((r) => (
                <tr key={r.key} className="border-b border-gray-100">
                  <td className="py-1 text-gray-500 tabular-nums">{r.no}</td>
                  <td className="py-1 whitespace-nowrap">{formatDate(r.dueDate)}</td>
                  <td className="py-1">{r.label}</td>
                  <td className="py-1 text-right tabular-nums">{number(r.amount)}</td>
                  <td className="py-1 text-right text-gray-500 tabular-nums">{number(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {q.charges.length > 0 && (
            <>
              <H>Charges payable separately</H>
              <table className="w-full text-sm">
                <tbody>
                  {q.charges.map((c) => (
                    <tr key={c.key} className="border-b border-gray-100">
                      <td className="py-1.5">{c.name}</td>
                      <td className="py-1.5 text-gray-600">{c.due}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatAmount(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {list.notes && <p className="mt-6 text-sm whitespace-pre-line text-gray-600">{list.notes}</p>}
          <p className="mt-6 text-xs text-gray-400">
            {list.name} (v{list.version}) · Prepared {formatDate(new Date())}
            {preparedBy ? ` by ${preparedBy}` : ""} · This schedule is an estimate; the booking form governs.
          </p>
        </>
      )}
    </A4Page>
  )
}
