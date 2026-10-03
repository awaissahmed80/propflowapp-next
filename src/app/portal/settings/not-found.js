import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Settings: keeps the app's sidebar
export default function SettingsNotFound() {
  return <NotFoundPage full={false} home={{ href: "/settings", label: "Back to Settings" }} text="That settings page doesn't exist. Check the address, or head back into Settings." />
}
