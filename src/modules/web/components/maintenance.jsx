import { Logo } from "@/components/logo"
import { Icon } from "@/components/ui/icon"
import { siteUrl } from "@/lib/sites"

const whenBack = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso))

// Shown instead of the website while the console has maintenance mode on
export function Maintenance({ message, until }) {
  return (
    <main data-site="web" className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 text-center text-foreground">
      <Logo className="h-10" />
      <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-600 dark:text-amber-400">
        <Icon name="tools-line" />
      </span>
      <div className="max-w-md">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">We&apos;ll be right back</h1>
        <p className="mt-3 text-muted-foreground">{message || "PropFlow is down for scheduled maintenance. Your data is safe and nothing needs doing on your side."}</p>
        {until && new Date(until) > new Date() && <p className="mt-2 text-sm text-muted-foreground">Expected back by {whenBack(until)} (Pakistan time).</p>}
      </div>
      <p className="text-sm text-muted-foreground">
        <a href={siteUrl("auth")} className="hover:text-foreground">
          Team sign in
        </a>
      </p>
    </main>
  )
}
