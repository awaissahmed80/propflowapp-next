"use server"

import { headers } from "next/headers"
import { channelFromUtm } from "../constants"
import { verifyCaptcha } from "@/server/captcha"
import { publicForm, publicWorkspace, submitEntry } from "./forms"
import { campaignSettings } from "./settings"

// Entries from the public side (hosted form, embed, landing pages). No sign-in: the workspace
// comes from the address, the form must be accepting entries, and a hidden field catches bots.

const recent = new Map() // ip:form → last entry time, to slow down repeated submissions
const WINDOW = 15_000

// workspace: its slug · code: FRM-0001 · values: { fieldId: answer } · utm: the page's utm_source
// page: the landing page code it was filled on · captcha: the Turnstile token
// → { ok, duplicate } | { fieldErrors } | { error }
export async function submitPublicEntry(workspace, code, values = {}, { utm = null, page = null, trap = "", captcha = null } = {}) {
  if (trap) return { ok: true, duplicate: false } // bots fill the hidden field; pretend it worked
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?"
  const key = `${ip}:${workspace}:${code}`
  if (Date.now() - (recent.get(key) ?? 0) < WINDOW) return { error: "You've just sent this. Please wait a moment before trying again." }
  const site = await publicWorkspace(workspace)
  if (!site) return { error: "This form is no longer available." }
  const form = await publicForm(site.db, code)
  if (!form) return { error: "This form is no longer available." }
  // The captcha, unless the workspace switched it off (Campaigns › Customize › Settings)
  if ((await campaignSettings(site.db)).captcha && !(await verifyCaptcha(captcha, ip))) return { error: "Please confirm you're not a robot, then send again.", captcha: true }
  const pageRow = page
    ? await site
        .db("landingPages")
        .where({ code: String(page).toUpperCase(), status: "published" })
        .whereNull("deletedAt")
        .first("id")
    : null
  const result = await submitEntry(site, form, typeof values === "object" && values ? values : {}, { channel: channelFromUtm(utm), pageId: pageRow?.id ?? null })
  if (result.ok) recent.set(key, Date.now())
  return result
}
