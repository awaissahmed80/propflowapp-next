import { connection } from "next/server"
import { getSiteSettings } from "@/server/platform-settings"
import { Maintenance } from "@/modules/web/components/maintenance"
import { SiteShell } from "@/modules/web/site/shell"
import { DemoForm } from "@/modules/web/site/demo"
import { JsonLd, breadcrumbs, pageMetadata } from "@/modules/web/site/seo"
import { Faq } from "@/modules/web/site/sections"

export const metadata = pageMetadata({
  title: "Book a Free Demo",
  description: "See PropFlow with projects like yours: a free 30-minute walk-through of plots and files, bookings, installments, transfers and the books.",
  path: "/book-a-demo",
  keywords: ["real estate CRM demo", "housing society software demo", "PropFlow demo"],
})

const STEPS = [
  { title: "We call you", text: "Someone from our team rings at the time you picked to understand your projects and set a time." },
  { title: "A 30-minute walk-through", text: "On a video call: your kind of project, from enquiry to possession, in a demo workspace." },
  { title: "A workspace with your data", text: "If it fits, we set up a trial workspace and load your projects, units and leads from your spreadsheets." },
]

const FAQ = [
  { q: "Is the demo free?", a: "Yes, and there's no obligation. It's the quickest way to see whether PropFlow fits how you work." },
  { q: "Who should join?", a: "Whoever runs sales and whoever runs collections or accounts. Most questions come from those two desks." },
  { q: "Can you show our own project?", a: "Tell us about it on the call and we'll set the demo up with a project like it: plots or apartments, files or balloted plots, your payment plans." },
]

export default async function BookDemoPage() {
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  return (
    <SiteShell site={site} closing={false}>
      <JsonLd graph={[breadcrumbs([{ name: "Book a demo", path: "/book-a-demo" }])]} />
      <section className="pf-hero-bg relative overflow-hidden pt-32 pb-24 lg:pt-40">
        <div aria-hidden className="pf-grid-lines absolute inset-0" />
        <div className="pf-container relative grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
          <div>
            <p className="pf-rise pf-eyebrow">Free · about 30 minutes</p>
            <h1 className="pf-slide mt-4 text-[clamp(2.4rem,1.3rem+4vw,4.25rem)] leading-[1.05] font-extrabold tracking-[-0.035em]" style={{ "--delay": "80ms" }}>
              See PropFlow on a <span className="bg-gradient-to-r from-[#1528a0] to-[#3d63e8] bg-clip-text text-transparent">project like yours</span>
            </h1>
            <p className="pf-slide mt-6 max-w-xl text-lg text-[var(--text-2)]" style={{ "--delay": "160ms" }}>
              Leave your number and we’ll call to set a time. We’ll walk you through plots and files, bookings, installments, transfers and the books, set up around how you sell.
            </p>
            <ol className="mt-10 space-y-6">
              {STEPS.map((x, i) => (
                <li key={x.title} data-reveal style={{ "--delay": `${i * 90}ms` }} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] font-bold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-bold">{x.title}</span>
                    <span className="block text-[var(--text-2)]">{x.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="pf-rise pf-card p-6 shadow-[0_30px_80px_-30px_rgb(11_18_64/0.35)] sm:p-8" style={{ "--delay": "240ms" }}>
            <p className="text-xl font-bold">Book your free demo</p>
            <p className="mt-1 mb-6 text-sm text-[var(--text-2)]">We only use your number to arrange the demo.</p>
            <DemoForm source="Book a demo page" />
          </div>
        </div>
      </section>
      <Faq title="About the demo" faq={FAQ} />
    </SiteShell>
  )
}
