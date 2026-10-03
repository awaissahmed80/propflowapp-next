import Link from "next/link"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { RANGES, analyticsConfig, getWebsiteAnalytics } from "../server/analytics"
import { VisitorsChart } from "./charts"

// The Overview's "Website" section: propflowapp.com visitors from Google Analytics 4. Rendered
// inside <Suspense>, so a slow answer from Google never holds up the rest of the dashboard.

const number = (n) => new Intl.NumberFormat("en-PK").format(Math.round(n))

function duration(seconds) {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// "▲ 12% vs previous 28 days": green up / red down, with an arrow so it isn't color alone
function Change({ now, before, days }) {
  if (!before) return <span>{now ? `New in the last ${days} days` : `None in the last ${days} days`}</span>
  const pct = Math.round(((now - before) / before) * 100)
  if (!pct) return <span>Same as the previous {days} days</span>
  const up = pct > 0
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-flex items-center font-medium", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
        <Icon name={up ? "arrow-up-line" : "arrow-down-line"} />
        {Math.abs(pct)}%
      </span>
      vs previous {days} days
    </span>
  )
}

// Ranked list with a thin bar per row; the number is always shown, so the bar is only a guide
function BarList({ items, format = number, empty = "No visits yet." }) {
  if (!items.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-3 p-4">
      {items.map((i) => (
        <li key={i.label} title={`${i.label}: ${format(i.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{format(i.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--viz-blue)]" style={{ width: `${Math.max((i.value / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Create workspace → wizard → request sent → saved in Sales Enquiries
function Funnel({ funnel, requests }) {
  const steps = [
    { label: "Pressed Create workspace", hint: "People", value: funnel.clicks },
    { label: "Started the get-started wizard", hint: "People", value: funnel.started },
    { label: "Sent a request", hint: "People who finished a form", value: funnel.leads },
    { label: "Saved in Sales Enquiries", hint: "Requests in PropFlow", value: requests },
  ]
  const top = Math.max(steps[0].value, ...steps.map((s) => s.value), 1)
  return (
    <ol className="space-y-4 p-4">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{number(s.value)}</span>
          </div>
          <div className="mt-1.5 ml-7 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--viz-blue)]" style={{ width: `${Math.max((s.value / top) * 100, s.value ? 2 : 0)}%` }} />
          </div>
          <p className="mt-1 ml-7 text-xs text-muted-foreground">
            {s.hint}
            {i > 0 && steps[0].value > 0 && ` · ${Math.round((s.value / steps[0].value) * 100)}% of step 1`}
          </p>
        </li>
      ))}
    </ol>
  )
}

function Header({ days, children }) {
  const config = analyticsConfig()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight">Website</h2>
        <p className="text-sm text-muted-foreground">Visitors to propflowapp.com, from Google Analytics</p>
      </div>
      {children}
      <nav aria-label="Period" className="inline-flex rounded-lg border bg-background p-0.5 shadow-xs">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/?range=${r}`}
            scroll={false}
            aria-current={r === days ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-sm font-medium", r === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {r} days
          </Link>
        ))}
      </nav>
      {config && (
        <a
          href={`https://analytics.google.com/analytics/web/#/p${config.propertyId}/reports/intelligenthome`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Google Analytics <Icon name="external-link-line" />
        </a>
      )}
    </div>
  )
}

const PROBLEMS = {
  signin: "Google didn't accept the service account. Check GA_CLIENT_EMAIL and GA_PRIVATE_KEY match the JSON key file.",
  api: "The Google Analytics Data API isn't switched on. In Google Cloud, open APIs & Services → Library → Google Analytics Data API → Enable.",
  access: "The service account can't read this property. In Google Analytics, open Admin → Property access management and add the service account's email as Viewer. Also check GA_PROPERTY_ID.",
  quota: "Google's daily limit for reports was reached. The numbers come back tomorrow.",
  other: "Google Analytics couldn't be reached just now. Try again in a few minutes.",
}

function Problem({ icon = "error-warning-line", title, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-background p-5 shadow-xs">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-lg text-amber-600 dark:text-amber-400">
        <Icon name={icon} />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

export async function WebsiteAnalytics({ days }) {
  const result = await getWebsiteAnalytics(days)

  if (!result.ok && result.setup)
    return (
      <section className="space-y-4">
        <Header days={days} />
        <Problem icon="line-chart-line" title="Connect Google Analytics to see website visitors here">
          Add <code className="text-foreground">GA_PROPERTY_ID</code>, <code className="text-foreground">GA_CLIENT_EMAIL</code> and <code className="text-foreground">GA_PRIVATE_KEY</code> to the server&apos;s
          environment: the property&apos;s number, and the service account&apos;s email and private key from its JSON key file. Give that email Viewer access in Google Analytics.
        </Problem>
      </section>
    )
  if (!result.ok)
    return (
      <section className="space-y-4">
        <Header days={days} />
        <Problem title="Website numbers aren't available">
          {PROBLEMS[result.error] ?? PROBLEMS.other}
          {result.message && <span className="mt-1 block text-xs opacity-80">Google said: {result.message}</span>}
        </Problem>
      </section>
    )

  const d = result.data
  const { current: now, previous: before } = d.totals
  return (
    <section className="space-y-4">
      <Header days={days}>
        <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm shadow-xs" title="People on the website in the last 30 minutes">
          <span className={cn("size-2 rounded-full", d.activeNow ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40")} />
          <span className="font-semibold tabular-nums">{number(d.activeNow)}</span> right now
        </span>
      </Header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon="group-line" label="Visitors" value={number(now.activeUsers)} hint={<Change now={now.activeUsers} before={before.activeUsers} days={days} />} />
        <StatTile icon="user-add-line" tone="green" label="New visitors" value={number(now.newUsers)} hint={<Change now={now.newUsers} before={before.newUsers} days={days} />} />
        <StatTile icon="pages-line" tone="violet" label="Page views" value={number(now.screenPageViews)} hint={<Change now={now.screenPageViews} before={before.screenPageViews} days={days} />} />
        <StatTile icon="timer-line" tone="sky" label="Average visit" value={duration(now.averageSessionDuration)} hint={`${number(now.sessions)} visits in ${days} days`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title={`Visitors per day · ${days} days`} className="xl:col-span-2" action={<span className="text-xs text-muted-foreground">Updated {timeAgo(new Date(d.updatedAt))}</span>}>
          <div className="p-4 pt-2">
            <VisitorsChart data={d.daily} />
          </div>
        </SectionCard>
        <SectionCard title="Get-started funnel" bodyClassName="p-0">
          <Funnel funnel={d.funnel} requests={d.requests} />
        </SectionCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SectionCard title="Where visitors come from" bodyClassName="p-0">
          <BarList items={d.sources} />
        </SectionCard>
        <SectionCard title="Most viewed pages" bodyClassName="p-0">
          <BarList items={d.pages} />
        </SectionCard>
        <SectionCard title="Cities" bodyClassName="p-0">
          <BarList items={d.places} />
        </SectionCard>
        <SectionCard title="Devices" bodyClassName="p-0">
          <BarList items={d.devices} />
        </SectionCard>
      </div>
    </section>
  )
}

export function WebsiteAnalyticsLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading website numbers">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Website</h2>
        <p className="text-sm text-muted-foreground">Loading visitors from Google Analytics…</p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </section>
  )
}
