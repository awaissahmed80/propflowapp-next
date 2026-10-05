import { Skeleton } from "@/components/ui/skeleton"

// While a dashboard's cards are worked out (they read several apps)
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="@container">
        <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4 @6xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={`t${i}`} className="col-span-1 h-32 rounded-xl" />
          ))}
          <Skeleton className="col-span-2 h-80 rounded-xl @3xl:col-span-4" />
          <Skeleton className="col-span-2 h-80 rounded-xl" />
          <Skeleton className="col-span-2 h-72 rounded-xl" />
          <Skeleton className="col-span-2 h-72 rounded-xl" />
          <Skeleton className="col-span-2 h-72 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
