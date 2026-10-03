"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { labelOf } from "@/modules/lookups/options"
import { LinkSentDialog } from "@/components/link-sent-dialog"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { resendInvitation, revokeInvitation } from "../server/members"
import { InviteButton } from "./invite-dialog"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { TeamChip } from "./user-parts"

const DAY = 86_400_000

// Invitations waiting to be accepted: resend (a fresh link and 7 more days) or cancel
export function InvitationsView({ invites, lists, options, allowed, workspaceName }) {
  const router = useRouter()
  const [sent, setSent] = useState(null) // { result, email } after a resend
  const [pending, startTransition] = useTransition()
  const [now] = useState(() => Date.now())

  // success: the toast once done (none for a resend: the link dialog shows what was sent)
  const act = (fn, success, invite, loading = "Working on it…") =>
    startTransition(async () => {
      const result = await toastAction(fn, { loading, success: success ?? undefined })
      if (!result?.error) {
        if (result?.link) setSent({ result, email: invite.email })
        router.refresh()
      }
    })

  const columns = [
    {
      key: "name",
      header: "Invited",
      sortValue: (i) => i.name.toLowerCase(),
      cell: (i) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{i.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{i.email}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (i) => i.role,
      cell: (i) => (
        <div>
          <span className="block">{i.role}</span>
          <span className="block text-xs text-muted-foreground">{labelOf(lists.designation, i.designation) ?? ""}</span>
        </div>
      ),
    },
    { key: "team", header: "Team", sortValue: (i) => i.team?.name ?? "", cell: (i) => <TeamChip team={i.team} /> },
    { key: "by", header: "Invited by", sortValue: (i) => i.invitedBy, cell: (i) => i.invitedBy },
    {
      key: "sent",
      header: "Sent",
      className: "whitespace-nowrap",
      sortValue: (i) => new Date(i.sentAt).getTime(),
      cell: (i) => (
        <div>
          <span className="block">{timeAgo(i.sentAt)}</span>
          {i.expired ? (
            <Badge color="red">Expired</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              Expires in {Math.max(1, Math.ceil((new Date(i.expiresAt).getTime() - now) / DAY))} {Math.ceil((new Date(i.expiresAt).getTime() - now) / DAY) > 1 ? "days" : "day"}
            </span>
          )}
        </div>
      ),
    },
    ...(allowed.invite
      ? [
          {
            key: "actions",
            header: "",
            align: "right",
            cell: (i) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="outline" leftIcon="mail-send-line" disabled={pending} onClick={() => act(() => resendInvitation(i.id), null, i, "Sending…")}>
                  Resend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon="link"
                  disabled={pending}
                  title="Makes a new link to copy and share (e.g. on WhatsApp), without emailing it"
                  onClick={() => act(() => resendInvitation(i.id, { send: false }), null, i, "Making a new link…")}
                >
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon="close-line"
                  className="text-destructive"
                  disabled={pending}
                  onClick={async () =>
                    (await confirm({
                      title: `Cancel the invitation to ${i.name}?`,
                      description: "The link in their email stops working. You can invite them again later.",
                      confirmLabel: "Cancel invitation",
                      cancelLabel: "Keep it",
                      destructive: true,
                      icon: "mail-close-line",
                    })) && act(() => revokeInvitation(i.id), `Invitation to ${i.name} canceled.`, i, "Canceling…")
                  }
                >
                  Cancel
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Invitations" description={`${invites.length} pending · invitations expire after 7 days`} actions={allowed.invite && <InviteButton options={options} workspaceName={workspaceName} />} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={invites}
          minWidth="64rem"
          defaultSort={{ key: "sent", dir: "desc" }}
          empty={
            <>
              <Icon name="mail-check-line" className="text-3xl text-muted-foreground" />
              <p className="mt-2 font-medium">No pending invitations</p>
              <p className="mt-1 text-sm text-muted-foreground">Everyone you invited has joined.</p>
            </>
          }
        />
      </div>
      {sent && <LinkSentDialog result={sent.result} email={sent.email} days={7} onClose={() => setSent(null)} />}
    </div>
  )
}
