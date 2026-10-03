import { cn } from "@/lib/utils"

// Always two letters: "Skyline Developers" → "SD", "Skyline" → "SK"
function initials(name) {
  const words = String(name ?? "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
  if (!words.length) return ""
  if (words.length === 1)
    return words[0]
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function TenantMark({ tenant, className }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white",
        // Workspaces without their own color use the brand color
        !tenant?.color && "bg-primary text-primary-foreground",
        className,
      )}
      style={{ backgroundColor: tenant?.color }}
    >
      {initials(tenant?.name ?? "")}
    </span>
  )
}
