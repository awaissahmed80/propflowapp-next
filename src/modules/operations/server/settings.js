import "server-only"
import { can, isFullAccess } from "@/modules/users/permissions"
import { canSetUp } from "@/modules/portal/server/setup"

// Sales › Settings (stored in the workspace's settings table)
export const SALES_SETTINGS = {
  enforceDocuments: "operations_enforce_documents", // required documents before allotment / handover / possession
  defaulterLines: "operations_defaulter_lines", // a defaulter after this many overdue payments…
  defaulterDays: "operations_defaulter_days", // …or the oldest this many days late
  deductionPct: "operations_cancel_deduction_pct", // default deduction when canceling
  approveRefunds: "operations_approve_refunds", // cancellations (and their refunds) go to Finance for approval
  approveDiscounts: "operations_approve_discounts", // discounts above someone's limit go for approval (instead of being refused)
  dealerCommissionPct: "operations_dealer_commission_pct", // default dealer rate (a dealer's own agreed rate wins)
  agentCommissionPct: "operations_agent_commission_pct", // in-house agent rate, when no dealer brought the buyer
  commissionTrigger: "operations_commission_trigger", // token | down-payment | allotment: when it becomes payable
  dealerWhtPct: "operations_dealer_wht_pct", // income tax withheld on dealer commission (section 233)
}
export const COMMISSION_TRIGGERS = ["token", "down-payment", "allotment"]

const parse = (v) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

export async function salesSettings(db) {
  const rows = await db("settings").whereIn("key", Object.values(SALES_SETTINGS)).select("key", "value")
  const get = (k) => parse(rows.find((r) => r.key === k)?.value)
  const int = (k, d, min = 1) => {
    const n = Number(get(k))
    return Number.isFinite(n) && n >= min ? Math.round(n) : d
  }
  const pct = (k, d) => {
    const v = get(k)
    const n = Number(v)
    return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : d
  }
  return {
    enforceDocuments: get(SALES_SETTINGS.enforceDocuments) !== false,
    defaulterLines: int(SALES_SETTINGS.defaulterLines, 3),
    defaulterDays: int(SALES_SETTINGS.defaulterDays, 90),
    deductionPct: int(SALES_SETTINGS.deductionPct, 10, 0),
    approveRefunds: get(SALES_SETTINGS.approveRefunds) !== false,
    approveDiscounts: get(SALES_SETTINGS.approveDiscounts) !== false,
    dealerCommissionPct: pct(SALES_SETTINGS.dealerCommissionPct, 2),
    agentCommissionPct: pct(SALES_SETTINGS.agentCommissionPct, 1),
    commissionTrigger: COMMISSION_TRIGGERS.includes(get(SALES_SETTINGS.commissionTrigger)) ? get(SALES_SETTINGS.commissionTrigger) : "down-payment",
    dealerWhtPct: pct(SALES_SETTINGS.dealerWhtPct, 12),
  }
}

// Who may change Sales settings and assignment rules: setup rights, or edit in Sales
export const canEditSalesRules = (ctx) => canSetUp(ctx.permissions) || isFullAccess(ctx.permissions) || can(ctx.permissions, "operations", "approve")
