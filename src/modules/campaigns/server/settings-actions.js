"use server"

import { z } from "zod"
import { logActivity } from "@/server/tenants/activity"
import { writeSettings } from "@/modules/portal/server/setup"
import { campaignsAction } from "./context"
import { CAMPAIGN_SETTINGS } from "./settings"

// Campaigns › Customize › Settings → { ok } | { error }
export async function saveCampaignSettings(input) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const parsed = z.object({ captcha: z.boolean() }).safeParse(input)
  if (!parsed.success) return { error: "Check the settings and try again." }
  await writeSettings(ctx.tenant, { [CAMPAIGN_SETTINGS.captcha]: parsed.data.captcha }, ctx.user.id)
  await logActivity(ctx.db, { type: "campaigns", action: "settings.saved", actorUserId: ctx.user.id, summary: `${parsed.data.captcha ? "turned on" : "turned off"} the captcha on public forms` })
  return { ok: true }
}
