import Link from "next/link"
import { notFound } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { requireArea } from "@/modules/console/server/access"
import { getRequest } from "@/modules/console/server/queries"
import { PRIORITIES, REQUEST_CATEGORIES, REQUEST_STATUSES, byValue } from "@/modules/console/statuses"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { StatusBadge } from "@/modules/console/components/parts"
import { DiscardButton } from "@/modules/console/components/deletion"
import { fromUrlCode, urlCode } from "@/lib/url"

const CATEGORY = byValue(REQUEST_CATEGORIES)
const PRIORITY = byValue(PRIORITIES)
// Screenshots on a message (sent with Contact support): [{ ref, name, … }]
const attachmentsOf = (m) => (typeof m.attachments === "string" ? JSON.parse(m.attachments) : m.attachments) ?? []

export async function generateMetadata({ params }) {
  const code = fromUrlCode((await params).code)
  return { title: code }
}

// Replying, status and assignment come with the request actions
export default async function RequestDetailPage({ params }) {
  const code = fromUrlCode((await params).code)
  const staff = await requireArea("requests", `/requests/${urlCode(code)}`)
  const r = await getRequest(code)
  if (!r) notFound()

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <Icon name="arrow-left-line" /> Workspace requests
      </Link>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{r.subject}</h1>
              {staff.role === "owner" && <DiscardButton kind="request" id={r.id} code={r.code} back="/requests" />}
              {r.priority === "urgent" && <Badge color="red">Urgent</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.code} · {CATEGORY[r.category]?.label ?? r.category} · {timeAgo(r.createdAt)}
            </p>
          </div>
          <ul className="space-y-3">
            {r.messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.isInternal
                    ? "ml-8 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-sm"
                    : m.authorSide === "platform"
                      ? "ml-8 rounded-xl bg-primary/10 p-4 text-sm"
                      : "mr-8 rounded-xl border bg-background p-4 text-sm"
                }
              >
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {m.author?.name ?? "Someone"}
                  {m.authorSide === "platform" ? " · PropFlow" : ` · ${r.tenantName}`}
                  {m.isInternal ? " · internal note" : ""} · {timeAgo(m.createdAt)}
                </p>
                <p className="whitespace-pre-line">{m.body}</p>
                {attachmentsOf(m).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {attachmentsOf(m).map((f) => (
                      <a
                        key={f.ref}
                        href={`/api/console/requests/${urlCode(r.code)}/files/${f.ref}`}
                        target="_blank"
                        rel="noreferrer"
                        title={f.name}
                        className="block size-24 overflow-hidden rounded-lg border bg-muted hover:ring-2 hover:ring-primary/40"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a private file served by our own route */}
                        <img src={`/api/console/requests/${urlCode(r.code)}/files/${f.ref}`} alt={f.name} loading="lazy" className="size-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {!r.messages.length && <li className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">No details.</li>}
          </ul>
        </div>
        <aside className="space-y-4">
          <SectionCard title="Request">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge list={REQUEST_STATUSES} value={r.status} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Urgency</dt>
                <dd>{PRIORITY[r.priority]?.label ?? r.priority}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Assigned to</dt>
                <dd>{r.assignee?.name ?? "Unassigned"}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Workspace">
            <Link href={`/workspaces/${urlCode(r.tenantCode)}`} className="block font-medium text-primary hover:underline">
              {r.tenantName}
            </Link>
            <p className="text-sm text-muted-foreground">
              {r.tenantCode}
              {r.tenantCity ? ` · ${r.tenantCity}` : ""}
            </p>
            {r.raisedByUser && (
              <p className="mt-2 text-sm">
                {r.raisedByUser.name}
                <span className="block text-xs text-muted-foreground">{r.raisedByUser.email}</span>
              </p>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}
