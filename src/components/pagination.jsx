"use client"

import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"

const PAGE_SIZES = [10, 25, 50, 100]
export const DEFAULT_PAGE_SIZE = 25

// Footer for client-side paginated tables
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Rows per page</span>
        <Select
          size="sm"
          triggerClassName="w-20"
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            leftIcon="arrow-left-s-line"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          />
          <Button
            variant="outline"
            size="icon"
            leftIcon="arrow-right-s-line"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          />
        </div>
      </div>
    </div>
  )
}
