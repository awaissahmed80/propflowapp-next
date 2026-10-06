import { notFound } from "next/navigation"
import { DesktopReturn } from "./desktop-return"

export const metadata = { title: "Back to the app" }

// /desktop?code=…: the browser's last step of Google sign-in for the desktop app. Hands the code
// to the app (propflow://auth?code=…), which finishes signing in.
export default async function DesktopPage({ searchParams }) {
  const { code } = await searchParams
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(code)) notFound()
  return <DesktopReturn link={`propflow://auth?code=${encodeURIComponent(code)}`} />
}
