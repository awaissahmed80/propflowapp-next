// My Desk sidebar; description is the page subtitle. Built per person (deskNav): My team only for
// people in or leading a team. More pages join as their apps are ported (messages,
// leave, roster, pay).
export const DESK_NAV = [
  {
    items: [
      { label: "Today", icon: "sun-line", to: "/desk", end: true, description: "Your day, tasks and what's waiting on you" },
      { label: "Requests & approvals", icon: "checkbox-circle-line", to: "/desk/approvals", description: "What you asked for and what waits for your sign-off" },
    ],
  },
  {
    label: "Me",
    items: [
      { label: "My team", icon: "team-line", to: "/desk/team", description: "The people you work with", team: true },
      { label: "Profile", icon: "user-3-line", to: "/desk/profile", description: "Your details on record" },
    ],
  },
]

export const deskNav = ({ hasTeam }) => DESK_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.team || hasTeam) })).filter((g) => g.items.length)
