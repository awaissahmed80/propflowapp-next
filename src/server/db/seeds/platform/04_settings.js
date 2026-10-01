// Platform-wide values. Only adds missing keys: values changed in the console are kept.
const SETTINGS = [
  ["trial_days", 15, "Free trial length for new workspaces"],
  ["yearly_months_charged", 10, "Yearly billing charges this many months (two months free)"],
  ["sales_tax_rate", 16, "Sales tax on services (%), check the rate for your province"],
  ["extra_user_price", 799, "Monthly price per user above the plan limit (PKR)"],
  ["currency", "PKR", "Billing currency"],
  ["site_status", { mode: "live", message: null, until: null }, "Live, or maintenance (only PropFlow staff can sign in)"],
  ["prices_visible", false, "Show plan prices on the website (hidden until pricing is announced)"],
  ["quote_requests", true, "When prices are hidden, invite visitors to describe their business and needs for a custom quote"],
  ["signin_visible", true, "Show the Sign in link on the website (the sign-in page itself always works)"],
  ["signup_mode", "invite", "How new workspaces join: invite (by invitation only) or open (self sign-up)"],
]

export async function seed(knex) {
  await knex("settings")
    .insert(SETTINGS.map(([key, value, description]) => ({ key, value: JSON.stringify(value), description })))
    .onConflict("key")
    .ignore()
}
