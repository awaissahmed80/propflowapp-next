import { CustomizeNav } from "@/components/customize-nav"
import { customizeTabs } from "@/modules/settings/sections"

// Users & Teams › Customize: the same sections as Settings › App Settings (none yet), then the
// app's lists & labels (tabs come from src/modules/settings/sections.js, so the two stay in step)
export default async function CustomizeLayout({ children }) {
  const tabs = await customizeTabs("users")
  return (
    <div style={{ "--sub-nav": "3.25rem" }}>
      <CustomizeNav tabs={tabs} />
      {children}
    </div>
  )
}
