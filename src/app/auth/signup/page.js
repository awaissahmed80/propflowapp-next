import { getSiteSettings } from "@/server/platform-settings"
import { siteUrl } from "@/lib/sites"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

export const metadata = { title: "Start your free trial" }

// Self sign-up. Whether it's open is a console setting; the sign-up form itself comes with the
// workspace signup flow.
export default async function SignupPage() {
  const site = await getSiteSettings()
  const inviteOnly = !site.signupOpen || site.maintenance
  return (
    <div className="text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">
        <Icon name={inviteOnly ? "mail-send-line" : "rocket-2-line"} />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{inviteOnly ? "Sign-up is by invitation" : "Self sign-up is almost here"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inviteOnly
          ? "New workspaces are set up by our team. Request a free trial and we'll email you a link to your workspace, usually within one working day."
          : "You'll soon be able to create your workspace here in a couple of minutes. Until then, request a trial and we'll set it up for you."}
      </p>
      <Button className="mt-6" leftIcon="calendar-check-line" nativeButton={false} render={<a href={siteUrl("web", "/?request=trial")} />}>
        Request a free trial
      </Button>
      <p className="mt-4 text-sm text-muted-foreground">
        Got an invitation? Use the link in your email.{" "}
        <a href={siteUrl("auth")} className="font-medium text-primary hover:underline">
          Sign in
        </a>
      </p>
    </div>
  )
}
