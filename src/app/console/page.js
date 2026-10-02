import { Suspense } from "react"
import Link from "next/link"
import { formatAmount, formatDate, formatPkr, timeAgo } from "@/lib/format"
import { requireStaff } from "@/server/auth/dal"
import { platformMetrics } from "@/modules/console/server/queries"
import { canView } from "@/modules/console/roles"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { AccountStatus, ViewAll } from "@/modules/console/components/parts"
import { PlanMixChart, SignupsChart } from "@/modules/console/components/charts"
import { urlCode } from "@/lib/url"
import { RANGES } from "@/modules/console/server/analytics"
import { WebsiteAnalytics, WebsiteAnalyticsLoading } from "@/modules/console/components/website-analytics"

export const metadata = { title: "Overview" }

function Row({ href, title, text, right }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium group-hover:text-primary">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{text}</span>
        </span>
        {right}
      </Link>
    </li>
  )
}

const Empty = ({ children }) => <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>

export default async function OverviewPage({ searchParams }) {
  const staff = await requireStaff("/")
  // Website period: ?range=7 | 28 | 90 (days)
  const range = Number((await searchParams).range)
  const days = RANGES.includes(range) ? range : 28
  const m = await platformMetrics()
  const money = canView(staff.role, "billing")

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title={`Welcome, ${staff.user.name.split(" ")[0]}`} description="How PropFlow is doing across every customer workspace" />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {money ? (
          <StatTile icon="money-rupee-circle-line" tone="green" label="Monthly recurring revenue" value={formatPkr(m.mrr)} hint={`From ${m.paying} paying workspace${m.paying === 1 ? "" : "s"}`} />
        ) : (
          <StatTile icon="user-add-line" tone="green" label="New in 30 days" value={m.signups30} hint={`${m.total} workspaces in total`} />
        )}
        <Link href="/workspaces" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatTile icon="building-4-line" label="Paying workspaces" value={m.paying} hint={`${m.total} in total · ${m.signups30} new in 30 days`} className="h-full hover:border-primary/30" />
        </Link>
        <StatTile icon="hourglass-line" tone="sky" label="On free trial" value={m.trials} hint={`${m.endingSoon.length} ending within 7 days`} />
        {money ? (
          <Link href="/billing" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <StatTile
              icon="error-warning-line"
              tone={m.awaiting.length || m.atRisk.length ? "amber" : "green"}
              label="Needs attention"
              value={m.awaiting.length + m.atRisk.length}
              hint={`${m.awaiting.length} transfers to verify · ${m.atRisk.length} past due or suspended`}
              className="h-full hover:border-primary/30"
            />
          </Link>
        ) : (
          <StatTile icon="error-warning-line" tone={m.atRisk.length ? "amber" : "green"} label="Past due or suspended" value={m.atRisk.length} hint="Workspaces that may need help" />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="New workspaces · 6 months" className="xl:col-span-2">
          <SignupsChart data={m.byMonth} />
        </SectionCard>
        <SectionCard title="Plan mix">
          <PlanMixChart data={m.planMix} />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Trials ending soon" bodyClassName="p-0" action={<ViewAll href="/workspaces?status=trial" />}>
          {m.endingSoon.length ? (
            <ul className="divide-y">
              {m.endingSoon.map((t) => (
                <Row
                  key={t.id}
                  href={`/workspaces/${urlCode(t.code)}`}
                  title={t.name}
                  text={`${t.planName} · ${t.city ?? "—"} · ${t.users} users`}
                  right={<AccountStatus status={t.status} trialDaysLeft={t.trialDaysLeft} />}
                />
              ))}
            </ul>
          ) : (
            <Empty>No trials ending this week.</Empty>
          )}
        </SectionCard>
        {money && (
          <SectionCard title="Payments to verify" bodyClassName="p-0" action={<ViewAll href="/billing" />}>
            {m.awaiting.length ? (
              <ul className="divide-y">
                {m.awaiting.map((i) => (
                  <Row
                    key={i.id}
                    href={`/workspaces/${urlCode(i.tenantCode)}`}
                    title={i.tenantName}
                    text={`${i.code} · bank transfer · ${formatDate(i.issuedAt)}`}
                    right={<span className="text-sm font-medium tabular-nums">{formatAmount(i.total)}</span>}
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nothing to verify.</Empty>
            )}
          </SectionCard>
        )}
        <SectionCard title="Newest workspaces" bodyClassName="p-0" action={<ViewAll href="/workspaces" />}>
          {m.recent.length ? (
            <ul className="divide-y">
              {m.recent.map((t) => (
                <Row
                  key={t.id}
                  href={`/workspaces/${urlCode(t.code)}`}
                  title={t.name}
                  text={`${t.planName} · ${t.city ?? "—"} · ${timeAgo(t.createdAt)}`}
                  right={<AccountStatus status={t.status} trialDaysLeft={t.trialDaysLeft} />}
                />
              ))}
            </ul>
          ) : (
            <Empty>No workspaces yet. They appear here as companies sign up.</Empty>
          )}
        </SectionCard>
      </div>

      {/* propflowapp.com visitors (Google Analytics); streams in after the rest of the page */}
      <Suspense key={days} fallback={<WebsiteAnalyticsLoading />}>
        <WebsiteAnalytics days={days} />
      </Suspense>

      {m.atRisk.length > 0 && (
        <SectionCard title="Past due or suspended" bodyClassName="p-0">
          <ul className="divide-y">
            {m.atRisk.map((t) => (
              <Row key={t.id} href={`/workspaces/${urlCode(t.code)}`} title={t.name} text={t.suspendedReason ?? `${t.planName} · ${t.owner?.email ?? ""}`} right={<AccountStatus status={t.status} />} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
