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
    built: true,
    defaultStatus: "soon",
    app: "campaigns",
    icon: "google-fill",
    tile: "bg-[#4285F4]",
    name: "Google Lead Forms",
    subtitle: "Google Ads lead form assets",
    info: {
      about: "Leads from lead forms in your Google Ads (Search, YouTube, Discovery) come straight into CRM: matched to the contact, assigned by your rules, with a call due in 15 minutes.",
      needs: ["A Google Ads account with a lead form asset on a campaign", "Access to edit that lead form in Google Ads", "A role that can change Campaigns in PropFlow"],
    },
  },
  {
    key: "google-forms",
    built: true,
    defaultStatus: "soon",
    app: "campaigns",
    icon: "survey-fill",
    tile: "bg-[#EA4335]",
    name: "Google Forms",
    subtitle: "Responses from your Google Forms as leads",
    info: {
      about: "Every response to your Google Forms (expo sign-ups, registration forms shared on WhatsApp) becomes a CRM lead, the moment it's sent.",
      needs: ["A Google Form with a name and a mobile number question", "Edit access to the form, to add PropFlow's small script once", "A role that can change Campaigns in PropFlow"],
    },
  },
  {
    key: "sms",
    built: true,
    defaultStatus: "soon",
    icon: "message-2-fill",
    tile: "bg-violet-600",
    name: "SMS gateway",
    subtitle: "Branded SMS through your own Veevo Tech account",
    info: {
      about:
        "Send SMS from PropFlow with your company's sender name: installment reminders, receipts, payment requests and site-visit confirmations. You pay your provider for the messages; PropFlow keeps every message with its delivery report.",
      needs: ["A Veevo Tech account (veevotech.com) with SMS balance", "Your API key from the VT OneID portal", "An approved sender name (mask) on that account", "A role with setup rights in PropFlow"],
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
