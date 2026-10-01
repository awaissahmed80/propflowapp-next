"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { cn } from "cn"


// Two letters for a person's avatar: first + last name ("Muhammad Ali Khan" → "MK"), or the first
// two letters of a single name ("Ayesha" → "AY"). Titles are skipped ("Dr. Bilal Shah" → "BS"), and
// any script works ("عائشہ خان" → "عخ").
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "rev", "sir", "lady", "lord", "mx", "engr"])
function getInitials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
  const named = words.filter((w) => !TITLES.has(w.toLowerCase()))
  const use = named.length ? named : words
  if (!use.length) return ""
  if (use.length === 1) return Array.from(use[0]).slice(0, 2).join("").toUpperCase()
  return (Array.from(use[0])[0] + Array.from(use.at(-1))[0]).toUpperCase()
}

function BaseAvatar({
  className,
  size = "default",
  ...props
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-7 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-9 data-[size=sm]:size-6 data-[size=xl]:size-18 dark:after:mix-blend-lighten",
        className
      )}
      {...props} />
  );
}

function AvatarImage({
  className,
  ...props
}) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      referrerPolicy="no-referrer"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...props} />
  );
}

function AvatarFallback({
  className,
  ...props
}) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-xs text-muted-foreground group-data-[size=sm]/avatar:text-[10px] group-data-[size=lg]/avatar:text-sm group-data-[size=xl]/avatar:text-2xl group-data-[size=xl]/avatar:font-semibold",
        className
      )}
      {...props} />
  );
}

function AvatarBadge({
  className,
  ...props
}) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props} />
  );
}

function AvatarGroup({
  className,
  ...props
}) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props} />
  );
}

function AvatarGroupCount({
  className,
  ...props
}) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-9 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props} />
  );
}

// Solid colours (no transparency) in light and dark; a name always maps to the same colour
const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-800 dark:text-sky-100",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-100",
  "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100",
  "bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-100",
  "bg-violet-100 text-violet-700 dark:bg-violet-800 dark:text-violet-100",
  "bg-teal-100 text-teal-700 dark:bg-teal-800 dark:text-teal-100",
  "bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-100",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-100",
  "bg-lime-100 text-lime-800 dark:bg-lime-800 dark:text-lime-100",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-800 dark:text-fuchsia-100",
]

function colorFor(value = "") {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// <Avatar name="Ayesha Khan" source={photoUrl} size="sm|default|lg|xl" />: photo when there is
// one, otherwise initials on a colour picked from the name
function Avatar ({source, name, badge, ...props}){
    return(
        <BaseAvatar {...props}>
            {source && <AvatarImage src={source} alt="" />}
            <AvatarFallback className={cn("font-medium", colorFor(name))}>{getInitials(name)}</AvatarFallback>
            {
                (badge) &&
                <AvatarBadge>{badge}</AvatarBadge>
            }
        </BaseAvatar>
    )
}

export {
  Avatar,
  colorFor as avatarColor,
  getInitials,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
