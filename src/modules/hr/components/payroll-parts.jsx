"use client"

import { Badge } from "@/components/ui/badge"
import { RUN_STATUS } from "../constants"

// A run's status; an approved run whose payment waits in Approvals shows that instead
export function RunStatusBadge({ status, pending = false }) {
  const s = pending && status === "approved" ? RUN_STATUS.pending : (RUN_STATUS[status] ?? { label: status, color: "gray" })
  return <Badge color={s.color}>{s.label}</Badge>
}

// This month in Pakistan time: "2026-10"
export const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()).slice(0, 7)
