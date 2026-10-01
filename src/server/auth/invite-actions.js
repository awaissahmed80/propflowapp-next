"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { hashPassword } from "@/server/auth/secrets"
import { checkPassword } from "@/server/auth/password-check"
import { accountFor, findConsoleInvite, findInvite, findMemberInvite } from "@/server/auth/invitations"
import { INVITE_GONE, joinConsoleTeam } from "@/server/auth/console-team"
import { joinWorkspace } from "@/server/auth/workspace-join"
import { finishSignIn } from "@/server/auth/sign-in"
import { MIN_PASSWORD } from "@/lib/password"

const newAccountSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(120),
    password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(128, "That's too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." })

const fieldErrors = (error) => Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]))

// useActionState(acceptInvite, {}): joins the console team or a workspace, signs in and opens it.
// A new person sets a name and password; someone with an account confirms their password.
// (Accepting with Google goes through /api/auth/google instead.)
export async function acceptInvite(_prev, formData) {
  const token = String(formData.get("token") ?? "")
  const found = await findInvite(token)
  const invite = found?.kind === "tenant" ? await findMemberInvite(token) : found?.kind === "console" ? await findConsoleInvite(token) : null
  if (!invite) return { error: INVITE_GONE }

  let person
  if (await accountFor(invite.email)) {
    const result = await checkPassword(invite.email, String(formData.get("password") ?? ""))
    if (result.error) return { error: result.error }
    person = result.user
  } else {
    const parsed = newAccountSchema.safeParse({ name: formData.get("name") ?? "", password: formData.get("password") ?? "", confirm: formData.get("confirm") ?? "" })
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), name: String(formData.get("name") ?? "") }
    person = { name: parsed.data.name, email: invite.email, passwordHash: await hashPassword(parsed.data.password) }
  }

  const joined = invite.kind === "tenant" ? await joinWorkspace(invite, person) : await joinConsoleTeam(invite, person)
  if (joined.error) return { error: joined.error }
  const result = await finishSignIn(joined.user, { method: "password", remember: true, tenantId: joined.tenantId })
  if (result.error) return { error: result.error }
  redirect(result.url)
}
