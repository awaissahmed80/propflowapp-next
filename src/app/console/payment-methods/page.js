import { requireArea } from "@/modules/console/server/access"
import { getPaymentSettings } from "@/modules/console/server/payments"
import { can } from "@/modules/console/roles"
import { PaymentMethodsView } from "@/modules/console/components/payment-methods-view"

export const metadata = { title: "Payment Methods" }

export default async function PaymentMethodsPage() {
  const staff = await requireArea("billing", "/payment-methods")
  return <PaymentMethodsView settings={await getPaymentSettings()} editable={can(staff.role, "billing")} />
}
