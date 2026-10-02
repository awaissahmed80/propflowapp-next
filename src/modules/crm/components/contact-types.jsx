"use client"

import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"

// What a contact is to the business (contact-type values from their links): Lead, Customer…
//   <ContactTypeBadges types={["lead", "customer"]} max={2} />
export function ContactTypeBadges({ types = [], max = 6 }) {
  const list = useList("contact-type")
  const shown = types.slice(0, max)
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((t) => {
        const v = list.map[t]
        return (
          <Badge key={t} color={toHex(v?.color) ?? "gray"}>
            {v?.icon && <Icon name={v.icon} />}
            {v?.label ?? t}
          </Badge>
        )
      })}
      {types.length > max && <span className="text-xs text-muted-foreground">+{types.length - max}</span>}
    </span>
  )
}
