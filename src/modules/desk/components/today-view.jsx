import Link from "next/link"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { teamColor } from "@/modules/users/constants"

function Card({ href, icon, title, tone = "bg-primary/10 text-primary", children }) {
  return (
    <Link href={href} className="group flex flex-col rounded-xl border bg-background p-4 shadow-xs transition-colors hover:border-primary/40">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("flex size-8 items-center justify-center rounded-lg", tone)}>
          <Icon name={icon} />
        </span>
        {title}
        <Icon name="arrow-right-s-line" className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <div className="mt-3">{children}</div>
    </Link>
  )
}

// My Desk › Today: greeting, a few cards about you, and your tasks from every app
export function TodayView({ firstName, greeting, today, me, teams, apps, tasks }) {
  const appOf = (code) => apps.find((a) => a.code === code)
  const team = teams[0]
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting}, {firstName}
        </h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card href="/desk/profile" icon="shield-user-line" title="Your role">
          <p className="font-medium">{me?.role ?? "Member"}</p>
          <p className="text-sm text-muted-foreground">
            {apps.length} {apps.length === 1 ? "app" : "apps"} you can open
          </p>
        </Card>
        <Card href={team ? "/desk/team" : "/desk/profile"} icon="team-line" title="Your team" tone="bg-sky-500/10 text-sky-600 dark:text-sky-400">
          {team ? (
            <>
              <p className="flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full" style={{ backgroundColor: teamColor(team.color) }} />
                {team.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {team.people} {team.people === 1 ? "person" : "people"}
                {team.lead ? ` · led by ${team.lead}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Not in a team</p>
              <p className="text-sm text-muted-foreground">{me?.dealer ? `Login for ${me.dealer.name}` : "Your administrator adds you to one"}</p>
            </>
          )}
        </Card>
        <Card href="#tasks" icon="checkbox-circle-line" title="Tasks" tone="bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <p className="font-medium">{tasks.length ? `${tasks.length} ${tasks.length === 1 ? "thing needs" : "things need"} you` : "Nothing waiting"}</p>
          <p className="text-sm text-muted-foreground">From across your apps</p>
        </Card>
      </div>

      <section id="tasks" className="rounded-xl border bg-background shadow-xs">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Your tasks</h2>
          <span className="text-xs text-muted-foreground">{tasks.length ? `${tasks.length} ${tasks.length === 1 ? "thing" : "things"}` : ""}</span>
        </header>
        {tasks.length ? (
          <ul className="divide-y">
            {tasks.map((t) => {
              const app = appOf(t.app)
              return (
                <li key={t.id}>
                  <Link href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    {app ? <AppIcon icon={app.icon} color={app.color} size="sm" className="size-8 rounded-lg text-base" /> : <Icon name="checkbox-circle-line" className="text-lg text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      {t.detail && <span className="block truncate text-xs text-muted-foreground">{t.detail}</span>}
                    </span>
                    <Icon name="arrow-right-s-line" className="text-muted-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-12 text-center">
            <Icon name="checkbox-circle-line" className="text-4xl text-emerald-500" />
            <p className="mt-2 font-medium">You&apos;re all caught up</p>
          </div>
        )}
      </section>
    </div>
  )
}
