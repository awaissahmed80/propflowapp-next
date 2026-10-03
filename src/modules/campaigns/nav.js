// Campaigns sidebar; description is the page subtitle. soon: a ComingSoon placeholder until it's built.
export const CAMPAIGNS_NAV = [
  {
    items: [
      { label: "Overview", icon: "dashboard-line", to: "/campaigns", end: true, description: "Live campaigns, spend, cost per lead and progress against goals" },
      { label: "Campaigns", icon: "megaphone-line", to: "/campaigns/all", description: "Launches, booking drives, expos and roadshows with their goals, channels and budget" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Lead Forms", icon: "survey-line", to: "/campaigns/forms", feature: "lead-forms", description: "Enquiry forms with an embed snippet for your website; entries arrive in CRM as leads" },
      { label: "Landing Pages", icon: "pages-line", to: "/campaigns/pages", feature: "landing-pages", description: "Project pages built from ready-made sections, published on your campaigns address" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", icon: "file-chart-line", to: "/campaigns/reports", description: "Leads, cost per lead and bookings by campaign, channel and project" }],
  },
  {
    label: "Setup",
    items: [
      { label: "Integrations", icon: "plug-line", to: "/campaigns/integrations", soon: true, description: "Meta lead ads, Google Ads and SMS gateways" },
      { label: "Customize", icon: "equalizer-line", to: "/campaigns/customize", description: "Captcha on public forms, campaign statuses and objectives" },
    ],
  },
]
