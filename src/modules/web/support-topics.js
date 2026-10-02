// What people can ask about from "Contact support" on the sign-in pages. category matches
// the console's request categories; "can't sign in" is urgent because they're locked out.
export const SUPPORT_TOPICS = [
  { value: "signin", label: "I can't sign in", subject: "Can't sign in", category: "problem", urgent: true },
  { value: "access", label: "I need access to my workspace", subject: "Needs access to the workspace", category: "question" },
  { value: "billing", label: "Billing or subscription", subject: "Billing or subscription", category: "billing" },
  { value: "problem", label: "Something isn't working", subject: "Something isn't working", category: "problem" },
  { value: "question", label: "Another question", subject: "Question", category: "question" },
]

// Screenshots on a support request: images only, kept under the server-action upload limit
export const SUPPORT_FILES = { max: 3, maxBytes: 10 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp"] }
