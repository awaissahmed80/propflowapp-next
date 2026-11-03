import { Skeleton } from "@/components/ui/skeleton"

// Shown the moment someone opens a page (app loading.js), while the server works out its data.
// Shaped like a module page: title row, toolbar, then a table.
export function PageSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="ml-auto h-9 w-28" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t px-4 py-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6 max-sm:hidden" />
            <Skeleton className="h-4 w-1/5 max-md:hidden" />
            <Skeleton className="ml-auto h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
