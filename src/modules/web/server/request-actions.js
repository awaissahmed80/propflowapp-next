"use server"

import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { nextCode } from "@/server/db/numbering"
import { requestInfo } from "@/server/auth/session"
import { sendEmail } from "@/server/mail/send"
import { sendServerEvent } from "@/server/analytics/measurement"
import { getDynamicPricing } from "@/server/dynamic-pricing"
import { quote } from "../dynamic-pricing"
import { need, packageFor } from "../quote"
import { LEGAL_VERSION } from "../legal"

// "Request workspace" from the website's create-workspace wizard while dynamic pricing is on. Saves
// an enquiry (kind "workspace") for the console with their answers, the package (features their
// answers didn't ask for switched off), users, billing cycle and the price as the server works it
// out from the console's prices (the browser's total is only a preview). No account, no payment.

const MAX_PER_IP_HOUR = 5
const MAX_PER_EMAIL_DAY = 3

const schema = z.object({
  apps: z.array(z.string().max(30)).max(30),
  businessType: z.enum(["developer", "builder", "agency", "marketing", "investor", "other"]),
  needs: z.array(z.string().trim().max(40)).max(40).optional().default([]),
  users: z.coerce.number().int().min(1).max(10_000),
  cycle: z.enum(["monthly", "yearly"]),
  name: z.string().trim().min(2, "Enter your name.").max(120),
  company: z.string().trim().min(2, "Enter your company.").max(150),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .default("")
    .refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Enter a valid phone or WhatsApp number."),
  city: z.string().trim().max(60).optional(),
  message: z.string().trim().max(2000).optional(),
  acceptTerms: z.literal(true, { error: "Please accept the Terms & Conditions and Privacy Policy." }),
  website: z.string().max(0).optional(), // honeypot
})

// → { ok, code, quote } | { fieldErrors } | { error }
export async function submitWorkspaceRequest(input) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true }
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  }
  const v = parsed.data
  const db = platformDb()
  const config = await getDynamicPricing(db)
  if (config.mode !== "dynamic") return { error: "Online packages aren't available right now. Please use Talk to sales." }
  const q = quote(config.pricing, { apps: v.apps, users: v.users, cycle: v.cycle }, { catalog: config.catalog, yearlyMonths: config.yearlyMonths })

  const { ip, userAgent } = await requestInfo()
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
  if (Number(byIp.n) >= MAX_PER_IP_HOUR || Number(byEmail.n) >= MAX_PER_EMAIL_DAY) return { error: "We already have your request and will be in touch soon." }

  // The package as it will be created: the base apps and the ones they picked; in the apps their
  // answers asked for, the features no answer needed are switched off (like get-started requests)
  const needs = v.needs.filter((x) => need(x))
  const apps = [...config.pricing.baseApps, ...q.apps]
  const off = Object.fromEntries(Object.entries(packageFor(needs).off).filter(([app]) => apps.includes(app)))
  const appNames = apps.map((c) => config.catalog.find((a) => a.code === c)?.name ?? c)
  const code = await db.transaction(async (trx) => {
    const code = await nextCode(trx, "enquiry")
    await trx("enquiries").insert({
      code,
      kind: "workspace",
      businessType: v.businessType,
      name: v.name,
      company: v.company,
      email: v.email,
      phone: v.phone || null,
      city: v.city || null,
      message: v.message || null,
      source: "Create workspace",
      plan: "Custom package",
      teamSize: String(q.users),
      interests: needs.length ? JSON.stringify(needs) : null,
      package: JSON.stringify({ apps, off }),
      users: q.users,
      billingCycle: v.cycle,
      quote: JSON.stringify({ lines: q.lines, monthly: q.monthly, cycleTotal: q.cycleTotal, months: q.months, yearlyMonths: config.yearlyMonths }),
      termsAcceptedAt: new Date(),
      termsVersion: LEGAL_VERSION,
      status: "new",
      ip,
      userAgent,
    })
    return code
  })

  const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`
  const tasks = [
    sendEmail("enquiry-received", { to: v.email, data: { name: v.name, code, kind: "trial" } }),
    sendServerEvent("generate_lead", { lead_type: "workspace_request", cta_location: "Create workspace", apps_count: apps.length, value: q.monthly, currency: "PKR" }),
  ]
  if (process.env.SALES_NOTIFY_EMAIL)
    tasks.push(
      sendEmail("enquiry-alert", {
        to: process.env.SALES_NOTIFY_EMAIL,
        replyTo: v.email,
        data: {
          kind_label: "Workspace request",
          code,
          company: v.company,
          name: v.name,
          email: v.email,
          phone: v.phone,
          city: v.city,
          plan: `${appNames.join(", ")} · ${q.users} users · ${rs(q.cycleTotal)} ${v.cycle}`,
          message: v.message,
        },
      }),
    )
  await Promise.allSettled(tasks)
  return { ok: true, code, quote: q }
}
