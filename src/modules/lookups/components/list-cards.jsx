"use client"

import { PageHeader } from "@/components/page-header"
import { ListCard } from "./list-card"

// A Customize tab made of a few lists with their own fields, one compact card each
//   lists: getListsByKey(...) · canEdit
export function ListCards({ title, description, lists, canEdit }) {
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />
      <div className="space-y-4">
        {lists.map((l) => (
          // Remount when the saved values change, so edits start from what's stored
          <ListCard key={`${l.key}:${JSON.stringify(l.values)}`} list={l} canEdit={canEdit} />
        ))}
      </div>
    </div>
  )
}
