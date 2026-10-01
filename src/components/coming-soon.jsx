import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"

// A page that's planned but not built yet: what it will do, so the menu can show it already
//   <ComingSoon title="Listings" icon="home-4-line" points={["…", "…"]} />
export function ComingSoon({ title, description, icon, points = [] }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center rounded-2xl border border-dashed bg-background px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl text-primary">
          <Icon name={icon} />
        </span>
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Icon name="time-line" /> Coming soon
        </p>
        <h2 className="mt-3 text-lg font-semibold">{title} is on its way</h2>
        {points.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-left text-sm text-muted-foreground">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Icon name="check-line" className="mt-0.5 text-primary" /> {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
