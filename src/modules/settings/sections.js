import "server-only"
import { createElement } from "react"
import { estateContext } from "@/modules/portfolio/server/context"
import { crmContext } from "@/modules/crm/server/context"
import { canEditCrmRules } from "@/modules/crm/server/settings"
import { campaignsContext } from "@/modules/campaigns/server/context"
import { salesContext } from "@/modules/operations/server/context"
import { canEditSalesRules } from "@/modules/operations/server/settings"
import { servicesContext } from "@/modules/estate/server/context"
import { usersContext } from "@/modules/users/server/context"
import { financeContext } from "@/modules/finance/server/context"
import FinanceSettings from "@/app/portal/finance/customize/settings/page"
import PortfolioUnits from "@/app/portal/project-portfolio/customize/units/page"
import PortfolioFeatures from "@/app/portal/project-portfolio/customize/features/page"
import CrmActivities from "@/app/portal/crm/customize/activities/page"
import CrmFollowUps from "@/app/portal/crm/customize/follow-ups/page"
import CrmPipeline from "@/app/portal/crm/customize/pipeline/page"
import CrmAssignment from "@/app/portal/crm/customize/assignment/page"
import CampaignsSettings from "@/app/portal/campaigns/customize/settings/page"
import OperationsSettings from "@/app/portal/operations/customize/settings/page"
import OperationsAssignment from "@/app/portal/operations/customize/assignment/page"
import OperationsDocuments from "@/app/portal/operations/customize/documents/page"
import EstateSettings from "@/app/portal/estate-management/customize/settings/page"

// Settings › App Settings: each app's settings beyond plain pick-lists (rules, assignment, fees,
// and lists with their own fields such as unit sizes, activity points or follow-up days),
// rendering the same pages as the app's own Customize tabs so the two never drift apart.
// allowed(): the same check the page makes, so Settings only offers what this person may open.
// lists: list keys a section edits (those stay out of Lists & Labels). The app's own Setup ›
// Customize shows the same sections as tabs (base + key), then its plain Lists & labels
// (listsAllowed, default: anyone who can view the app).
const APPS = [
  {
    app: "portfolio",
    base: "/project-portfolio/customize",
    context: () => estateContext("/settings/apps"),
    sections: [
      { key: "units", label: "Units & sizes", icon: "ruler-2-line", Page: PortfolioUnits, lists: ["unit-type", "block-category", "area-unit"], allowed: (c) => c.can("view") },
      { key: "features", label: "Premium features", icon: "vip-crown-2-line", Page: PortfolioFeatures, lists: ["feature"], allowed: (c) => c.can("view") },
    ],
  },
  {
    app: "crm",
    base: "/crm/customize",
    context: () => crmContext("/settings/apps"),
    listsAllowed: (c) => c.can("view") && canEditCrmRules(c),
    sections: [
      { key: "pipeline", label: "Pipeline & scoring", icon: "git-branch-line", Page: CrmPipeline, allowed: (c) => c.can("view") && canEditCrmRules(c) },
      { key: "assignment", label: "Assignment rules", icon: "shuffle-line", Page: CrmAssignment, allowed: (c) => c.can("view") && c.has("assignment") && canEditCrmRules(c) },
      { key: "activities", label: "Activities", icon: "chat-check-line", Page: CrmActivities, lists: ["activity-type", "activity-outcome"], allowed: (c) => c.can("view") && canEditCrmRules(c) },
      { key: "follow-ups", label: "Follow-ups & replies", icon: "alarm-line", Page: CrmFollowUps, lists: ["follow-up", "quick-reply"], allowed: (c) => c.can("view") && canEditCrmRules(c) },
    ],
  },
  {
    app: "campaigns",
    base: "/campaigns/customize",
    context: () => campaignsContext("/settings/apps"),
    sections: [{ key: "settings", label: "Lead forms", icon: "settings-3-line", Page: CampaignsSettings, allowed: (c) => c.can("view") }],
  },
  {
    app: "operations",
    base: "/operations/customize",
    context: () => salesContext("/settings/apps"),
    sections: [
      { key: "settings", label: "Rules & commissions", icon: "settings-3-line", Page: OperationsSettings, allowed: (c) => c.can("view") && canEditSalesRules(c) },
      { key: "assignment", label: "Assignment rules", icon: "shuffle-line", Page: OperationsAssignment, allowed: (c) => c.can("view") && canEditSalesRules(c) },
      { key: "documents", label: "Booking documents", icon: "folder-shield-2-line", Page: OperationsDocuments, lists: ["booking-document"], allowed: (c) => c.can("view") },
    ],
  },
  {
    app: "estate",
    base: "/estate-management/customize",
    context: () => servicesContext("/settings/apps"),
    sections: [{ key: "settings", label: "Fees & timelines", icon: "money-rupee-circle-line", Page: EstateSettings, allowed: (c) => c.can("view") }],
  },
  {
    app: "finance",
    base: "/finance/customize",
    context: () => financeContext("/settings/apps"),
    sections: [{ key: "settings", label: "Books & defaults", icon: "safe-2-line", Page: FinanceSettings, allowed: (c) => c.can("view") }],
  },
  // Lists only for now (designations, departments, member statuses)
  { app: "users", base: "/users/customize", context: () => usersContext("/settings/apps"), sections: [] },
]

// Lists edited in App Settings rather than in Lists & Labels
export const SECTION_LISTS = new Set(APPS.flatMap((a) => a.sections.flatMap((s) => s.lists ?? [])))

// The sections this person may open, per app (apps the workspace doesn't have drop out)
//   → [{ app, sections: [{ id: "crm.pipeline", key, label, icon }] }]
export async function settingsSections(appCodes) {
  const out = []
  for (const a of APPS.filter((x) => appCodes.includes(x.app))) {
    const ctx = await a.context()
    const sections = a.sections.filter((s) => s.allowed(ctx)).map((s) => ({ id: `${a.app}.${s.key}`, key: s.key, label: s.label, icon: s.icon }))
    if (sections.length) out.push({ app: a.app, sections })
  }
  return out
}

// The page behind a section id ("crm.pipeline"), rendered, or null
export function renderSection(id) {
  const [app, key] = String(id ?? "").split(".")
  const Page = APPS.find((a) => a.app === app)?.sections.find((s) => s.key === key)?.Page
  return Page ? createElement(Page) : null
}

// An app's Setup › Customize tabs: its sections, then Lists & labels → [{ label, icon, to }]
export async function customizeTabs(app) {
  const a = APPS.find((x) => x.app === app)
  const ctx = await a.context()
  const tabs = a.sections.filter((s) => s.allowed(ctx)).map((s) => ({ label: s.label, icon: s.icon, to: `${a.base}/${s.key}` }))
  if ((a.listsAllowed ?? ((c) => c.can("view")))(ctx)) tabs.push({ label: "Lists & labels", icon: "list-settings-line", to: `${a.base}/lists` })
  return tabs
}
