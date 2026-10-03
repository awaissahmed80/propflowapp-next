import "server-only"
import { getLookupLists } from "@/modules/lookups/server"
import { LOOKUP_APPS } from "@/modules/lookups/catalog"
import { SECTION_LISTS, settingsSections } from "./sections"

// The per-app groups down the side of Settings › Lists & Labels and Settings › App Settings, in
// the launcher's order with workspace-wide lists (Users & Teams, General) last. Apps the workspace
// doesn't have stay out.
//   portal: getPortal() · what: "lists" | "sections"
//   → { groups: [{ app, name, icon, color, sections, lists }], lists: getLookupLists entries }
const SHARED = ["users", "general"]

export async function directoryGroups(ctx, portal, what) {
  const appOf = Object.fromEntries(portal.apps.map((a) => [a.code, a]))
  const order = [...new Set([...portal.apps.map((a) => a.code).filter((c) => !SHARED.includes(c)), ...SHARED])]
  const [lists, sections] = await Promise.all([what === "lists" ? getLookupLists(ctx.db) : [], what === "sections" ? settingsSections(portal.apps.map((a) => a.code)) : []])
  const plain = lists.filter((l) => !SECTION_LISTS.has(l.key) && (appOf[l.app] || SHARED.includes(l.app)))
  const groups = order
    .map((app) => ({
      app,
      name: appOf[app]?.name ?? LOOKUP_APPS[app] ?? app,
      icon: appOf[app]?.icon ?? null,
      color: appOf[app]?.color ?? null,
      sections: sections.find((s) => s.app === app)?.sections ?? [],
      lists: plain
        .filter((l) => l.app === app)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => ({
          key: l.key,
          name: l.name,
          description: l.description,
          count: l.values.filter((v) => v.active).length,
          customized: l.customized,
          system: l.kind === "system",
          values: l.values.map((v) => v.label),
        })),
    }))
    .filter((g) => g.sections.length || g.lists.length)
  return { groups, lists }
}
