import { Icon } from "@/components/ui/icon"

// Icon + label + value row for information panels on detail pages
export function DetailRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
      <Icon name={icon} className="mt-0.5 text-base text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-sm break-words">{children}</div>
      </div>
    </div>
  )
}
