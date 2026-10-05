import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside HR & Payroll: keeps the app's sidebar
export default function HrNotFound() {
  return <NotFoundPage full={false} home={{ href: "/hrm", label: "Back to HR & Payroll" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into HR & Payroll." />
}
