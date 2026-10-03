import { deskContext } from "@/modules/desk/server/context"
import { listApprovals } from "@/modules/approvals/server/queries"
import { ApprovalsView } from "@/modules/approvals/components/approvals-view"
import { DeskPage } from "@/modules/desk/components/desk-page"

export const metadata = { title: "Requests & approvals" }

// What this person asked for, and what's waiting for their sign-off, from every app
export default async function ApprovalsPage() {
  const ctx = await deskContext("/approvals")
  return (
    <DeskPage>
      <ApprovalsView data={await listApprovals(ctx)} />
    </DeskPage>
  )
}
