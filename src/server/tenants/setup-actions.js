"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashPassword, signValue } from "@/server/auth/secrets"
import { checkPassword } from "@/server/auth/password-check"
import { finishSignIn } from "@/server/auth/sign-in"
import { GOOGLE_SETUP_COOKIE } from "@/server/auth/google"
import { createWorkspace } from "@/server/tenants/create-workspace"
import { findWorkspaceInvite, slugUnavailable } from "@/server/tenants/invitations"
import { MIN_PASSWORD } from "@/lib/password"

// Setting up a workspace from an invitation link (auth /setup/[token]). The plan and terms were
// chosen in the console; the invitee gives company details and their account.

const GONE = "This invitation has expired or was already used. Ask PropFlow for a new one."
const fieldErrors = (error) => Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]))

const companySchema = z.object({
  name: z.string().trim().min(2, "Enter your company name.").max(150),
  slug: z.string().trim().toLowerCase().max(40),
  city: z.string().trim().min(2, "Enter your city.").max(60),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Enter a phone number, e.g. 0300 1234567."),
  ntn: z
    .string()
    .trim()
    .max(20)
    .refine((v) => !v || /^\d{7}-?\d?$|^\d{13}$/.test(v.replace(/\s/g, "")), "An NTN is 7 digits with a check digit (1234567-8), or a 13-digit CNIC."),
})

async function validCompany(input) {
  const parsed = companySchema.safeParse(input ?? {})
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const slugError = await slugUnavailable(parsed.data.slug)
  if (slugError) return { fieldErrors: { slug: slugError } }
  return { company: parsed.data }
}

// Live check while typing the short name: { ok } or { error }
export async function checkSlug(slug) {
  const problem = await slugUnavailable(
    String(slug ?? "")
      .trim()
      .toLowerCase(),
  )
  return problem ? { error: problem } : { ok: true }
}

const newAccountSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(120),
    password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(128, "That's too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." })

// Create the workspace with a password (new account) or the existing account's password.
// Returns { error } / { fieldErrors }, or signs in and opens the portal.
export async function setupWorkspace(token, input) {
  const invite = await findWorkspaceInvite(token)
  if (!invite) return { error: GONE }
  const checked = await validCompany(input?.company)
  if (!checked.company) return checked

  let person
  const existing = await live(authDb(), "users").where({ email: invite.email }).first("id")
  if (existing) {
    const result = await checkPassword(invite.email, String(input?.account?.password ?? ""))
    if (result.error) return { error: result.error }
    person = result.user
  } else {
    const parsed = newAccountSchema.safeParse(input?.account ?? {})
    if (!parsed.success) {
      // "name" here is the person's; the company form has its own "name"
      const { name, ...rest } = fieldErrors(parsed.error)
      return { fieldErrors: { ...rest, ...(name ? { accountName: name } : {}) } }
    }
    person = { name: parsed.data.name, email: invite.email, passwordHash: await hashPassword(parsed.data.password) }
  }

  const made = await createWorkspace({ invite, company: checked.company, person })
  if (made.field) return { fieldErrors: { [made.field]: made.error } }
  if (!made.tenant || !made.user) return { error: made.error }
  if (made.error) return { error: made.error, created: true }

  const signedIn = await finishSignIn(made.user, { method: "password", remember: true })
  if (signedIn.error) return { error: signedIn.error, created: true }
  redirect(signedIn.url)
}

// "Continue with Google": check the company details now, keep them in a short-lived signed
// cookie, and hand over to Google; the callback finishes the setup. Returns { url } or errors.
export async function startGoogleSetup(token, input) {
  const invite = await findWorkspaceInvite(token)
  if (!invite) return { error: GONE }
  const checked = await validCompany(input?.company)
  if (!checked.company) return checked
  const jar = await cookies()
  jar.set(GOOGLE_SETUP_COOKIE, signValue({ token, company: checked.company, exp: Date.now() + 15 * 60_000 }), {
    httpOnly: true,
    secure: (process.env.APP_PROTOCOL || "https") === "https",
    sameSite: "lax",
    // The setup page reads it too, to refill the form if Google sign-in has to be retried
    path: "/",
    maxAge: 15 * 60,
  })
  return { url: `/api/auth/google/start?${new URLSearchParams({ intent: "setup", token })}` }
}
