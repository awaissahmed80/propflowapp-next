// Third-party integrations: what each one is, for the workspace cards (Campaigns › Integrations,
// Settings › Integrations) and the console. The platform owner sets each one Live, Coming soon or
// Hidden (Console › Integrations); only built ones can go live. A workspace can also be switched
// off for one integration (Console › Workspaces › a workspace).

export const INTEGRATIONS = [
  {
    key: "meta",
    built: true,
    defaultStatus: "live",
    app: "campaigns",
    icon: "meta-fill",
    tile: "bg-[#0866FF]",
    name: "Meta",
    subtitle: "Facebook & Instagram lead ads",
    info: {
      about: "Every lead from your Facebook and Instagram lead ads becomes a CRM lead within seconds: matched to the contact, assigned by your rules, with a call due in 15 minutes.",
      needs: [
        "A Facebook account that's an admin of your business Page",
        "Lead form ads running on that Page (Meta Ads Manager); for Instagram, the Instagram account linked to the Page",
        "A role that can change Campaigns in PropFlow",
      ],
    },
  },
  {
    key: "whatsapp",
    built: false,
    defaultStatus: "soon",
    icon: "whatsapp-fill",
    tile: "bg-[#25D366]",
    name: "WhatsApp Business",
    subtitle: "Reminder, receipt and follow-up templates",
    info: {
      about: "Send approved WhatsApp templates from PropFlow: installment reminders, receipts and site-visit confirmations.",
      needs: ["A WhatsApp Business account in a verified Meta Business account", "A phone number that isn't used on the WhatsApp app", "Message templates approved by Meta"],
    },
  },
  {
    key: "google-leads",
    built: false,
    defaultStatus: "soon",
    icon: "google-fill",
    tile: "bg-[#4285F4]",
    name: "Google Lead Forms",
    subtitle: "Google Ads lead form extensions",
    info: {
      about: "Leads from Search, YouTube and Discovery lead form ads, straight into CRM like your website forms.",
      needs: ["A Google Ads account running lead form assets", "Admin access to that Google Ads account", "The webhook address and key PropFlow gives you"],
    },
  },
  {
    key: "sms",
    built: false,
    defaultStatus: "soon",
    icon: "message-2-fill",
    tile: "bg-violet-600",
    name: "SMS gateway",
    subtitle: "Branded SMS for reminders and OTPs",
    info: {
      about: "Installment reminders, receipts and site-visit confirmations by SMS, sent with your company's sender name.",
      needs: ["An account with a PTA-approved SMS provider", "A registered sender name (mask)", "SMS balance with the provider"],
    },
  },
]

export const integrationByKey = (key) => INTEGRATIONS.find((i) => i.key === key) ?? null

// Platform-wide: live (workspaces can use it), soon (a "Coming soon" card), hidden (not shown)
export const INTEGRATION_STATUS = {
  live: { label: "Live", color: "green" },
  soon: { label: "Coming soon", color: "gray" },
  hidden: { label: "Hidden", color: "amber" },
}
