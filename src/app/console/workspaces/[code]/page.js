import Link from "next/link"
import { notFound } from "next/navigation"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { methodLabel } from "@/components/billing/methods"
import { requireArea } from "@/modules/console/server/access"
import { can, canImpersonate, canView } from "@/modules/console/roles"
import { SignInAs } from "@/modules/console/components/sign-in-as"
import { WorkspaceIntegrations } from "@/modules/console/components/integrations-admin"
import { workspaceIntegrationsAdmin } from "@/modules/console/server/integrations"
import { IMPERSONATION_MINUTES } from "@/server/auth/session"
import { getSetting, getWorkspace, listPlans } from "@/modules/console/server/queries"
import { WorkspaceActions } from "@/modules/console/components/workspace-actions"
import { NewInvoiceButton } from "@/modules/console/components/invoice-dialog"
import { InvoicesTable } from "@/modules/console/components/invoices-table"
import { AUDIT_ACTIONS } from "@/modules/console/statuses"
import { AppIcon } from "@/components/app-icon"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { TenantMark } from "@/components/tenant-mark"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { AccountStatus } from "@/modules/console/components/parts"
import { withoutText } from "@/modules/portal/features"
import { fromUrlCode, urlCode } from "@/lib/url"

export async function generateMetadata({ params }) {
  const code = fromUrlCode((await params).code)
  return { title: code }
}

function Usage({ label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{used ?? "—"}</span> {limit ? `of ${limit}` : "· unlimited"}
        </span>
      </div>
      {limit && used != null ? (
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className={pct >= 100 ? "block h-full bg-red-500" : pct >= 85 ? "block h-full bg-amber-500" : "block h-full bg-primary"} style={{ width: `${pct}%` }} />
        </span>
      ) : null}
    </div>
  )
}

// One workspace: subscription, apps, owner, usage, invoices, integrations, members and console activity, with
// actions for owner/admin (apps, details, suspend, retry setup) and billing roles (dates, plan).
// Still to come: confirm payment. Owner, admin and support staff can sign in as an active member.
export default async function WorkspaceDetailPage({ params }) {
  const code = fromUrlCode((await params).code)
  const staff = await requireArea("workspaces", `/workspaces/${urlCode(code)}`)
  const money = canView(staff.role, "billing")
  const [t, { plans, apps }, yearlyMonths, taxRate] = await Promise.all([getWorkspace(code), listPlans(), getSetting("yearly_months_charged", 10), getSetting("sales_tax_rate", 0)])
  if (!t) notFound()
  const integrations = await workspaceIntegrationsAdmin(t.id)
  const allowed = { workspaces: can(staff.role, "workspaces"), billing: can(staff.role, "billing") }
  // Sign in as a member: owner, admin and support staff, while the workspace is open
  const impersonate = canImpersonate(staff.role) && ["trial", "active", "past_due"].includes(t.status)

  const trial = t.status === "trial"
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/workspaces" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Workspaces
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <TenantMark tenant={t} className="size-14 rounded-2xl text-lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.name}</h1>
                <AccountStatus status={t.status} trialDaysLeft={t.trialDaysLeft} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.planName} plan · {t.city ?? "—"} · {t.code} · joined {formatDate(t.createdAt)}
              </p>
            </div>
          </div>
          {(allowed.workspaces || allowed.billing) && (
            <WorkspaceActions
              t={{
                id: t.id,
                name: t.name,
                slug: t.slug,
                city: t.city,
                phone: t.phone,
                email: t.email,
                ntn: t.ntn,
                status: t.status,
                planId: t.planId,
                planName: t.planName,
                billingCycle: t.billingCycle,
                trialEndsAt: t.trialEndsAt,
                currentPeriodEndsAt: t.currentPeriodEndsAt,
                apps: t.apps.map((a) => ({ code: a.code, off: a.off })),
              }}
              apps={apps}
              planApps={plans.find((p) => p.id === t.planId)?.apps ?? []}
              plans={plans.filter((p) => p.isActive || p.id === t.planId).map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))}
              yearlyMonths={yearlyMonths}
              can={allowed}
            />
          )}
        </div>
        {t.status === "provisioning" && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <Icon name="error-warning-line" className="mt-0.5" />
            <span>{t.provisioningError ? <>Setup didn&apos;t finish: {t.provisioningError}. Fix the cause, then use Retry setup.</> : "This workspace is still being set up."}</span>
          </p>
        )}
        {t.status === "suspended" && (
          <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
            <Icon name="pause-circle-line" /> Suspended: {t.suspendedReason ?? "no reason given"}. Users see a suspension notice instead of the portal.
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Subscription" className="xl:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              ["Plan", `${t.planName} · ${t.billingCycle}`],
              money && ["Monthly revenue", t.mrr ? formatPkr(t.mrr) : "—"],
              money && ["Pays with", t.invoices.find((i) => i.payment)?.payment ? methodLabel(t.invoices.find((i) => i.payment).payment.method) : "Not yet"],
              [trial ? "Trial ends" : "Renews", formatDate(trial ? t.trialEndsAt : t.currentPeriodEndsAt) || "—"],
              ["Workspace address", t.slug],
              ["Database", t.dbName],
            ]
              .filter(Boolean)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{v}</dd>
                </div>
              ))}
          </dl>
          <div className="mt-6 border-t pt-5">
            <p className="mb-3 text-sm font-medium">Apps</p>
            {t.apps.length ? (
              <ul className="flex flex-wrap gap-2">
                {t.apps.map((a) => (
                  <li key={a.code} className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm">
                    <AppIcon icon={a.icon} color={a.color} size="sm" className="size-6 rounded-md text-sm" /> {a.name}
                    {a.off?.length > 0 && <span className="text-xs text-muted-foreground">{withoutText(a.code, a.off)}</span>}
                    {a.extra && <Badge color="violet">Extra</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No apps switched on.</p>
            )}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Owner">
            <div className="divide-y">
              <DetailRow icon="user-3-line" label="Name">
                {t.owner?.name ?? "—"}
              </DetailRow>
              <DetailRow icon="mail-line" label="Email">
                {t.owner?.email ?? t.email ?? "—"}
              </DetailRow>
              <DetailRow icon="phone-line" label="Phone">
                {t.owner?.phone ?? t.phone ?? "—"}
              </DetailRow>
            </div>
          </SectionCard>
          <SectionCard title="Usage" bodyClassName="space-y-4">
            <Usage label="Users" used={t.users} limit={t.maxUsers} />
            <Usage label="Projects" used={null} limit={t.maxProjects} />
          </SectionCard>
        </div>
      </div>

      {money && (
        <SectionCard
          title={`Invoices · ${t.invoices.length}`}
          bodyClassName="p-0"
          action={allowed.billing && t.status !== "provisioning" && <NewInvoiceButton workspace={{ id: t.id, name: t.name }} taxRate={Number(taxRate)} variant="outline" />}
        >
          {t.invoices.length ? (
            <div className="h-[min(26rem,60svh)] p-3">
              <InvoicesTable rows={t.invoices} canManage={allowed.billing} taxRate={Number(taxRate)} showWorkspace={false} minWidth="44rem" />
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Integrations" bodyClassName="p-0">
        <WorkspaceIntegrations tenantId={t.id} rows={integrations} editable={allowed.workspaces} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title={`Members · ${t.members.length}`} bodyClassName="p-0">
          {t.members.length ? (
            <ul className="divide-y">
              {t.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={m.name} source={m.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                  </span>
                  {m.role && (
                    <Badge color="gray" className="shrink-0">
                      {m.role}
                    </Badge>
                  )}
                  {m.membershipStatus !== "active" && <Badge color="gray">{m.membershipStatus}</Badge>}
                  {impersonate && m.membershipStatus === "active" && m.status === "active" && m.id !== staff.user.id && (
                    <SignInAs tenantCode={t.code} tenantName={t.name} member={{ id: m.id, name: m.name, email: m.email }} minutes={IMPERSONATION_MINUTES} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No members yet.</p>
          )}
        </SectionCard>
        <SectionCard title="Console activity" bodyClassName="p-0">
          {t.activity.length ? (
            <ul className="divide-y">
              {t.activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{AUDIT_ACTIONS[a.action] ?? a.action}</span>
                  {a.details?.summary && <span className="text-muted-foreground"> · {a.details.summary}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {a.actor} · {timeAgo(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No console changes yet.</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
