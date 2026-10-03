import "server-only"
import { canSetUp } from "@/modules/portal/server/setup"

// Who may change CRM's rules: anyone with setup rights (Settings › CRM), or anyone whose role can
// edit in CRM (CRM › Customize), the same as Lists & Labels. ctx: crmContext()
export const canEditCrmRules = (ctx) => canSetUp(ctx.permissions) || ctx.can("edit")

// Pipeline rules each workspace sets in Settings › CRM (stored in the workspace's settings table)
export const CRM_SETTINGS = {
  autoAssign: "crm_auto_assign", // new leads with no one picked go round-robin to active reps
  statusNote: "crm_status_note", // ask for an update when a lead's status changes by hand
  stale: "crm_stale", // flag open leads with no activity for…
  staleDays: "crm_stale_days", // …this many days
  lastAssigned: "crm_last_assigned", // round-robin: who got the previous auto-assigned lead
  scoring: "crm_scoring", // score leads 0–100 (on unless switched off)
  scoreWeights: "crm_score_weights", // { engagement, affordability, intent } in %, adding up to 100
  engagementDays: "crm_engagement_days", // activity in the last … days counts towards engagement
  engagementTarget: "crm_engagement_target", // points that make a fully engaged lead
  reassign: "crm_reassign", // give new leads nobody has reached to the next agent…
  reassignHours: "crm_reassign_hours", // …after this many hours (once per lead)
  reassignSweptAt: "crm_reassign_swept_at", // when that check last ran (it runs as CRM pages open)
}

export const DEFAULT_WEIGHTS = { engagement: 40, affordability: 30, intent: 30 }

export async function crmSettings(db) {
  const rows = await db("settings").whereIn("key", Object.values(CRM_SETTINGS)).select("key", "value")
  const get = (k) => {
    const v = rows.find((r) => r.key === k)?.value
    if (typeof v !== "string") return v
    // The JSON column usually comes back parsed already; a stored string (a date) is then plain text
    try {
      return JSON.parse(v)
    } catch {
      return v
    }
  }
  const days = Number(get(CRM_SETTINGS.staleDays))
  const w = get(CRM_SETTINGS.scoreWeights)
  const weights =
    w && ["engagement", "affordability", "intent"].every((k) => Number.isFinite(Number(w[k]))) ? { engagement: Number(w.engagement), affordability: Number(w.affordability), intent: Number(w.intent) } : DEFAULT_WEIGHTS
  const int = (k, fallback) => {
    const n = Number(get(k))
    return Number.isInteger(n) && n > 0 ? n : fallback
  }
  return {
    autoAssign: get(CRM_SETTINGS.autoAssign) === true,
    statusNote: get(CRM_SETTINGS.statusNote) === true,
    stale: get(CRM_SETTINGS.stale) !== false, // on unless switched off
    staleDays: Number.isInteger(days) && days > 0 ? days : 14,
    lastAssigned: get(CRM_SETTINGS.lastAssigned) ?? null,
    scoring: get(CRM_SETTINGS.scoring) !== false,
    weights,
    engagementDays: int(CRM_SETTINGS.engagementDays, 30),
    engagementTarget: int(CRM_SETTINGS.engagementTarget, 20),
    reassign: get(CRM_SETTINGS.reassign) === true,
    reassignHours: int(CRM_SETTINGS.reassignHours, 2),
    reassignSweptAt: get(CRM_SETTINGS.reassignSweptAt) ?? null,
  }
}
