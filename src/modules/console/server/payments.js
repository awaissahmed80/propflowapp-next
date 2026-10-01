import "server-only"
import { platformDb } from "@/server/db/connections"
import { EMPTY_BANK, PAYMENT_GATEWAYS } from "@/modules/console/payments"

export const PAYMENT_SETTINGS_KEY = "payment_methods"

// Which gateway keys are missing from the environment (names only, never values)
const missingKeys = (g) => (g.env ?? []).filter((k) => !process.env[k])

// Stored switches and bank details, plus whether each gateway is ready to use.
// Everything here is safe to send to the browser.
export async function getPaymentSettings() {
  const row = await platformDb()("settings").where({ key: PAYMENT_SETTINGS_KEY }).first("value", "updatedAt")
  const stored = row?.value ?? {}
  return {
    methods: PAYMENT_GATEWAYS.map((g) => {
      const missing = missingKeys(g)
      return { id: g.id, enabled: Boolean(stored.enabled?.[g.id]) && missing.length === 0, configured: missing.length === 0, missing }
    }),
    bank: { ...EMPTY_BANK, ...(stored.bank ?? {}) },
    updatedAt: row?.updatedAt ?? null,
  }
}

// Methods a customer can use right now (for checkout, later)
export async function enabledPaymentMethods() {
  const { methods } = await getPaymentSettings()
  return methods.filter((m) => m.enabled).map((m) => m.id)
}

export { missingKeys }
