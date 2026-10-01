import { usersPage } from "@/modules/users/server/context"
import { loadPeople } from "@/modules/users/server/load"
import { listActivity, workspaceApps } from "@/modules/users/server/queries"
import { fromUrlCode } from "@/lib/url"
import { PeopleView } from "@/modules/users/components/people-view"

export const metadata = { title: "Users" }

// Users, with a person's profile opened in a modal from ?member=mem-00001
export default async function PeoplePage({ searchParams }) {
  const ctx = await usersPage("/users/people")
  const [data, { member: memberParam }] = await Promise.all([loadPeople(ctx), searchParams])
  const member = memberParam ? data.members.find((m) => m.code === fromUrlCode(memberParam)) : null
  const profile = member ? await Promise.all([listActivity(ctx, { userId: member.id, limit: 20 }), workspaceApps(ctx)]).then(([activity, apps]) => ({ member, activity, apps: apps.filter((a) => !a.alwaysOn) })) : null
  return (
    <PeopleView
      members={data.members}
      invites={data.invites}
      roles={data.roles}
      lists={data.lists}
      seats={data.seats}
      options={data.options}
      allowed={data.allowed}
      profile={profile}
      missing={Boolean(memberParam && !member)}
      currentUserId={ctx.user.id}
      viewerIsOwner={ctx.isOwner}
      workspaceName={ctx.tenant.name}
    />
  )
}
