"use client"

import { useRouter } from "next/navigation"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { IconButton } from "@/components/ui/icon-button"
import { useDelete } from "./use-delete"

// ⋮ with "Delete …" for a record's page header; back: where to go once it's in the recycle bin
export function DeleteMenu({ kind, code, name, what, back }) {
  const router = useRouter()
  const { remove } = useDelete(kind)
  return (
    <DropdownMenu
      align="end"
      items={[{ label: `Delete ${what}…`, icon: "delete-bin-line", variant: "destructive", onClick: () => remove([code], { name, what, onDone: () => router.push(back) }) }]}
      trigger={<IconButton icon="more-2-line" variant="outline" aria-label="More" tooltip={false} />}
    />
  )
}
