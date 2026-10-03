import { cache } from "react"
import { notFound } from "next/navigation"
import { Icon } from "@/components/ui/icon"
import { TenantMark } from "@/components/tenant-mark"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { getLookups } from "@/modules/lookups/server"
import { activeOptions } from "@/modules/lookups/options"
import { publicForm, publicWorkspace, recordFormView } from "@/modules/campaigns/server/forms"
import { formCaptcha } from "@/modules/campaigns/server/settings"
import { PublicLeadForm } from "@/modules/campaigns/components/public-form"

export const dynamic = "force-dynamic"

// The workspace and form behind the address, once per request
const load = cache(async (workspace, code) => {
  const site = await publicWorkspace(workspace)
  if (!site) return null
  const form = await publicForm(site.db, code)
  return form ? { ...site, form } : null
})

export async function generateMetadata({ params }) {
  const { workspace, code } = await params
  const found = await load(workspace, code)
  if (!found) return { title: "Form not found" }
  return { title: `${found.form.settings.title || found.form.name} · ${found.tenant.name}`, robots: { index: false } }
}

function Closed({ name }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-6 text-center text-slate-900">
      <Icon name="pause-circle-line" className="text-4xl text-slate-400" />
      <h1 className="mt-3 text-xl font-semibold">This form is closed</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{name} isn&apos;t accepting entries right now. Please check back later.</p>
    </main>
  )
}

// campaigns.<root>/f/<workspace>/frm-0001: a lead form on its own page, or bare and see-through
// inside an iframe (?embed=1, from embed.js). utm_source on the address picks the lead's channel.
export default async function HostedFormPage({ params, searchParams }) {
  const [{ workspace, code }, query] = await Promise.all([params, searchParams])
  const found = await load(workspace, code)
  if (!found) notFound()
  const { tenant, db, form } = found
  const embed = query?.embed === "1"
  if (form.status !== "active") return <Closed name={tenant.name} />

  const [lists, brand, captcha] = await Promise.all([getLookups(db, ["city"]), embed ? null : getWorkspaceBrand(tenant), formCaptcha(db), recordFormView(db, form.id)])
  const shown = { code: form.code, name: form.name, status: form.status, fields: form.fields, settings: form.settings }
  const cities = activeOptions(lists.city)

  if (embed) return <PublicLeadForm embed workspace={tenant.slug} form={shown} cities={cities} workspaceName={tenant.name} captcha={captcha} />
  return (
    <main className="min-h-svh bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <p className="mb-4 flex items-center justify-center gap-2 font-bold">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-8 w-auto max-w-32 object-contain" />
          ) : (
            <TenantMark tenant={{ name: brand.name }} className="size-8 rounded-lg bg-slate-900 text-xs" />
          )}
          {brand.name}
        </p>
        <PublicLeadForm workspace={tenant.slug} form={shown} cities={cities} workspaceName={brand.name} captcha={captcha} />
      </div>
    </main>
  )
}
