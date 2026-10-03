"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { siteUrl } from "@/lib/sites"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { DateTimePicker } from "@/components/ui/datetimepicker"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { saveSiteSettings } from "../server/actions"
import { toastAction } from "@/lib/toast-action"

// Times are picked in Pakistan time (UTC+5, no daylight saving), the same on the server and
// in the browser: "2026-10-02T09:30:00.000Z" ↔ "2026-10-02T14:30"
const PKT_MS = 5 * 3_600_000
const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() + PKT_MS).toISOString().slice(0, 16) : "")
const fromLocalInput = (v) => (v ? new Date(`${v}:00+05:00`).toISOString() : null)

function Card({ icon, title, description, on, children }) {
  return (
    <section className={cn("rounded-xl border bg-background shadow-xs", on && "border-primary/40")}>
      <div className="flex items-start gap-4 px-5 py-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-lg", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <Icon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export function SettingsView({ site, updatedAt, editable }) {
  const router = useRouter()
  const [form, setForm] = useState({
    maintenance: site.maintenance,
    message: site.message ?? "",
    until: toLocalInput(site.until),
    signupOpen: site.signupOpen,
    pricesVisible: site.pricesVisible,
    quoteRequests: site.quoteRequests,
    signInVisible: site.signInVisible,
    analyticsId: site.analyticsId ?? "",
    analyticsConsent: site.analyticsConsent,
  })
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }))

  const save = () =>
    startTransition(async () => {
      setErrors({})
      const result = await toastAction(
        () =>
          saveSiteSettings({
            maintenance: form.maintenance,
            message: form.message.trim() || null,
            until: fromLocalInput(form.until),
            signupOpen: form.signupOpen,
            pricesVisible: form.pricesVisible,
            quoteRequests: form.quoteRequests,
            signInVisible: form.signInVisible,
            analyticsId: form.analyticsId.trim() || null,
            analyticsConsent: form.analyticsConsent,
          }),
        { loading: "Saving…", success: form.maintenance ? "Saved. PropFlow is in maintenance mode: only the PropFlow team can sign in." : "Saved." },
      )
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (!result.error) router.refresh()
    })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Settings"
        description="Switches that affect the whole platform"
        actions={
          editable && (
            <Button leftIcon="save-line" loading={pending} onClick={save}>
              Save changes
            </Button>
          )
        }
      />

      <div className="max-w-3xl space-y-4">
        <Card
          icon={form.maintenance ? "tools-line" : "pulse-line"}
          on={form.maintenance}
          title="Site status"
          description="Maintenance mode shows visitors a notice on the website and stops workspace users from signing in. The PropFlow team can still sign in and use the console."
        >
          <div className="space-y-4 border-t px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Status</span>
                {form.maintenance ? (
                  <Badge color="amber" dot>
                    Maintenance
                  </Badge>
                ) : (
                  <Badge color="green" dot>
                    Live
                  </Badge>
                )}
              </div>
              <Switch label="Maintenance mode" checked={form.maintenance} disabled={!editable} onChange={set("maintenance")} />
            </div>
            {form.maintenance && (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <Textarea
                  label="Message for visitors"
                  rows={2}
                  placeholder="We're upgrading PropFlow and will be back shortly."
                  value={form.message}
                  disabled={!editable}
                  onChange={(e) => set("message")(e.target.value)}
                />
                <DateTimePicker
                  label="Back by, Pakistan time (optional)"
                  placeholder="No time given"
                  value={form.until}
                  minDate={toLocalInput(new Date().toISOString()).slice(0, 10)}
                  // Shown in Pakistan time, whoever is looking
                  align="end"
                  disabled={!editable}
                  onChange={set("until")}
                  error={errors.until}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Check the notice at{" "}
              <a href={siteUrl("web")} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                the website
              </a>{" "}
              after saving.
            </p>
          </div>
        </Card>

        <Card
          icon={form.signupOpen ? "door-open-line" : "mail-send-line"}
          on={form.signupOpen}
          title="Sign-up"
          description="Who can start a new workspace. With invitation only, the website's trial buttons become Talk to sales, and your team sends invites from Workspaces."
        >
          <div className="space-y-3 border-t px-5 py-4">
            <Switch
              label="Allow self sign-up"
              description={form.signupOpen ? "Anyone can create a workspace and start a trial from the website." : "By invitation only. The website shows Talk to sales instead of Start free trial."}
              checked={form.signupOpen}
              disabled={!editable}
              onChange={set("signupOpen")}
            />
            <Switch
              label="Show Sign in on the website"
              description={form.signInVisible ? "The website's header, menu and footer link to the sign-in page." : `Hidden on the website. People can still sign in at ${siteUrl("auth").replace(/^https?:\/\//, "")}.`}
              checked={form.signInVisible}
              disabled={!editable}
              onChange={set("signInVisible")}
            />
            {form.signupOpen && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <Icon name="information-line" className="mt-0.5" />
                The self sign-up form comes with the workspace signup flow. Until it&apos;s built, visitors who press Start free trial see a &quot;coming soon&quot; page, so keep this off for now.
              </p>
            )}
          </div>
        </Card>

        <Card
          icon={form.pricesVisible ? "price-tag-3-line" : "eye-off-line"}
          on={form.pricesVisible}
          title="Prices on the website"
          description="Plans always show what they include. Turn this on when you're ready to publish what they cost."
        >
          <div className="border-t px-5 py-4">
            <Switch
              label="Show prices"
              description={
                form.pricesVisible
                  ? "Monthly and yearly prices, and the extra-user price, are shown on the website."
                  : 'Plans show "Price on request" and visitors are asked to talk to sales. Prices aren\'t sent to the browser at all.'
              }
              checked={form.pricesVisible}
              disabled={!editable}
              onChange={set("pricesVisible")}
            />
            {!form.pricesVisible && (
              <div className="mt-4 border-t pt-4">
                <Switch
                  label="Get-started wizard instead of plans"
                  description={
                    form.quoteRequests
                      ? "Plans are hidden. Create workspace takes visitors to a short wizard on the page: what kind of business they are, what they'd like PropFlow to do, and where to email them. Each one lands in Sales Enquiries with the package and a suggested plan."
                      : "Plans show Price on request and the buttons say Talk to sales."
                  }
                  checked={form.quoteRequests}
                  disabled={!editable}
                  onChange={set("quoteRequests")}
                />
              </div>
            )}
          </div>
        </Card>

        <Card
          icon="line-chart-line"
          on={Boolean(form.analyticsId.trim() || site.analyticsEnvId)}
          title="Website analytics"
          description="Google Analytics 4 on the website only, never inside workspaces. Visitors' names, emails and phone numbers are never sent."
        >
          <div className="space-y-4 border-t px-5 py-4">
            <div className="max-w-sm">
              <Input label="Measurement ID" placeholder="G-XXXXXXXXXX" value={form.analyticsId} disabled={!editable} onChange={(e) => set("analyticsId")(e.target.value)} error={errors.analyticsId} />
              <p className="mt-1 text-xs text-muted-foreground">
                {site.analyticsEnvId
                  ? `Empty uses ${site.analyticsEnvId} from the server's .env (GA_MEASUREMENT_ID). An ID here takes its place.`
                  : "From Google Analytics: Admin → Data streams → your website stream. Leave empty to turn analytics off."}
              </p>
            </div>
            <Switch
              label="Ask visitors before analytics cookies"
              description={
                form.analyticsConsent
                  ? "A small banner asks each visitor. Until they accept, Google only gets cookieless counts."
                  : "Analytics starts straight away. Turn this on if you expect visitors from Europe or other places that require consent."
              }
              checked={form.analyticsConsent}
              disabled={!editable || !(form.analyticsId.trim() || site.analyticsEnvId)}
              onChange={set("analyticsConsent")}
            />
          </div>
        </Card>

        {updatedAt && <p className="text-xs text-muted-foreground">Last changed {formatDateTime(updatedAt)}. Changes are recorded in the audit log.</p>}
      </div>
    </div>
  )
}
