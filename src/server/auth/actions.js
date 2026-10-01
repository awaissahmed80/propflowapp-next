"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { endSession } from "@/server/auth/session"
import { checkPassword } from "@/server/auth/password-check"
import { finishSignIn } from "@/server/auth/sign-in"
import { siteUrl } from "@/lib/sites"
import { logToWorkspace } from "@/server/tenants/activity"
import { getSession } from "@/server/auth/dal"

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required.").pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Password is required.").max(256),
  remember: z.boolean(),
  redirect: z.string().max(2000).optional(),
})

// useActionState(signIn, {}): returns { error, fieldErrors, email } or redirects on success
export async function signIn(_prev, formData) {
  const parsed = signInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    remember: formData.get("remember") === "on",
    redirect: formData.get("redirect") || undefined,
  })
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message]))
    return { fieldErrors, email: String(formData.get("email") ?? "") }
  }
  const { email, password, remember, redirect: redirectTo } = parsed.data

  const { user, error } = await checkPassword(email, password)
  if (error) return { error, email }

  const result = await finishSignIn(user, { method: "password", remember, redirectTo })
  if (result.error) return { error: result.error, email }
  redirect(result.url)
}

export async function signOut() {
  // The workspace's Activity Log shows sign-outs too
  const session = await getSession()
  if (session?.kind === "tenant" && session.tenantId) await logToWorkspace(session.tenantId, { type: "sign-in", action: "member.signed_out", actorUserId: session.user.id, summary: "signed out" })
  await endSession()
  redirect(siteUrl("auth"))
}
