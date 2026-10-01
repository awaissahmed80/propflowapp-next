"use client"

import { useRouter } from "next/navigation"
import { CATEGORY_ORDER } from "../access"
import { AppIcon } from "@/components/app-icon"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"

// Header dropdown to jump between the apps someone can open
export function AppSwitcher({ apps, current }) {
  const router = useRouter()
  const items = [
    { label: "All apps", icon: "apps-2-line", onClick: () => router.push("/") },
    ...CATEGORY_ORDER.flatMap((category) => {
      const inCategory = apps.filter((a) => a.category === category)
      if (!inCategory.length) return []
      return [
        { type: "separator", key: `sep-${category}` },
        { type: "label", label: category },
        ...inCategory.map((app) => ({
          key: app.code,
          label: app.name,
          icon: <AppIcon icon={app.icon} color={app.color} size="sm" className="size-6 rounded-md text-sm" />,
          selected: app.code === current?.code,
          onClick: () => router.push(`/${app.code}`),
        })),
      ]
    }),
  ]

  return (
    <DropdownMenu
      align="start"
      className="max-h-[min(32rem,var(--available-height))] w-64"
      items={items}
      trigger={
        <button
          type="button"
          aria-label="Switch app"
          className="flex h-control cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
        >
          {current && <AppIcon icon={current.icon} color={current.color} size="sm" className="size-6 rounded-md text-sm" />}
          <span className="max-sm:hidden">{current?.name ?? "Apps"}</span>
          <Icon name="arrow-down-s-line" className="text-base text-muted-foreground" />
        </button>
      }
    />
  )
}
