import Link from "next/link"
import { requireArea } from "@/modules/console/server/access"
import { renderEmail, templateNames } from "@/server/mail/render"
import { EMAIL_SAMPLES } from "@/server/mail/samples"
import { can } from "@/modules/console/roles"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"
import { EmailPreview } from "@/modules/console/components/email-preview"

export const metadata = { title: "Emails" }

// Every email PropFlow sends, rendered with example data from src/server/mail/samples.js.
// Templates live in src/server/mail/templates/*.liquid.
export default async function EmailsPage({ searchParams }) {
  const staff = await requireArea("settings", "/emails")
  const names = templateNames()
  const { t } = await searchParams
  const current = names.includes(t) ? t : names[0]
  let rendered = null
  let error = null
  try {
    // The preview shows the logo from the website; real emails carry it inside the message
    rendered = await renderEmail(current, EMAIL_SAMPLES[current]?.data ?? {}, { logoSrc: "/images/email/propflow-logo.png" })
  } catch (err) {
    error = err.message
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Emails" description="Every email PropFlow sends, with example data. Edit the templates in src/server/mail/templates." />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label="Emails" className="h-fit rounded-xl border bg-background p-1.5 shadow-xs">
          <ul className="space-y-0.5">
            {names.map((name) => (
              <li key={name}>
                <Link
                  href={`/emails?t=${name}`}
                  aria-current={name === current ? "page" : undefined}
                  className={cn("block rounded-lg px-3 py-2 hover:bg-muted/60", name === current && "bg-accent text-accent-foreground hover:bg-accent")}
                >
                  <span className="block text-sm font-medium">{EMAIL_SAMPLES[name]?.title ?? name}</span>
                  <span className="block text-xs text-muted-foreground">{EMAIL_SAMPLES[name]?.when ?? `${name}.liquid`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {error ? (
          <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-300">
            <Icon name="error-warning-line" className="mt-0.5" /> {current}.liquid couldn&apos;t be rendered: {error}
          </p>
        ) : (
          <EmailPreview key={current} name={current} email={rendered} canSend={can(staff.role, "settings")} myEmail={staff.user.email} />
        )}
      </div>
    </div>
  )
}
