"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "@/components/theme-provider"
import { signOut } from "@/server/auth/actions"
import { Avatar } from "@/components/ui/avatar"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { TenantMark } from "@/components/tenant-mark"
import { switchWorkspace } from "../server/actions"
import { useScreenLock } from "./screen-lock/lock-provider"
import { useLockShortcut } from "./screen-lock/shortcut"

const THEMES = [
  { value: "light", label: "Light", icon: "sun-line" },
  { value: "dark", label: "Dark", icon: "moon-line" },
  { value: "system", label: "System", icon: "computer-line" },
]

// Account menu in the portal top bar: theme, My Desk, switch workspace, lock screen, sign out
// placement "sidebar": a full-width row at the bottom of an app's sidebar, opening upwards
export function UserMenu({ user, role, tenant, workspaces, canSetUp, placement = "header" }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [, startTransition] = useTransition()
  const lock = useScreenLock()
  const lockShortcut = useLockShortcut()

  const header = (
    <>
      <div className="flex items-center gap-2">
        <Avatar name={user.name} source={user.avatarUrl} size="lg" />
        <div className="min-w-0 text-sm leading-tight">
          <div className="truncate font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5">
        <TenantMark tenant={tenant} className="size-5" />
        <div className="min-w-0 text-xs leading-tight">
          <div className="truncate font-medium">{tenant.name}</div>
          <div className="truncate text-muted-foreground">{role.name}</div>
        </div>
      </div>
    </>
  )

  const items = [
    {
      label: "Theme",
      icon: THEMES.find((t) => t.value === theme)?.icon ?? "contrast-2-line",
      items: THEMES.map((t) => ({ label: t.label, icon: t.icon, selected: theme === t.value, onClick: () => setTheme(t.value) })),
    },
    { label: "My Desk", icon: "user-smile-line", onClick: () => router.push("/") },
    ...(canSetUp ? [{ label: "Workspace setup", icon: "list-check-3", onClick: () => router.push("/setup") }] : []),
    { label: "Take the tour", icon: "guide-line", onClick: () => router.push("/?tour=1") },
    ...(workspaces.length
      ? [
          {
            label: "Workspace",
            icon: "arrow-left-right-line",
            contentClassName: "w-64",
            items: [
              { type: "label", label: "Switch workspace" },
              { key: tenant.id, label: tenant.name, icon: <TenantMark tenant={tenant} className="size-5" />, selected: true },
              ...workspaces.map((w) => ({
                key: w.id,
                label: w.open ? w.name : `${w.name} (unavailable)`,
                icon: <TenantMark tenant={w} className="size-5" />,
                disabled: !w.open,
                onClick: () => startTransition(() => switchWorkspace(w.id)),
              })),
            ],
          },
        ]
      : []),
    { type: "separator" },
    ...(lock ? [{ label: "Lock screen", icon: "lock-line", shortcut: lockShortcut, onClick: lock.lockNow }] : []),
    { label: "Sign out", icon: "logout-box-r-line", variant: "destructive", onClick: () => startTransition(() => signOut()) },
  ]

  if (placement === "sidebar")
    return (
      <DropdownMenu
        side="top"
        align="start"
        className="w-(--anchor-width) min-w-64"
        header={header}
        items={items}
        trigger={
          <SidebarMenuButton size="lg" aria-label="Account menu" className="cursor-pointer data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground">
            <Avatar name={user.name} source={user.avatarUrl} />
            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{role.name}</span>
            </span>
            <Icon name="expand-up-down-line" className="ml-auto text-base text-muted-foreground" />
          </SidebarMenuButton>
        }
      />
    )

  return (
    <DropdownMenu
      className="w-64"
      header={header}
      items={items}
      trigger={
        <button
          type="button"
          data-tour="account"
          aria-label="Account menu"
          className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent sm:rounded-lg sm:pr-2"
        >
          <Avatar name={user.name} source={user.avatarUrl} />
          <span className="hidden text-left text-sm leading-tight sm:block">
            <span className="block font-medium">{user.name}</span>
            <span className="block text-xs text-muted-foreground">{role.name}</span>
          </span>
        </button>
      }
    />
  )
}
