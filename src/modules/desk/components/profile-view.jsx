"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatDate, tenure } from "@/lib/format"
import { labelOf } from "@/modules/lookups/options"
import { TeamChip } from "@/modules/users/components/user-parts"
import { InlinePhone } from "@/components/inline-phone"
import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"
import { updateMyPhone } from "../server/actions"
import { ScreenLockSettings } from "./screen-lock-settings"
import { PasswordSection, ProfileHeader, SessionsSection } from "./account-settings"

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

// My Desk › Profile: your details in this workspace. You change your own name, photo, mobile
// number and password, and sign out other browsers; your role, team, designation and department
// are set by an administrator. readOnly: console staff signed in as this person.
export function ProfileView({ me, user, workspace, lists, lock, account, sessions = [], readOnly = false }) {
  const router = useRouter()
  const none = <span className="font-normal text-muted-foreground">Not set</span>
  const savePhone = async (phone) => {
    const result = await updateMyPhone(phone)
    if (!result?.error) {
      toast.success("Mobile number updated.")
      router.refresh()
    }
    return result
  }
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Profile" description="Your details in this workspace. Ask an administrator to change your role, team or designation." />
      <ProfileHeader user={user} subtitle={[me?.role, workspace].filter(Boolean).join(" · ")} code={me?.code} readOnly={readOnly} />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-background p-4 shadow-xs">
          <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Account</h2>
          <div className="divide-y">
            <Row icon="mail-line" label="Email">
              {user.email}
            </Row>
            <Row icon="phone-line" label="Mobile">
              <InlinePhone value={me?.phone} editable={!readOnly} onSave={savePhone} />
            </Row>
            <Row icon="shield-user-line" label="Role">
              {me?.role ?? none}
            </Row>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">To change your email address, ask an administrator.</p>
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
      {account && (
        <div className="grid gap-6 md:grid-cols-2">
          <PasswordSection account={account} readOnly={readOnly} />
          <SessionsSection sessions={sessions} readOnly={readOnly} />
        </div>
      )}
      {/* Not while console staff are signed in as this member */}
      {lock && <ScreenLockSettings settings={lock} />}
    </div>
  )
}
