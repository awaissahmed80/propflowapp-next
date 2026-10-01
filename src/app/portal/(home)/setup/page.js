import { requireTenant } from "@/server/auth/dal"
import { readFile } from "@/server/storage"
import { live } from "@/server/db/records"
import { canSetUp, db, getSetup } from "@/modules/portal/server/setup"
import { SetupWizard } from "@/modules/portal/components/setup-wizard"

export const metadata = { title: "Get started" }

const STEPS = ["profile", "logo", "accounts", "preferences"]

// Getting a new workspace ready before the team starts: company profile, logo, cash & bank
// accounts and preferences
export default async function SetupPage({ searchParams }) {
  const [s, { step }] = await Promise.all([requireTenant("/setup"), searchParams])
  const [setup, role] = await Promise.all([getSetup(s.tenant), live(db(s.tenant), "roles").where({ id: s.membership.roleId }).first("permissions")])
  const key = setup.settings.company_logo
  const logo = key ? await readFile(key).catch(() => null) : null
  const current = STEPS.includes(step) ? step : "profile"

  return (
    <SetupWizard
      step={current}
      setup={{ ...setup, accounts: setup.accounts.map((a) => ({ ...a, openingDate: a.openingDate ?? null })) }}
      logoUrl={logo ? `data:${setup.settings.company_logo_type || "image/png"};base64,${logo.toString("base64")}` : null}
      canSetUp={canSetUp(role?.permissions ?? [])}
      firstName={s.user.name.split(" ")[0]}
      workspaceName={s.tenant.name}
    />
  )
}
