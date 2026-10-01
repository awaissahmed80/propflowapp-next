import { readFile } from "@/server/storage"
import { getSetup } from "@/modules/portal/server/setup"
import { settingsPage } from "@/modules/settings/context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { LogoStep, ProfileStep } from "@/modules/portal/components/setup-wizard"

export const metadata = { title: "Company Profile" }

// Company details and logo used on receipts, letters and invoices
export default async function CompanyProfilePage() {
  const ctx = await settingsPage("/settings")
  const setup = await getSetup(ctx.tenant)
  const key = setup.settings.company_logo
  const logo = key ? await readFile(key).catch(() => null) : null
  const logoUrl = logo ? `data:${setup.settings.company_logo_type || "image/png"};base64,${logo.toString("base64")}` : null
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Company Profile" description={ctx.canEdit ? "Your company's details as they appear on receipts, letters and invoices." : "Only the owner or an administrator can change these details."} />
      <SectionCard title="Company details">
        <ProfileStep settings={setup.settings} disabled={!ctx.canEdit} inSettings />
      </SectionCard>
      <SectionCard title="Logo">
        <LogoStep logoUrl={logoUrl} disabled={!ctx.canEdit} inSettings />
      </SectionCard>
    </div>
  )
}
