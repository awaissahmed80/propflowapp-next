"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { isInteractiveClick } from "@/lib/interaction"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/pagination"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { BaseCheckbox } from "@/components/ui/checkbox"

function SelectAll({ rows, rowKey, selectedIds, onChange }) {
  const keys = rows.map(rowKey)
  const count = keys.filter((k) => selectedIds.has(k)).length
  const all = keys.length > 0 && count === keys.length
  return (
    <BaseCheckbox
      aria-label={all ? "Clear selection" : `Select all ${keys.length} rows`}
      checked={all}
      indeterminate={count > 0 && !all}
      onCheckedChange={() => {
        const next = new Set(selectedIds)
        if (all) keys.forEach((k) => next.delete(k))
        else keys.forEach((k) => next.add(k))
        onChange(next)
      }}
    />
  )
}

// A column's alignment: align: "right" | "center", or read from its cell classes (text-right…),
// so the header always lines up with the values under it
function alignOf(column) {
  if (column.align) return column.align
  if (/(^|\s)text-right(\s|$)/.test(column.className ?? "")) return "right"
  if (/(^|\s)text-center(\s|$)/.test(column.className ?? "")) return "center"
  return "left"
}
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" }

function SortHeader({ column, sort, onSort }) {
  const active = sort?.key === column.key
  const align = alignOf(column)
  const right = align === "right"
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2.5 font-medium", ALIGN[align], column.headerClassName)}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn("inline-flex cursor-pointer items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground", right && "flex-row-reverse")}
      >
        {column.header}
        <Icon name={active ? (sort.dir === "asc" ? "arrow-up-line" : "arrow-down-line") : "arrow-up-down-line"} className={cn("text-sm", !active && "opacity-40")} />
      </button>
    </th>
  )
}

// Plain HTML table that fills its parent: sticky header, client-side sort + pagination pinned at the bottom.
// columns: [{ key, header, cell: (row) => node, sortValue?: (row) => comparable, align?, className?, headerClassName? }]
// The first column gets the primary hover accent; row clicks ignore links, buttons and menus.
// Selection (optional): pass selectedIds (Set) + onSelectionChange(Set). The header box
// selects every row that passes the current filters, not just the visible page.
export function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  onRowClick,
  defaultSort,
  minWidth = "60rem",
  empty,
  selectedIds,
  onSelectionChange,
  activeKey, // the row shown in a side panel, highlighted
}) {
  const selectable = Boolean(onSelectionChange)
  const [sort, setSort] = useState(defaultSort ?? null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort?.key)
    if (!column?.sortValue) return rows
    const dir = sort.dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = column.sortValue(a)
      const y = column.sortValue(b)
      return x > y ? dir : x < y ? -dir : 0
    })
  }, [rows, columns, sort])

  // Keep the page in range when filters shrink the list
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages)
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize)

  const onSort = (key) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
      {/* Scrolls both ways; sticky thead pins to the top of the scroll viewport */}
      <ScrollView orientation="both" className="min-h-0 flex-1">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <SelectAll rows={rows} rowKey={rowKey} selectedIds={selectedIds} onChange={onSelectionChange} />
                </th>
              )}
              {columns.map((column) =>
                column.sortValue ? (
                  <SortHeader key={column.key} column={column} sort={sort} onSort={onSort} />
                ) : (
                  <th key={column.key} scope="col" className={cn("px-3 py-2.5 font-medium", ALIGN[alignOf(column)], column.headerClassName)}>
                    {column.header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-16 text-center">
                  {empty ?? (
                    <>
                      <Icon name="search-eye-line" className="text-3xl text-muted-foreground" />
                      <p className="mt-2 font-medium">Nothing matches your filters</p>
                      <p className="mt-1 text-sm text-muted-foreground">Try clearing a filter or searching for something else.</p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? (e) => !isInteractiveClick(e) && onRowClick(row) : undefined}
                  aria-selected={selectable ? selectedIds.has(rowKey(row)) : undefined}
                  aria-current={activeKey != null && rowKey(row) === activeKey ? "true" : undefined}
                  className={cn(
                    "group transition-colors duration-150 hover:bg-muted/50 aria-selected:bg-primary/5 aria-[current=true]:bg-primary/10 aria-[current=true]:hover:bg-primary/10",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {selectable && (
                    // The whole cell toggles the tick, never opens the row
                    <td
                      data-no-row-click
                      className="w-10 cursor-default px-3 py-2.5"
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return
                        const next = new Set(selectedIds)
                        if (next.has(rowKey(row))) next.delete(rowKey(row))
                        else next.add(rowKey(row))
                        onSelectionChange(next)
                      }}
                    >
                      <BaseCheckbox
                        aria-label="Select row"
                        checked={selectedIds.has(rowKey(row))}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds)
                          if (checked) next.add(rowKey(row))
                          else next.delete(rowKey(row))
                          onSelectionChange(next)
                        }}
                      />
                    </td>
                  )}
                  {columns.map((column, i) => (
                    <td key={column.key} className={cn("px-3 py-2.5", ALIGN[alignOf(column)], i === 0 && "transition-shadow duration-150 group-hover:shadow-[inset_2px_0_0_var(--primary)]", column.className)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollView>
      <div className="shrink-0 border-t bg-background">
        <Pagination
          page={current}
          pageSize={pageSize}
          total={sorted.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>
    </div>
  )
}
