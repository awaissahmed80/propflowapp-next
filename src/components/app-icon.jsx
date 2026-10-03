import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// Module colors live here (not in JSON) so Tailwind can see the class names
const COLORS = {
  indigo: "bg-indigo-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  rose: "bg-rose-500",
  fuchsia: "bg-fuchsia-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  slate: "bg-slate-600",
  purple: "bg-purple-500",
  stone: "bg-stone-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  zinc: "bg-zinc-600",
}

const SIZES = {
  sm: "size-8 rounded-lg text-lg",
  default: "size-11 rounded-xl text-2xl",
  lg: "size-14 rounded-2xl text-[1.75rem]",
  xl: "size-16 rounded-2xl text-3xl",
}

export function AppIcon({ icon, color, size = "default", className }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center text-white shadow-sm ring-1 ring-black/5 ring-inset", COLORS[color] ?? COLORS.slate, SIZES[size], className)}>
      <Icon name={icon} />
    </span>
  )
}
