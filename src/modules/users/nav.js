// Users & Teams sidebar; description is the page subtitle
export const USERS_NAV = [
  { items: [{ label: "Overview", icon: "dashboard-line", to: "/users", end: true, description: "Seats used, pending invitations and recent access changes" }] },
  {
    label: "People",
    items: [
      { label: "Users", icon: "user-3-line", to: "/users/people", description: "Everyone with access to this workspace, their role and team" },
      { label: "Teams", icon: "team-line", to: "/users/teams", description: "Sales teams, team leads, members and monthly targets" },
      { label: "Invitations", icon: "mail-send-line", to: "/users/invitations", description: "Pending and expired invitations to join the workspace" },
    ],
  },
  {
    label: "Access",
    items: [
      { label: "Roles & Permissions", icon: "shield-keyhole-line", to: "/users/roles", description: "What each role can view, create, edit, approve and export in every app" },
      { label: "Dealer Accounts", icon: "shake-hands-line", to: "/users/dealers", feature: "dealers", description: "Logins for external dealers, limited to their allocated quota" },
    ],
  },
  { label: "Setup", items: [{ label: "Lists & Labels", icon: "list-settings-line", to: "/users/lists", description: "Designations, departments and member statuses" }] },
  { label: "Audit", items: [{ label: "Activity Log", icon: "history-line", to: "/users/activity", description: "Sign-ins, role changes and sensitive actions across the workspace" }] },
]
