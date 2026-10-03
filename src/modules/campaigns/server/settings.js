import "server-only"
import { captchaSiteKey } from "@/server/captcha"

// Campaigns settings (the workspace's settings table)
export const CAMPAIGN_SETTINGS = {
  captcha: "campaigns_form_captcha", // a captcha on public forms and landing pages (on unless switched off)
}

const parse = (v) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

export async function campaignSettings(db) {
  const rows = await db("settings").whereIn("key", Object.values(CAMPAIGN_SETTINGS)).select("key", "value")
  const get = (k) => parse(rows.find((r) => r.key === k)?.value)
  return { captcha: get(CAMPAIGN_SETTINGS.captcha) !== false }
}

// The site key public forms render with, or null when the workspace switched the captcha off
export async function formCaptcha(db) {
  return (await campaignSettings(db)).captcha ? captchaSiteKey() : null
}
