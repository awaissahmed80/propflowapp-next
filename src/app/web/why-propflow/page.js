import { connection } from "next/server"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { CONTENT as m } from "@/modules/web/content"
import { getSiteSettings } from "@/server/platform-settings"
import { Maintenance } from "@/modules/web/components/maintenance"
import { SiteShell } from "@/modules/web/site/shell"
import { JsonLd, breadcrumbs, pageMetadata } from "@/modules/web/site/seo"
import { Hero, IconCards, Section, SectionHeading } from "@/modules/web/site/sections"

export const metadata = pageMetadata({
  title: "Why PropFlow: Built for Pakistani Real Estate",
  description: "What general CRMs and spreadsheets can't do for a Pakistani developer: files and balloting, token holds, dealer quotas, installments, NDCs and the books.",
  path: "/why-propflow",
  keywords: ["best CRM for builders in Pakistan", "real estate software comparison Pakistan", "Excel vs real estate CRM"],
})

const MARK = {
  yes: { icon: "checkbox-circle-fill", tone: "text-[var(--brand)]", label: "Yes" },
  partly: { icon: "indeterminate-circle-line", tone: "text-amber-500", label: "Partly, with workarounds" },
  no: { icon: "close-circle-line", tone: "text-slate-300", label: "No" },
}
function Mark({ value }) {
  const x = MARK[value]
  return (
    <span className="inline-flex justify-center" title={x.label}>
      <Icon name={x.icon} className={cn("text-2xl", x.tone)} aria-hidden />
      <span className="sr-only">{x.label}</span>
    </span>
  )
}

export default async function WhyPage() {
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  const d = m.different

  return (
    <SiteShell site={site}>
      <JsonLd graph={[breadcrumbs([{ name: "Why PropFlow", path: "/why-propflow" }])]} />
      <Hero
        badge="Why PropFlow"
        title="Built for how property"
        accent="sells in Pakistan"
        text="Foreign CRMs track leads. PropFlow also runs the plots, files, installments, dealers and transfers that come after them, and keeps your books in step."
        source="Why PropFlow"
        secondary={{ href: "#compare", label: "See the comparison" }}
      />

      <Section id="compare" labelledBy="compare-title" className="pt-8 lg:pt-12">
        <SectionHeading center id="compare-title" eyebrow={d.eyebrow} title={d.title} />
        <div data-reveal className="pf-card mt-14 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left">
            <caption className="sr-only">PropFlow compared with general CRMs and spreadsheets</caption>
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
                <th scope="col" className="px-6 py-4 font-medium text-[var(--text-2)]">
                  What you need
                </th>
                {d.columns.map((c, i) => (
                  <th key={c} scope="col" className={cn("w-40 px-3 py-4 text-center font-bold", i === 0 && "bg-[var(--brand-soft)] text-[var(--brand)]")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {d.rows.map((r) => (
                <tr key={r.feature}>
                  <th scope="row" className="px-6 py-4 font-normal">
                    <span className="block font-semibold">{r.feature}</span>
                    <span className="block text-sm text-[var(--text-2)]">{r.detail}</span>
                  </th>
                  <td className="bg-[var(--brand-soft)]/60 px-3 text-center">
                    <Mark value="yes" />
                  </td>
                  <td className="px-3 text-center">
                    <Mark value={r.crm} />
                  </td>
                  <td className="px-3 text-center">
                    <Mark value={r.sheet} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-[var(--text-2)]">
          {Object.values(MARK).map((x) => (
            <span key={x.label} className="inline-flex items-center gap-1.5">
              <Icon name={x.icon} className={cn("text-base", x.tone)} aria-hidden /> {x.label}
            </span>
          ))}
        </p>
      </Section>

      <Section id="changes" labelledBy="changes-title" className="bg-[var(--surface)]">
        <SectionHeading center id="changes-title" eyebrow="What changes" title={m.pains.title} />
        <div className="mt-14">
          <IconCards items={m.pains.items.map((p) => ({ icon: p.icon, title: p.title, text: p.before, after: p.after }))} />
        </div>
      </Section>

      <section id="security" aria-labelledby="security-title" className="pf-navy py-24 lg:py-32">
        <div className="pf-container">
          <SectionHeading center dark id="security-title" eyebrow="Security" title="Your data stays yours" />
          <div className="mt-14">
            <IconCards dark columns={4} items={m.trust} />
          </div>
        </div>
      </section>
    </SiteShell>
  )
}
