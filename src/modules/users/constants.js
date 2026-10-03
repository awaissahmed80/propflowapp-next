import { timeAgo } from "@/lib/format"

// Team colors are hex ("#3b82f6"), picked with ColorPicker. Older named colors still read.
const NAMED = { blue: "#3b82f6", violet: "#8b5cf6", teal: "#14b8a6", amber: "#f59e0b", green: "#10b981", sky: "#0ea5e9", red: "#ef4444", gray: "#64748b" }
export const DEFAULT_TEAM_COLOR = "#3b82f6"
export const teamColor = (color) => NAMED[color] ?? (/^#[0-9a-f]{6}$/i.test(color ?? "") ? color : NAMED.gray)

// "Online now", "12 minutes ago", "Never signed in"
export function lastActive(at, now = Date.now()) {
  if (!at) return "Never signed in"
  return now - new Date(at).getTime() < 5 * 60_000 ? "Online now" : timeAgo(at)
}

// Activity log event types
export const ACTIVITY_TYPES = [
  { value: "sign-in", label: "Sign-ins", icon: "login-box-line" },
  { value: "security", label: "Security", icon: "shield-keyhole-line" },
  { value: "role", label: "Access changes", icon: "shield-user-line" },
  { value: "invite", label: "Invitations", icon: "mail-send-line" },
  { value: "team", label: "Teams", icon: "team-line" },
  { value: "dealer", label: "Dealers", icon: "shake-hands-line" },
  { value: "portfolio", label: "Projects & inventory", icon: "community-line" },
  { value: "settings", label: "Workspace setup", icon: "settings-3-line" },
  { value: "lists", label: "Lists & labels", icon: "list-settings-line" },
  { value: "export", label: "Exports", icon: "download-2-line" },
]
