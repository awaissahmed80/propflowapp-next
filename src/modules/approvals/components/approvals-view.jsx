"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { Notice } from "@/modules/users/components/user-parts"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { APPROVAL_STATUS, APPROVAL_TYPES } from "../types"
import { decideApproval, withdrawApproval } from "../server/actions"

const TINT = {
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
}

function ApprovalCard({ a, mode, busy, onApprove, onReject, onWithdraw }) {
  const meta = APPROVAL_TYPES[a.type] ?? { label: a.type, icon: "checkbox-circle-line", color: "gray" }
  const status = APPROVAL_STATUS[a.status]
  return (
    <li className="rounded-xl border bg-background p-4 shadow-xs">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-lg", TINT[meta.color] ?? "bg-muted text-muted-foreground")}>
          <Icon name={meta.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            {mode !== "waiting" && (
              <Badge color={status?.color} dot>
                {status?.label}
              </Badge>
            )}
            <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
          </div>
          <p className="mt-1 font-medium">{a.title}</p>
          {a.details && <p className="text-sm text-muted-foreground">{a.details}</p>}
          {a.reason && <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">“{a.reason}”</p>}
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar name={a.requester?.name ?? "?"} source={a.requester?.avatarUrl} size="sm" /> {a.requester?.name ?? "Someone"} · {timeAgo(a.requestedAt)}
            {a.decider && ` · ${status?.label.toLowerCase()} by ${a.decider.name} ${formatDate(a.decidedAt)}`}
          </p>
          {a.note && (
            <p className={cn("mt-2 rounded-lg px-3 py-2 text-sm", a.status === "rejected" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-muted/60")}>
              <span className="font-medium">{a.status === "rejected" ? "Sent back:" : "Note:"}</span> {a.note}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {a.amount != null && <span className="text-lg font-semibold tabular-nums">{formatPkr(a.amount)}</span>}
          {a.link && (
            <Link href={a.link} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
              Open <Icon name="arrow-right-s-line" />
            </Link>
          )}
        </div>
      </div>
      {mode === "waiting" && (
        <div className="mt-3 flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" disabled={busy} onClick={() => onReject(a)}>
            Send back
          </Button>
          <Button leftIcon="check-line" loading={busy} onClick={() => onApprove(a)}>
            Approve
          </Button>
        </div>
      )}
      {mode === "mine" && a.status === "pending" && (
        <div className="mt-3 flex justify-end border-t pt-3">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onWithdraw(a)}>
            Withdraw
          </Button>
        </div>
      )}
    </li>
  )
}

const EMPTY = { waiting: "Nothing waiting for you", mine: "You haven't asked for any approvals", decided: "Nothing decided yet" }

// My Desk › Requests & approvals
export function ApprovalsView({ data }) {
  const router = useRouter()
  const [view, setView] = useState(data.waiting.length || !data.mine.length ? "waiting" : "mine")
  const [busy, setBusy] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState("")
  const [msg, setMsg] = useState(null)
  const [, startTransition] = useTransition()

  const run = (a, fn, done) => {
    setBusy(a.code)
    setMsg(null)
    startTransition(async () => {
      const r = await fn()
      setBusy(null)
      if (r?.error) setMsg({ tone: "error", text: r.error })
      else {
        done?.(r)
        router.refresh()
      }
    })
  }
  const list = data[view]
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Requests & approvals"
        toolbar={
          <ToggleGroup
            value={view}
            onChange={(v) => v && setView(v)}
            options={[
              { value: "waiting", label: data.waiting.length ? `Waiting for me (${data.waiting.length})` : "Waiting for me" },
              { value: "mine", label: "My requests" },
              { value: "decided", label: "Decided" },
            ]}
          />
        }
        description="What you've asked for, and what's waiting for your sign-off."
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {list.length ? (
        <ul className="space-y-3">
          {list.map((a) => (
            <ApprovalCard
              key={a.code}
              a={a}
              mode={view}
              busy={busy === a.code}
              onApprove={(x) =>
                run(
                  x,
                  () => decideApproval(x.code, "approved"),
                  (r) => setMsg({ tone: "success", text: r.message }),
                )
              }
              onReject={(x) => {
                setNote("")
                setRejecting(x)
              }}
              onWithdraw={(x) =>
                run(
                  x,
                  () => withdrawApproval(x.code),
                  () => setMsg({ tone: "success", text: `Withdrawn: ${x.title}.` }),
                )
              }
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <Icon name="checkbox-circle-line" className="text-4xl text-emerald-500" />
          <p className="mt-2 font-medium">{EMPTY[view]}</p>
        </div>
      )}
      {rejecting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          className="sm:max-w-md"
          title="Send back"
          description={rejecting.title}
          footer={
            <>
              <Button variant="outline" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!note.trim()}
                loading={busy === rejecting.code}
                onClick={() =>
                  run(
                    rejecting,
                    () => decideApproval(rejecting.code, "rejected", note),
                    (r) => {
                      setRejecting(null)
                      setMsg({ tone: "success", text: r.message })
                    },
                  )
                }
              >
                Send back
              </Button>
            </>
          }
        >
          <Textarea label="What needs changing? (they'll see this)" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
        </Dialog>
      )}
    </div>
  )
}
