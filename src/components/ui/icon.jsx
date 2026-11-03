import { cn } from "@/lib/utils"
import { ICON_NAMES } from "./icon-names"

// A Remix icon by name ("phone-line"). The app's font holds only the icons named in its code
// (scripts/build-icons.mjs); any other name, such as one chosen in a list's icon picker, loads
// the full set (React adds the stylesheet once, however many icons need it).
export const Icon = ({ name, className, ...rest }) => {
  if (!name || ICON_NAMES.has(name)) return <i className={cn(`icon ri-${name}`, className)} {...rest} />
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags -- loaded only when a rare icon is shown; React hoists and dedupes it */}
      <link rel="stylesheet" href="/icons/remixicon.css" precedence="low" />
      <i className={cn(`icon ri-${name} ri-all`, className)} {...rest} />
    </>
  )
}
