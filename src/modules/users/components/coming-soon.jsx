import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"

// A Users & Teams page that arrives with another app
export function ComingSoon({ title, description, icon, text }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />
      <div className="rounded-2xl border border-dashed bg-background p-10 text-center">
        <Icon name={icon} className="text-3xl text-muted-foreground" />
        <p className="mt-2 font-medium">Coming soon</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}
