import { ResetFlow } from "./reset-flow"

export const metadata = { title: "Reset password" }

export default async function ForgotPasswordPage({ searchParams }) {
  const { email } = await searchParams
  return <ResetFlow initialEmail={typeof email === "string" ? email : ""} />
}
