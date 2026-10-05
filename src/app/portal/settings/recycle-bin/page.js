import { notFound } from "next/navigation"
import { settingsPage } from "@/modules/settings/context"
import { isFullAccess } from "@/modules/users/permissions"
import { listBin } from "@/modules/recycle-bin/server/actions"
import { RecycleBinView } from "@/modules/recycle-bin/components/recycle-bin-view"

export const metadata = { title: "Recycle Bin" }

// Settings › Recycle bin: administrators (full access) only
export default async function RecycleBinPage() {
  const { permissions } = await settingsPage("/settings/recycle-bin")
  if (!isFullAccess(permissions)) notFound()
  const { items } = await listBin()
  return <RecycleBinView items={items} />
}
