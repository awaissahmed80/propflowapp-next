import Link from "next/link"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { Icon } from "@/components/ui/icon"

// The themed error page: a big soft status code over a faint grid and brand glow, a small tag,
// the title, what to do next, and a reference to quote to support.
//   code: "404" | "500" | "403"… · tag: { icon, label } · title · text
//   actions: buttons (node) · links: [{ href, icon, label, text }] quick ways out
//   reference: an error id to quote · full: a whole page with the logo (else it sits inside an app)
export function ErrorScreen({ code, tag, title, text, actions, links, reference, full = true, homeHref = "/" }) {
  return (
    <main className={cn("relative isolate flex flex-col items-center overflow-hidden px-4", full ? "min-h-svh bg-background" : "min-h-[calc(100svh-3.5rem)]")}>
      {/* Faint grid that fades out, and a soft brand glow behind the code */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_38%,black,transparent)] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-70"
      />
      <div aria-hidden className="pointer-events-none absolute top-[18%] left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl dark:bg-primary/20" />

      {full && (
        <header className="flex w-full max-w-5xl items-center justify-center py-8">
          <Link href={homeHref} aria-label="PropFlow home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo className="h-8" />
          </Link>
        </header>
      )}

      <div className={cn("flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center", full ? "pb-16" : "py-16")}>
        <p
          className="bg-gradient-to-b from-foreground/85 via-foreground/45 to-foreground/5 bg-clip-text text-[7.5rem] leading-none font-bold tracking-tighter text-transparent tabular-nums select-none sm:text-[10rem]"
          aria-hidden
        >
          {code}
        </p>
        {tag && (
          <span className="-mt-3 inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <Icon name={tag.icon} className="text-sm text-primary" />
            {tag.label}
          </span>
        )}
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {text && <p className="mt-2 max-w-md text-[15px] text-pretty text-muted-foreground">{text}</p>}
        {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-2">{actions}</div>}

        {links?.length > 0 && (
          <div className="mt-10 grid w-full gap-2 text-left sm:grid-cols-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group flex items-center gap-3 rounded-xl border bg-background/80 px-3.5 py-3 shadow-xs backdrop-blur transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
                  <Icon name={l.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{l.label}</span>
                  {l.text && <span className="block truncate text-xs text-muted-foreground">{l.text}</span>}
                </span>
                <Icon name="arrow-right-line" className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}

        {reference && (
          <p className="mt-8 text-xs text-muted-foreground">
            If it keeps happening, quote this to support: <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground/80 select-all">{reference}</span>
          </p>
        )}
      </div>
    </main>
  )
}
