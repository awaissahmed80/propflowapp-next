import { cn } from "@/lib/utils"

// "Continue with Google": a plain link to /api/auth/google/start, which does the rest.
// params: { intent: "signin", redirect } or { intent: "invite", token }
export function GoogleButton({ params, label = "Continue with Google", className, ...props }) {
  const href = `/api/auth/google/start?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`
  return (
    <a
      href={href}
      {...props}
      className={cn(
        "flex h-control w-full items-center justify-center gap-2.5 rounded-md border bg-background px-4 text-sm font-medium shadow-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-4">
        <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11z" />
        <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z" />
      </svg>
      {label}
    </a>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
