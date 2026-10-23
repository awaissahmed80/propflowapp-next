"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { timeAgo, formatDate } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { MIN_PASSWORD } from "@/lib/password"
import { useAlert } from "@/components/alert-context"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { changeMyPassword, removeMyPhoto, signOutOtherSessions, signOutSession, updateMyName, uploadMyPhoto } from "../server/account-actions"

// My Desk › Profile: what you can change about your own account (the same in every workspace).
//   readOnly: console staff signed in as this person (nothing can be changed)

// A square, 256 px WebP of the chosen picture, cut from its middle
async function squarePhoto(file) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 256
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  bitmap.close?.()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", 0.88))
}

// The photo, name and a menu to change them
export function ProfileHeader({ user, subtitle, code, readOnly }) {
  const router = useRouter()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) return toast.error("Choose a photo (JPG, PNG or WebP).")
    if (file.size > 15 * 1024 * 1024) return toast.error("That photo is over 15 MB.")
    setBusy(true)
    try {
      const blob = await squarePhoto(file)
      const form = new FormData()
      form.set("photo", new File([blob], "photo.webp", { type: "image/webp" }))
      const r = await toastAction(() => uploadMyPhoto(form), { loading: "Uploading photo…", success: "Photo updated." })
      if (r?.ok) router.refresh()
    } catch {
      toast.error("That photo couldn't be read. Try another one.")
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    const r = await toastAction(() => removeMyPhoto(), { loading: "Removing photo…", success: "Photo removed." })
    if (r?.ok) router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-background p-5 shadow-xs">
      <div className="relative">
        <Avatar name={user.name} source={user.avatarUrl} size="xl" />
        {!readOnly && (
          <button
            type="button"
            aria-label="Change photo"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="absolute -right-1 -bottom-1 flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-sm text-primary-foreground shadow disabled:opacity-60"
          >
            <Icon name={busy ? "loader-4-line" : "camera-line"} className={busy ? "animate-spin" : undefined} />
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={pick} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold">{user.name}</p>
        <p className="text-sm text-muted-foreground">
          {subtitle}
          {code && <span className="ml-2 font-mono text-xs">{code}</span>}
        </p>
      </div>
      {!readOnly && (
        <DropdownMenu
          align="end"
          items={[
            { label: "Change name", icon: "edit-line", onClick: () => setEditing(true) },
            { label: user.avatarUrl ? "Change photo" : "Add a photo", icon: "camera-line", onClick: () => fileRef.current?.click() },
            ...(user.avatarUrl ? [{ label: "Remove photo", icon: "delete-bin-line", variant: "destructive", onClick: remove }] : []),
          ]}
          trigger={
            <Button variant="outline" size="sm" leftIcon="edit-line">
              Edit profile
            </Button>
          }
        />
      )}
      {editing && <NameDialog name={user.name} onClose={() => setEditing(false)} />}
    </div>
  )
}

function NameDialog({ name, onClose }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState(null)
  const [pending, start] = useTransition()
  const save = (e) => {
    e?.preventDefault()
    start(async () => {
      const r = await updateMyName(value)
      if (r?.error) return setError(r.error)
      toast.success("Name updated.")
      onClose()
      router.refresh()
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title="Change your name"
      description="As it appears to your colleagues in every workspace, and on documents you create."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="my-name" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="my-name" onSubmit={save}>
        <Input label="Full name" required autoFocus value={value} maxLength={100} onChange={(e) => setValue(e.target.value)} error={error ?? undefined} />
      </form>
    </Dialog>
  )
}

// Password: change it (or set one when you only use Google)
//   account: { hasPassword, google, passwordChangedAt }
export function PasswordSection({ account, readOnly }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl border bg-background p-4 shadow-xs">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Password &amp; sign-in</h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
          <Icon name="lock-password-line" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{account.hasPassword ? "Password" : "No password yet"}</p>
          <p className="text-xs text-muted-foreground">
            {account.hasPassword ? (account.passwordChangedAt ? `Changed ${timeAgo(account.passwordChangedAt)}` : "Set") : "You sign in with Google. Set a password to sign in with your email too."}
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" leftIcon="key-2-line" onClick={() => setOpen(true)}>
            {account.hasPassword ? "Change password" : "Set a password"}
          </Button>
        )}
      </div>
      {account.google && (
        <div className="mt-3 flex items-center gap-3 border-t pt-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
            <Icon name="google-fill" className="text-[#4285F4]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Google</p>
            <p className="text-xs text-muted-foreground">Continue with Google signs you in to this account.</p>
          </div>
          <Badge color="green" dot>
            Connected
          </Badge>
        </div>
      )}
      {open && <PasswordDialog hasPassword={account.hasPassword} onClose={() => setOpen(false)} />}
    </section>
  )
}

function PasswordDialog({ hasPassword, onClose }) {
  const router = useRouter()
  const [form, setForm] = useState({ current: "", password: "", confirm: "" })
  const [errors, setErrors] = useState({})
  const [pending, start] = useTransition()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = (e) => {
    e?.preventDefault()
    setErrors({})
    start(async () => {
      const r = await changeMyPassword(form)
      if (r?.fieldErrors) return setErrors(r.fieldErrors)
      if (r?.error) return toast.error(r.error)
      toast.success(hasPassword ? "Password changed." : "Password set.", { description: r.signedOut ? `${r.signedOut} other ${r.signedOut === 1 ? "browser was" : "browsers were"} signed out.` : undefined })
      onClose()
      router.refresh()
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={hasPassword ? "Change your password" : "Set a password"}
      description="You stay signed in here; everywhere else you're signed out. We'll email you to confirm."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="my-password" loading={pending}>
            {hasPassword ? "Change password" : "Set password"}
          </Button>
        </>
      }
    >
      <form id="my-password" onSubmit={save} className="space-y-4">
        {/* For password managers */}
        <input type="text" name="username" autoComplete="username" className="hidden" readOnly value="" />
        {hasPassword && <Input label="Current password" type="password" required autoFocus autoComplete="current-password" value={form.current} onChange={set("current")} error={errors.current} />}
        <Input label="New password" type="password" required autoFocus={!hasPassword} autoComplete="new-password" value={form.password} onChange={set("password")} error={errors.password} />
        {!errors.password && <p className="-mt-2 text-xs text-muted-foreground">At least {MIN_PASSWORD} characters. A short sentence is easy to remember.</p>}
        <Input label="Type it again" type="password" required autoComplete="new-password" value={form.confirm} onChange={set("confirm")} error={errors.confirm} />
      </form>
    </Dialog>
  )
}

// Where you're signed in: each browser, with Sign out; "Sign out everywhere else"
//   sessions: [{ key, device, icon, ip, lastSeenAt, createdAt, current }]
export function SessionsSection({ sessions, readOnly }) {
  const router = useRouter()
  const { confirm } = useAlert()
  const others = sessions.filter((s) => !s.current)
  const end = async (s) => {
    const r = await toastAction(() => signOutSession(s.key), { loading: "Signing out…", success: `${s.device} signed out.` })
    if (r?.ok) router.refresh()
  }
  const endAll = async () => {
    const ok = await confirm({
      title: "Sign out everywhere else?",
      description: "Every other browser and device signed in to your account is signed out. You stay signed in here.",
      confirmLabel: "Sign out others",
      destructive: true,
    })
    if (!ok) return
    const r = await toastAction(() => signOutOtherSessions(), {
      loading: "Signing out…",
      success: (x) => (x.count ? `Signed out ${x.count} other ${x.count === 1 ? "browser" : "browsers"}.` : "No other browsers were signed in."),
    })
    if (r?.ok) router.refresh()
  }
  return (
    <section className="rounded-xl border bg-background p-4 shadow-xs">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Where you&apos;re signed in</h2>
        {!readOnly && others.length > 0 && (
          <Button size="sm" variant="ghost" leftIcon="logout-box-r-line" className="text-red-600 hover:text-red-600 dark:text-red-400" onClick={endAll}>
            Sign out everywhere else
          </Button>
        )}
      </div>
      <ul className="divide-y">
        {sessions.map((s) => (
          <li key={s.key} className="flex items-center gap-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
              <Icon name={s.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {s.device}
                {s.current && (
                  <Badge color="green" dot>
                    This browser
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[s.ip, s.current ? "Active now" : s.lastSeenAt ? `Active ${timeAgo(s.lastSeenAt)}` : null, `signed in ${formatDate(s.createdAt)}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            {!readOnly && !s.current && (
              <Button size="sm" variant="outline" onClick={() => end(s)}>
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
