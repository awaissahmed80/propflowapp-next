import { live } from "@/server/db/records"
import { financePage } from "@/modules/finance/server/context"
import { lockDate } from "@/modules/finance/server/posting"
import { FinanceSettingsView } from "@/modules/finance/components/finance-settings-view"

export const metadata = { title: "Books & defaults" }

export default async function FinanceSettingsPage() {
  const ctx = await financePage("/finance/customize/settings")
  const [lock, accounts] = await Promise.all([lockDate(ctx.db), live(ctx.db, "accounts").whereIn("kind", ["cash", "bank"]).where({ isActive: true }).orderBy("code").select("id", "code", "name", "kind", "isDefault")])
  const settings = {
    lockDate: lock ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(lock) : null,
    defaultAccountId: accounts.find((a) => a.isDefault)?.id ?? accounts.find((a) => a.code === "1110")?.id ?? null,
  }
  return <FinanceSettingsView settings={settings} accounts={accounts.map(({ isDefault, ...a }) => a)} canEdit={ctx.can("approve")} />
}
