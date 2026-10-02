"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { activeOptions, labelOf } from "@/modules/lookups/options"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { lastActive } from "../constants"
import { memberHref } from "../links"
import { InviteButton } from "./invite-dialog"
import { MemberDialog } from "./member-dialog"
import { MemberStatusBadge, Notice, RoleBadge, SeatsLine, TeamChip } from "./user-parts"

const EMPTY = { role: [], team: [], status: [], department: [] }

// Users: everyone in the workspace, searchable and filterable; a row opens the person
export function PeopleView({ members, invites, roles, lists, seats, options, allowed, profile, missing, currentUserId, viewerIsOwner, workspaceName }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState(EMPTY)
  // Fixed when the page renders, so "Online now" doesn't change while you look
  const [now] = useState(() => Date.now())

  // People waiting on an invitation are listed too, as Invited
  const rows = useMemo(
    () => [
      ...members,
      ...invites.map((i) => ({
        id: `invite-${i.id}`,
        invite: i,
        name: i.name,
        email: i.email,
        role: i.role,
        roleId: i.roleId,
        teamId: i.teamId,
        team: i.team,
        dealerId: i.dealerId,
        dealer: i.dealer,
        designation: i.designation,
        department: i.department,
        status: "invited",
        lastActiveAt: null,
      })),
    ],
    [members, invites],
  )

  const groups = useMemo(() => {
    const uniq = (key, label) => [...new Map(rows.filter((m) => m[key]).map((m) => [m[key], label(m)])).entries()].map(([value, l]) => ({ value, label: l }))
    return [
      { key: "role", label: "Role", icon: "shield-keyhole-line", options: uniq("roleId", (m) => m.role) },
      { key: "team", label: "Team", icon: "team-line", options: uniq("teamId", (m) => m.team?.name ?? "") },
      { key: "status", label: "Status", icon: "flag-line", options: activeOptions(lists["member-status"]) },
      { key: "department", label: "Department", icon: "building-4-line", options: activeOptions(lists.department) },
    ]
  }, [rows, lists])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((m) => {
      if (filters.role.length && !filters.role.includes(m.roleId)) return false
      if (filters.team.length && !filters.team.includes(m.teamId)) return false
      if (filters.status.length && !filters.status.includes(m.status)) return false
      if (filters.department.length && !filters.department.includes(m.department)) return false
      return !q || [m.name, m.email, m.phone, m.role, m.team?.name].some((v) => v?.toLowerCase().includes(q))
    })
  }, [rows, filters, search])

  const columns = [
    {
      key: "name",
      header: "Person",
      sortValue: (m) => m.name.toLowerCase(),
      cell: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.name} source={m.avatarUrl} />
          <div className="min-w-0">
            <Link href={m.invite ? "/users/invitations" : memberHref(m.code)} scroll={false} className="block truncate font-medium transition-colors group-hover:text-primary">
              {m.name}
              {m.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", sortValue: (m) => m.role, cell: (m) => <RoleBadge role={m.role} isOwner={m.isOwner} /> },
    {
      key: "team",
      header: "Team",
      sortValue: (m) => m.team?.name ?? m.dealer?.name ?? "",
      // Dealer logins belong to their firm instead of a team
      cell: (m) =>
        m.dealer ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Icon name="shake-hands-line" /> {m.dealer.name}
          </span>
        ) : (
          <TeamChip team={m.team} />
        ),
    },
    {
      key: "designation",
      header: "Designation",
      sortValue: (m) => labelOf(lists.designation, m.designation) ?? "",
      cell: (m) => (
        <div className="min-w-0">
          <span className="block truncate">{labelOf(lists.designation, m.designation) ?? "—"}</span>
          <span className="block truncate text-xs text-muted-foreground">{labelOf(lists.department, m.department) ?? ""}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", sortValue: (m) => m.status, cell: (m) => <MemberStatusBadge status={m.status} statuses={lists["member-status"]} /> },
    {
      key: "lastActive",
      header: "Last active",
      className: "whitespace-nowrap text-muted-foreground",
      sortValue: (m) => (m.lastActiveAt ? new Date(m.lastActiveAt).getTime() : 0),
      cell: (m) => (m.invite ? `Invited ${timeAgo(m.invite.sentAt)}${m.invite.expired ? " · expired" : ""}` : lastActive(m.lastActiveAt, now)),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Users"
          info={<SeatsLine count={members.length} seats={seats} />}
          toolbar={
            <>
              <div className="min-w-32 flex-1 sm:max-w-80">
                <Input type="search" placeholder="Name, email, role or team…" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            </>
          }
          actions={allowed.invite && <InviteButton options={options} workspaceName={workspaceName} />}
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
        {missing && <Notice tone="error">That person isn&apos;t in this workspace any more.</Notice>}
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={visible}
          minWidth="60rem"
          onRowClick={(m) => router.push(m.invite ? "/users/invitations" : memberHref(m.code), { scroll: false })}
          empty={
            <>
              <Icon name="user-search-line" className="text-3xl text-muted-foreground" />
              <p className="mt-2 font-medium">No one matches</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear the filters.</p>
            </>
          }
        />
      </div>
      {profile && (
        <MemberDialog
          // A fresh form for each person
          key={profile.member.code}
          profile={profile}
          roles={roles}
          options={options}
          lists={lists}
          allowed={allowed}
          currentUserId={currentUserId}
          viewerIsOwner={viewerIsOwner}
          onClose={() => router.replace("/users/people", { scroll: false })}
        />
      )}
    </div>
  )
}
