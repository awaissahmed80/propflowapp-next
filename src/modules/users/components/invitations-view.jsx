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
import { Notice, TeamChip } from "./user-parts"

const DAY = 86_400_000

// Invitations waiting to be accepted: resend (a fresh link and 7 more days) or cancel
export function InvitationsView({ invites, lists, options, allowed, workspaceName }) {
  const router = useRouter()
  const [message, setMessage] = useState(null)
  const [sent, setSent] = useState(null) // { result, email } after a resend
  const [pending, startTransition] = useTransition()
  const [now] = useState(() => Date.now())

  const act = (fn, success, invite) =>
    startTransition(async () => {
      setMessage(null)
      const result = await fn()
      if (result?.error) setMessage({ tone: "error", text: result.error })
      else {
        if (result?.link) setSent({ result, email: invite.email })
        else setMessage({ tone: "success", text: success })
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
                <Button size="sm" variant="outline" leftIcon="mail-send-line" disabled={pending} onClick={() => act(() => resendInvitation(i.id), null, i)}>
                  Resend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon="link"
                  disabled={pending}
                  title="Makes a new link to copy and share (e.g. on WhatsApp), without emailing it"
                  onClick={() => act(() => resendInvitation(i.id, { send: false }), null, i)}
                >
                  Copy link
                </Button>
                <Button size="sm" variant="ghost" leftIcon="close-line" className="text-destructive" disabled={pending} onClick={() => act(() => revokeInvitation(i.id), `Invitation to ${i.name} cancelled.`, i)}>
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
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
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
