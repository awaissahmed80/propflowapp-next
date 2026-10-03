import { redirect } from "next/navigation"

// My Desk used to be an app at /desk; it now lives on the launcher. Old links still land.
const MOVED = { "": "/", approvals: "/approvals", team: "/my-team", profile: "/profile" }

export default async function OldDeskPage({ params }) {
  const { rest = [] } = await params
  redirect(MOVED[rest.join("/")] ?? "/")
}
