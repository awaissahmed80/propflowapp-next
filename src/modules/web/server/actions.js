"use server"

import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { nextCode } from "@/server/db/numbering"
import { requestInfo } from "@/server/auth/session"
import { sendEmail } from "@/server/mail/send"
import { sendServerEvent } from "@/server/analytics/measurement"
import { siteUrl } from "@/lib/sites"
import { need } from "../quote"
import { LEGAL_VERSION } from "../legal"

// The website's "Talk to sales" / "Request a trial" form. Saves a sales
// enquiry for the console team; nobody needs an account.

const KINDS = { sales: "Sales enquiry", trial: "Trial request", quote: "Get-started request" }
const MAX_PER_IP_HOUR = 5
const trialDays = async (db) => Number((await db("settings").where({ key: "trial_days" }).first("value"))?.value) || 15

const MAX_PER_EMAIL_DAY = 3

const schema = z.object({
  kind: z.enum(["sales", "trial", "quote"]),
  businessType: z.enum(["developer", "builder", "agency", "marketing", "investor", "other"]).optional(),
  name: z.string().trim().min(2, "Enter your name.").max(120),
  company: z.string().trim().min(2, "Enter your company.").max(150),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  // Required for sales and trial requests; optional when creating a workspace (email is enough)
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .default("")
    .refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Enter a valid phone or WhatsApp number."),
  city: z.string().trim().max(60).optional(),
  projects: z.string().trim().max(40).optional(),
  teamSize: z.string().trim().max(20).optional(),
  plan: z.string().trim().max(60).nullable().optional(),
  interests: z.array(z.string().trim().max(40)).max(20).optional(),
  callTime: z.string().trim().max(20).optional(),
  message: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(40).optional(),
  // Creating a workspace: they ticked "I agree to the Terms & Conditions and Privacy Policy"
  acceptTerms: z.boolean().optional(),
  // Honeypot: hidden from people, bots fill it in
  website: z.string().max(0).optional(),
})

// Returns { ok } or { fieldErrors } / { error }
export async function submitEnquiry(input) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    // A filled honeypot looks like success to the bot, and nothing is saved
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true }
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  }
  const v = parsed.data
  if (v.kind !== "quote" && !v.phone) return { fieldErrors: { phone: "Enter a phone or WhatsApp number." } }
  const { ip, userAgent } = await requestInfo()
  const db = platformDb()
  // A get-started request lists what they'd like PropFlow to do (see NEEDS)
  if (v.kind === "quote") {
    if (!v.businessType) return { fieldErrors: { businessType: "Tell us what kind of business you are." } }
    v.interests = (v.interests ?? []).filter((x) => need(x))
    if (!v.interests.length) return { fieldErrors: { interests: "Pick at least one thing you'd like to do." } }
    if (v.acceptTerms !== true) return { fieldErrors: { acceptTerms: "Please accept the Terms & Conditions and Privacy Policy." } }
  }

  const [byIp, byEmail] = await Promise.all([
    ip
      ? db("enquiries")
          .where({ ip })
          .where("createdAt", ">", new Date(Date.now() - 3_600_000))
          .count({ n: "*" })
          .first()
      : { n: 0 },
    db("enquiries")
      .where({ email: v.email })
      .where("createdAt", ">", new Date(Date.now() - 86_400_000))
      .count({ n: "*" })
      .first(),
  ])
  if (Number(byIp.n) >= MAX_PER_IP_HOUR || Number(byEmail.n) >= MAX_PER_EMAIL_DAY) {
    return { error: "We already have your request and will be in touch soon." }
  }

  const code = await db.transaction(async (trx) => {
    const code = await nextCode(trx, "enquiry")
    await trx("enquiries").insert({
      code,
      kind: v.kind,
      businessType: v.kind === "quote" ? v.businessType : null,
      name: v.name,
      company: v.company,
      email: v.email,
      phone: v.phone || null,
      city: v.city || null,
      projects: v.projects || null,
      plan: v.plan || null,
      teamSize: v.teamSize || null,
      interests: v.interests?.length ? JSON.stringify(v.interests) : null,
      callTime: v.callTime || null,
      message: v.message || null,
      source: v.source || "Website",
      termsAcceptedAt: v.acceptTerms ? new Date() : null,
      termsVersion: v.acceptTerms ? LEGAL_VERSION : null,
      status: "new",
      ip,
      userAgent,
    })
    return code
  })

  // Emails are a courtesy: the enquiry is saved even if they fail
  // Creating a workspace: the thank-you also lists what they picked and the trial length
  const extra = v.kind === "quote" ? { company: v.company, needs: v.interests.map((x) => need(x).label), trial_days: await trialDays(db) } : {}
  const tasks = [
    sendEmail("enquiry-received", { to: v.email, data: { name: v.name, code, kind: v.kind, ...extra } }),
    // Counted from here, not the browser, so ad blockers don't hide leads (no personal data)
    sendServerEvent("generate_lead", {
      lead_type: v.kind === "quote" ? "get_started" : v.kind,
      cta_location: v.source || "Website",
      ...(v.kind === "quote" && { business_type: v.businessType, needs_count: v.interests.length }),
    }),
  ]
  if (process.env.SALES_NOTIFY_EMAIL) {
    tasks.push(
      sendEmail("enquiry-alert", {
        to: process.env.SALES_NOTIFY_EMAIL,
        replyTo: v.email,
        data: {
          kind_label: KINDS[v.kind],
          code,
          company: v.company,
          name: v.name,
          email: v.email,
          phone: v.phone || null,
          city: v.city,
          plan: v.plan,
          projects: v.projects,
          team_size: v.teamSize,
          call_time: v.callTime,
          message: v.message,
          console_url: siteUrl("console", "/enquiries"),
        },
      }),
    )
  }
  await Promise.all(tasks)
  return { ok: true, code }
}
