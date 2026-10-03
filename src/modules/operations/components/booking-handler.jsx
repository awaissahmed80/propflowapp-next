"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { Avatar } from "@/components/ui/avatar"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { reassignBooking } from "../server/setup-actions"

// Who's on the booking, in its header: the handler's avatar (and the seller's, when Assignment
// rules handed it on), with a small ▾ to give it to someone else (sales.reassign).
export function BookingHandler({ booking: b, canReassign }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const agent = b.agent
  const give = (a) =>
    startTransition(async () => {
      const r = await toastAction(() => reassignBooking(b.code, a.id), { loading: `Giving it to ${a.name}…`, success: `${b.code} is with ${a.name} now.` })
      if (!r?.error) router.refresh()
    })

  return (
    <span className="ml-1 flex items-center">
      <span className="flex items-center -space-x-1.5">
        {agent ? (
          <Tooltip content={`${agent.name} handles this booking`}>
            <span className="rounded-full ring-2 ring-background">
              <Avatar name={agent.name} source={agent.avatarUrl} size="sm" />
            </span>
          </Tooltip>
        ) : (
          <Tooltip content="Nobody handles it yet">
            <span className="flex size-7 items-center justify-center rounded-full border border-dashed bg-background text-muted-foreground">
              <Icon name="user-line" className="text-sm" />
            </span>
          </Tooltip>
        )}
        {b.soldBy && (
          <Tooltip content={`Sold by ${b.soldBy.name}`}>
            <span className="rounded-full opacity-80 ring-2 ring-background">
              <Avatar name={b.soldBy.name} source={b.soldBy.avatarUrl} size="xs" />
            </span>
          </Tooltip>
        )}
      </span>
      {canReassign && b.agents.length > 0 && (
        <DropdownMenu
          align="start"
          className="max-h-80 w-64"
          items={[
            { type: "label", label: "Give this booking to" },
            ...b.agents.map((a) => ({
              key: String(a.id),
              label: a.team ? `${a.name} · ${a.team}` : a.name,
              icon: <Avatar name={a.name} source={a.avatarUrl} size="sm" />,
              selected: a.id === agent?.id,
              disabled: pending,
              onClick: () => a.id !== agent?.id && give(a),
            })),
          ]}
          trigger={
            <button
              type="button"
              aria-label="Change who handles it"
              className="ml-0.5 flex h-6 w-3.5 cursor-pointer items-center justify-center rounded text-xs text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
            >
              <Icon name="arrow-down-s-line" />
            </button>
          }
        />
      )}
    </span>
  )
}
