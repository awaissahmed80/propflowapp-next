"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatDate, tenure } from "@/lib/format"
import { labelOf } from "@/modules/lookups/options"
import { TeamChip, Notice } from "@/modules/users/components/user-parts"
import { InlinePhone } from "@/components/inline-phone"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { updateMyPhone } from "../server/actions"

function Row({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium whitespace-nowrap">{children}</div>
      </div>
    </div>
  )
}

// My Desk › Profile: your details in this workspace. You can change your own mobile number;
// your role, team, designation and department are set by an administrator.
export function ProfileView({ me, user, workspace, lists }) {
  const router = useRouter()
  const [message, setMessage] = useState(null)
  const none = <span className="font-normal text-muted-foreground">Not set</span>
  const savePhone = async (phone) => {
    setMessage(null)
    const result = await updateMyPhone(phone)
    if (!result?.error) {
      setMessage("Mobile number updated.")
      router.refresh()
    }
    return result
  }
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Profile" description="Your details in this workspace. Ask an administrator to change your role, team or designation." />
      {message && <Notice>{message}</Notice>}
      <div className="flex items-center gap-4 rounded-xl border bg-background p-5 shadow-xs">
        <Avatar name={user.name} source={user.avatarUrl} size="xl" />
        <div className="min-w-0">
          <p className="text-xl font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">
            {[me?.role, workspace].filter(Boolean).join(" · ")}
            {me?.code && <span className="ml-2 font-mono text-xs">{me.code}</span>}
          </p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-background p-4 shadow-xs">
          <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Account</h2>
          <div className="divide-y">
            <Row icon="mail-line" label="Email">
              {user.email}
            </Row>
            <Row icon="phone-line" label="Mobile">
              <InlinePhone value={me?.phone} editable onSave={savePhone} />
            </Row>
            <Row icon="shield-user-line" label="Role">
              {me?.role ?? none}
            </Row>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Change your password or theme from the menu under your name.</p>
        </section>
        <section className="rounded-xl border bg-background p-4 shadow-xs">
          <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Work</h2>
          <div className="divide-y">
            {me?.dealer ? (
              <Row icon="shake-hands-line" label="Dealer">
                {me.dealer.name}
              </Row>
            ) : (
              <Row icon="team-line" label="Team">
                {me?.team ? <TeamChip team={me.team} /> : none}
              </Row>
            )}
            <Row icon="briefcase-4-line" label="Designation">
              {labelOf(lists.designation, me?.designation) ?? none}
            </Row>
            <Row icon="building-4-line" label="Department">
              {labelOf(lists.department, me?.department) ?? none}
            </Row>
            <Row icon="calendar-check-line" label="Joined">
              {me?.joinedAt ? `${formatDate(me.joinedAt)} · ${tenure(me.joinedAt)}` : none}
            </Row>
          </div>
        </section>
      </div>
    </div>
  )
}
