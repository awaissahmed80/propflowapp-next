import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"

// An app's ready-made reports, grouped. reports: [{ id, group, title, description, icon }]
export function ReportIndex({ description, groups, reports, basePath }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Reports" description={description} />
      {groups.map((group) => (
        <section key={group} aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`} className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reports
              .filter((r) => r.group === group)
              .map((r) => (
                <Link
                  key={r.id}
                  href={`${basePath}/${r.id}`}
                  className="group flex items-start gap-3 rounded-xl border bg-background p-4 shadow-xs transition outline-none hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
                    <Icon name={r.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium transition-colors group-hover:text-primary">{r.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{r.description}</span>
                  </span>
                  <Icon name="arrow-right-s-line" className="mt-2 text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}
