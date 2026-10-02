"use client"

import Link from "next/link"
import { useTransition } from "react"
import { signOut } from "@/server/auth/actions"
import { useSitePath } from "@/hooks/use-site-path"
import { BrandIcon, Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger, isActivePath } from "@/components/ui/sidebar"

const CONSOLE_NAV = [
  { items: [{ area: "overview", label: "Overview", icon: "dashboard-line", to: "/", end: true }] },
  {
    label: "Inbox",
    items: [
      { area: "enquiries", label: "Sales Enquiries", icon: "customer-service-2-line", to: "/enquiries" },
      { area: "requests", label: "Workspace Requests", icon: "question-answer-line", to: "/requests" },
    ],
  },
  {
    label: "Customers",
    items: [
      { area: "workspaces", label: "Workspaces", icon: "building-4-line", to: "/workspaces" },
      { area: "billing", label: "Billing", icon: "bank-card-line", to: "/billing" },
      { area: "billing", label: "Payment Methods", icon: "secure-payment-line", to: "/payment-methods" },
    ],
  },
  { label: "Product", items: [{ area: "plans", label: "Plans & Pricing", icon: "vip-crown-line", to: "/plans" }] },
  {
    label: "Platform",
    items: [
      { area: "team", label: "Team", icon: "shield-user-line", to: "/team" },
      { area: "audit", label: "Audit Log", icon: "history-line", to: "/audit" },
      { area: "settings", label: "Emails", icon: "mail-settings-line", to: "/emails" },
      { area: "settings", label: "Settings", icon: "settings-3-line", to: "/settings" },
    ],
  },
]

function UserMenu({ user, roleLabel }) {
  const [pending, startTransition] = useTransition()
  return (
    <DropdownMenu
      align="end"
      header={
        <div className="flex items-center gap-2">
          <Avatar name={user.name} source={user.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      }
      items={[
        {
          label: pending ? "Signing out…" : "Sign out",
          icon: "logout-box-r-line",
          variant: "destructive",
          onClick: () => startTransition(() => signOut()),
        },
      ]}
      trigger={
        <button type="button" aria-label="Account menu" className="flex items-center gap-2 rounded-lg p-0.5 pr-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar name={user.name} source={user.avatarUrl} size="sm" />
          <span className="hidden text-left sm:block">
            <span className="block text-sm leading-tight font-medium">{user.name}</span>
            <span className="block text-xs leading-tight text-muted-foreground">{roleLabel}</span>
          </span>
        </button>
      }
    />
  )
}

// Console frame: sidebar with live counts, header with the page title and account menu
// areas: the sections this person's role can see (roles.js)
export function ConsoleShell({ user, roleLabel, areas, counts, maintenance, canChangeSettings, defaultOpen, children }) {
  const pathname = useSitePath()
  const groups = CONSOLE_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => areas.includes(i.area)).map((i) => ({ ...i, badge: counts[i.to] ?? null })),
  })).filter((g) => g.items.length)
  const page = CONSOLE_NAV.flatMap((g) => g.items)
    .filter((i) => isActivePath(pathname, i.to, i.end))
    .sort((a, b) => b.to.length - a.to.length)[0]

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar
        groups={groups}
        header={
          <Link
            href="/"
            aria-label="Console home"
            className="flex h-10 items-center gap-2 rounded-md px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <span className="group-data-[collapsible=icon]:hidden">
              <Logo className="h-8 max-w-none" />
            </span>
            <span className="hidden group-data-[collapsible=icon]:block">
              <BrandIcon className="size-9" />
            </span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase group-data-[collapsible=icon]:hidden">Console</span>
          </Link>
        }
      />
      <SidebarInset className="min-w-0 bg-muted/40">
        <header data-print="hide" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-4">
          <SidebarTrigger />
          <div className="h-5 w-px bg-border" />
          <span className="truncate text-sm font-medium">{page?.label ?? "Console"}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} roleLabel={roleLabel} />
          </div>
        </header>
        {maintenance && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 sm:px-6 dark:text-amber-200">
            <Icon name="tools-line" />
            <span className="flex-1">Maintenance mode is on. Visitors see a notice and only the PropFlow team can sign in.</span>
            {canChangeSettings && (
              <Link href="/settings" className="font-medium underline-offset-2 hover:underline">
                Go live
              </Link>
            )}
          </div>
        )}
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
