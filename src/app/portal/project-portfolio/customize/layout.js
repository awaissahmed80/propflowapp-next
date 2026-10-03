import { CustomizeNav } from "@/components/customize-nav"
import { customizeTabs } from "@/modules/settings/sections"

// Project Portfolio › Customize: the same sections as Settings › App Settings, then the app's plain lists &
// labels (tabs come from src/modules/settings/sections.js, so the two stay in step)
export default async function CustomizeLayout({ children }) {
  const tabs = await customizeTabs("portfolio")
  return (
    <div style={{ "--sub-nav": "3.25rem" }}>
      <CustomizeNav tabs={tabs} />
      {children}
    </div>
  )
}
