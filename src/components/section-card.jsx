import { cn } from "@/lib/utils"

// Bordered card with a title row, used across detail pages
export function SectionCard({ title, action, children, className, bodyClassName }) {
  return (
    <section className={cn("rounded-xl border bg-background shadow-xs", className)}>
      {(title || action) && (
        <header className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}
