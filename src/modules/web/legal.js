// The website's legal pages: /privacy-policy and /terms-and-conditions. Plain-language starting
// text, to be reviewed by a lawyer before launch. Bump LEGAL_VERSION when either changes; the
// version someone accepted is saved with their workspace request. No public contact email yet:
// add one to "Your choices" and the end of the terms when there is.
export const LEGAL_VERSION = "2026-10-01"
export const LEGAL_UPDATED = "1 October 2026"
const COMPANY = "PropFlow (Pvt) Ltd"

export const LEGAL = {
  privacy: {
    slug: "privacy-policy",
    title: "Privacy Policy",
    intro: `This policy explains what information ${COMPANY} ("PropFlow", "we") collects when you use our website and the PropFlow platform, how we use it, and the choices you have.`,
    sections: [
      {
        heading: "What we collect",
        items: [
          "Details you give us: your name, company, email, phone number and the answers you give when you ask for a workspace or contact us.",
          "Your workspace data: projects, inventory, leads, customers, bookings, payments and documents you or your team add to PropFlow. You own this data; we store and process it to run the service for you.",
          "Account and usage information: sign-ins, the device and browser you use, and how you use the platform, so we can keep it secure and improve it.",
        ],
      },
      {
        heading: "How we use it",
        items: [
          "To set up and run your workspace, and to contact you about it.",
          "To keep accounts secure, prevent misuse and fix problems.",
          "To send service emails (workspace ready, invoices, password resets). We don't send marketing emails without your consent.",
          "To improve PropFlow, using aggregated information that doesn't identify your customers.",
        ],
      },
      {
        heading: "Cookies and analytics",
        items: [
          "The PropFlow platform uses only the cookies it needs to keep you signed in and remember settings such as light or dark mode.",
          "Our website uses Google Analytics to understand how visitors find and use it: pages viewed, buttons pressed and roughly where visitors are. It never receives your name, email or phone number, and we don't use it for advertising.",
          "Where we ask for consent, analytics cookies are set only after you accept. You can also block them in your browser, or use Google's opt-out browser add-on.",
          "Google Analytics is not used inside workspaces, so your business data and your customers' data are never sent to it.",
        ],
      },
      {
        heading: "Who we share it with",
        items: [
          "We don't sell your data or your customers' data.",
          "We use trusted providers for hosting, email and payments, only as needed to run the service and under confidentiality obligations.",
          "We may disclose information if the law requires it, for example to a court or a government authority in Pakistan.",
        ],
      },
      {
        heading: "Your customers' data",
        items: [
          "Information about your buyers, dealers and staff that you add to PropFlow belongs to your company. You are responsible for having their consent where the law needs it, and we process it only on your instructions.",
          "CNIC numbers and similar sensitive details are shown only to people whose role allows it.",
        ],
      },
      {
        heading: "Keeping it safe and how long we keep it",
        items: [
          "Each workspace has its own database, data is encrypted in transit, and access is limited to the people your roles allow.",
          "We keep workspace data while your subscription is active. If you close your workspace, you can ask for an export, and we delete the data within 90 days unless the law requires us to keep it.",
        ],
      },
      {
        heading: "Your choices",
        items: [
          `You can ask to see, correct, export or delete your personal information by contacting us. Workspace users can also ask through their workspace owner.`,
          "Workspace owners and administrators can manage their team's access and their customers' records inside PropFlow.",
        ],
      },
      {
        heading: "Changes to this policy",
        items: [`We'll update this policy when our practices change and show the date at the top.`],
      },
    ],
  },
  terms: {
    slug: "terms-and-conditions",
    title: "Terms & Conditions",
    intro: `These terms apply when you or your company use the PropFlow website and platform provided by ${COMPANY}. By creating a workspace or using PropFlow you agree to them.`,
    sections: [
      {
        heading: "Your workspace and free trial",
        items: [
          "A new workspace starts with a free trial. No card or payment is needed for the trial.",
          "Before the trial ends we'll tell you the price for what your workspace includes. If you don't continue, the workspace becomes read-only and your data is kept for 90 days so you can export it or continue later.",
        ],
      },
      {
        heading: "Accounts and your team",
        items: [
          "The person who creates the workspace is its owner and is responsible for who they invite and the roles they give.",
          "Keep sign-in details private. Tell us straight away if you think an account has been misused.",
        ],
      },
      {
        heading: "Your data",
        items: [
          "Data you add to PropFlow belongs to your company. You give us permission to store and process it only to provide and support the service.",
          "You are responsible for the accuracy of your data and for having the right to use your customers' and staff's information, including under Pakistani law.",
        ],
      },
      {
        heading: "Fair use",
        items: [
          "Don't use PropFlow for anything unlawful, to send spam, to break into other accounts, or to overload or copy the platform.",
          "We may suspend a workspace that puts the service or others at risk, and we'll tell you why.",
        ],
      },
      {
        heading: "Payments",
        items: [
          "Paid plans are billed monthly or yearly in Pakistani rupees, plus applicable taxes, as shown on your invoice.",
          "If an invoice isn't paid on time, the workspace may become read-only until it is. Fees already paid aren't refunded for part of a billing period unless the law requires it.",
        ],
      },
      {
        heading: "Availability and changes",
        items: [
          "We work to keep PropFlow available and secure, but there may be maintenance or interruptions. We'll announce planned maintenance in advance where we can.",
          "We may improve or change features. If a change significantly reduces what your plan includes, we'll tell you first.",
        ],
      },
      {
        heading: "Liability",
        items: ["PropFlow is provided as is. To the extent the law allows, we aren't liable for indirect losses, and our total liability is limited to the fees you paid in the 12 months before the claim."],
      },
      {
        heading: "Ending and governing law",
        items: [
          "You can close your workspace at any time. We may end these terms with notice if they're seriously breached.",
          "These terms are governed by the laws of Pakistan, and the courts of Lahore have jurisdiction.",
        ],
      },
    ],
  },
}
