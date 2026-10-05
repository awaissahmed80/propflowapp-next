import { CustomizeNav } from "@/components/customize-nav"
import { customizeTabs } from "@/modules/settings/sections"

// Contacts › Customize: the app's lists (tabs come from src/modules/settings/sections.js)
export default async function CustomizeLayout({ children }) {
  const tabs = await customizeTabs("contacts")
  return (
    <div style={{ "--sub-nav": "3.25rem" }}>
      <CustomizeNav tabs={tabs} />
      {children}
    </div>
  )
}
