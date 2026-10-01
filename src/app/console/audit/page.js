import Link from "next/link"
import { formatDateTime } from "@/lib/format"
import { requireArea } from "@/modules/console/server/access"
import { listAudit } from "@/modules/console/server/queries"
import { AUDIT_ACTIONS } from "@/modules/console/statuses"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Icon } from "@/components/ui/icon"
import { urlCode } from "@/lib/url"

export const metadata = { title: "Audit Log" }

export default async function AuditPage() {
  await requireArea("audit", "/audit")
  const log = await listAudit()
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Audit Log" description="Every change made from the console, by whom and when" />
      <SectionCard bodyClassName="p-0">
        {log.length ? (
          <ul className="divide-y">
            {log.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <Icon name="history-line" className="mt-0.5 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{AUDIT_ACTIONS[a.action] ?? a.action}</span>
                  {a.tenantCode && (
                    <>
                      {" · "}
                      <Link href={`/workspaces/${urlCode(a.tenantCode)}`} className="text-primary hover:underline">
                        {a.tenantName}
                      </Link>
                    </>
                  )}
                  {a.details?.summary && <span className="block text-muted-foreground">{a.details.summary}</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {a.actor}
                  <span className="block">{formatDateTime(a.createdAt)}</span>
                  {a.ip && <span className="block font-mono">{a.ip}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No console changes yet.</p>
        )}
      </SectionCard>
    </div>
  )
}
