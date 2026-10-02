"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkPhone } from "@/lib/phone"
import { defaultValue } from "@/modules/lookups/options"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { LinkSentDialog } from "@/components/link-sent-dialog"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Textarea } from "@/components/ui/textarea"
import { lastActive } from "../constants"
import { memberHref } from "../links"
import { removeDealer, saveDealer, setDealerActive } from "../server/dealers"
import { inviteMember } from "../server/members"
import { MemberStatusBadge, Notice } from "./user-parts"

const EMPTY = { name: "", contactName: "", phone: "", email: "", city: "", address: "", ntn: "", notes: "" }

// Add or edit a dealer firm
function DealerDialog({ dealer, defaultCity, cities, canAddCity, onClose, onSaved }) {
  const [form, setForm] = useState(() => (dealer ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, k === "phone" ? formatPkPhone(dealer.phone) : (dealer[k] ?? "")])) : { ...EMPTY, city: defaultCity ?? "" }))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key]: undefined }))
  }
  const submit = (e) => {
    e.preventDefault()
    startTransition(async () => {
      setError("")
      const result = await saveDealer(form, dealer?.code)
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onSaved(form.name)
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-2xl"
      scrollable
      title={dealer ? `Edit ${dealer.name}` : "Add dealer"}
      description="An external estate agency that sells your inventory. Its people get their own logins."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="dealer-form" leftIcon="save-3-line" loading={pending}>
            {dealer ? "Save dealer" : "Add dealer"}
          </Button>
        </>
      }
    >
      <form id="dealer-form" onSubmit={submit} noValidate className="grid gap-4 p-px sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <Input label="Dealer name" required autoFocus placeholder="e.g. Al-Hamd Estate" value={form.name} onChange={set("name")} error={errors.name} />
        <Input label="Contact person" placeholder="Owner or manager" value={form.contactName} onChange={set("contactName")} error={errors.contactName} />
        <Input label="Phone" type="tel" placeholder="0300 1234567" value={form.phone} onChange={set("phone")} error={errors.phone} />
        <Input label="Email" type="email" placeholder="office@dealer.pk" value={form.email} onChange={set("email")} error={errors.email} />
        <LookupSelect list="city" values={cities} canAdd={canAddCity} app="users" label="City" empty="Not set" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v ?? "" }))} error={errors.city} />
        <Input label="NTN" placeholder="Optional" value={form.ntn} onChange={set("ntn")} error={errors.ntn} />
        <div className="sm:col-span-2">
          <Input label="Office address" value={form.address} onChange={set("address")} error={errors.address} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Notes" rows={2} placeholder="Agreement, commission terms…" value={form.notes} onChange={set("notes")} error={errors.notes} />
        </div>
      </form>
    </Dialog>
  )
}

// Invite one of the dealer's people: always the Dealer role, no team
function DealerLoginDialog({ dealer, seats, onClose, onInvited }) {
  const [form, setForm] = useState({ name: "", email: "" })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const full = seats.limit != null && seats.used >= seats.limit
  const submit = (e) => {
    e.preventDefault()
    startTransition(async () => {
      setError("")
      const result = await inviteMember({ ...form, dealerId: dealer.id })
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onInvited(result, form.email.trim().toLowerCase())
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Invite a login for ${dealer.name}`}
      description="They get the Dealer role and only see their firm's leads, bookings and allocated inventory. The invitation expires after 7 days."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="dealer-login" leftIcon="mail-send-line" loading={pending} disabled={full}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id="dealer-login" onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Full name" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} />
        <Input label="Email" required type="email" placeholder="name@dealer.pk" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="shake-hands-line" />
          {seats.limit == null ? `${seats.used} dealer logins · unlimited on your plan` : `${seats.used} of ${seats.limit} dealer logins used`}
          {full && <span className="font-medium text-destructive"> · Upgrade to add more</span>}
        </p>
      </form>
    </Dialog>
  )
}

function DealerCard({ dealer, lists, allowed, now, onEdit, onInvite, onToggle, onRemove }) {
  const menu = [
    ...(allowed.edit ? [{ label: "Edit dealer", icon: "edit-line", onClick: onEdit }] : []),
    ...(allowed.edit ? [dealer.isActive ? { label: "Deactivate", icon: "forbid-line", onClick: onToggle } : { label: "Activate", icon: "checkbox-circle-line", onClick: onToggle }] : []),
    ...(allowed.remove ? [{ type: "separator" }, { label: "Remove dealer", icon: "delete-bin-6-line", variant: "destructive", onClick: onRemove }] : []),
  ]
  const contact = [dealer.contactName, dealer.phone && formatPkPhone(dealer.phone), dealer.email].filter(Boolean)
  return (
    <article className={cn("flex flex-col rounded-xl border bg-background shadow-xs", !dealer.isActive && "opacity-75")}>
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
          <Icon name="shake-hands-line" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{dealer.name}</h3>
            {!dealer.isActive && <Badge color="gray">Inactive</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{[dealer.code, dealer.city].filter(Boolean).join(" · ")}</p>
          {contact.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{contact.join(" · ")}</p>}
        </div>
        {menu.length > 0 && <DropdownMenu align="end" items={menu} trigger={<Button variant="ghost" size="smicon" leftIcon="more-2-line" aria-label={`${dealer.name} actions`} />} />}
      </header>
      <ul className="flex-1 divide-y">
        {dealer.logins.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.name} source={m.avatarUrl} size="sm" />
            <Link href={memberHref(m.code)} scroll={false} className="min-w-0 flex-1 hover:text-primary">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {m.email} · {lastActive(m.lastActiveAt, now)}
              </span>
            </Link>
            <MemberStatusBadge status={m.status} statuses={lists["member-status"]} />
          </li>
        ))}
        {dealer.invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
              <Icon name="mail-line" />
            </span>
            <Link href="/users/invitations" className="min-w-0 flex-1 hover:text-primary">
              <span className="block truncate text-sm font-medium">{i.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{i.email}</span>
            </Link>
            <MemberStatusBadge status="invited" statuses={lists["member-status"]} />
          </li>
        ))}
        {!dealer.logins.length && !dealer.invites.length && <li className="px-4 py-4 text-sm text-muted-foreground">No logins yet.</li>}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
        <a href={`/estate/inventory?view=board`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary" title="Units allocated to this dealer's quota in Estate Management">
          <Icon name="stack-line" />
          <span>
            <span className="font-semibold text-foreground tabular-nums">{dealer.quota.total}</span> in quota · {dealer.quota.available} available
          </span>
        </a>
        {allowed.invite && dealer.isActive && (
          <Button size="sm" variant="ghost" leftIcon="user-add-line" className="text-primary" onClick={onInvite}>
            Invite a login
          </Button>
        )}
      </footer>
    </article>
  )
}

// Dealer Accounts: external dealer firms, their logins and invitations
export function DealersView({ dealers, seats, lists, allowed }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState(null) // dealer | "new"
  const [inviting, setInviting] = useState(null)
  const [sent, setSent] = useState(null)
  const [confirm, setConfirm] = useState(null) // { dealer, kind: "deactivate" | "remove" }
  const [message, setMessage] = useState(null)
  const [pending, startTransition] = useTransition()
  const [now] = useState(() => Date.now())
  const dealerSeats = seats.dealers

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? dealers.filter((d) => [d.name, d.code, d.city, d.contactName, d.phone, d.email].some((v) => v?.toLowerCase().includes(q))) : dealers
  }, [dealers, search])

  const act = (fn, success) =>
    startTransition(async () => {
      setMessage(null)
      const result = await fn()
      setMessage(result?.error ? { tone: "error", text: result.error } : { tone: "success", text: typeof success === "function" ? success(result) : success })
      setConfirm(null)
      router.refresh()
    })

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Dealer Accounts"
        toolbar={
          dealers.length > 0 && (
            <div className="min-w-32 flex-1 sm:max-w-80">
              <Input type="search" placeholder="Dealer, city or contact…" aria-label="Search dealers" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
          )
        }
        info={
          <span className="flex items-center gap-2">
            <Icon name="shake-hands-line" className="text-sm" />
            {dealers.length} {dealers.length === 1 ? "dealer" : "dealers"} · {dealerSeats.limit == null ? `${dealerSeats.used} logins` : `${dealerSeats.used}/${dealerSeats.limit} logins`}
          </span>
        }
        actions={
          allowed.edit && (
            <Button leftIcon="add-line" onClick={() => setEditing("new")}>
              Add dealer
            </Button>
          )
        }
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {dealerSeats.limit === 0 && (
        <Notice tone="error" icon="information-line">
          Your plan doesn&apos;t include dealer logins. You can add dealers now; upgrade to give their people logins.
        </Notice>
      )}

      {dealers.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
          <Icon name="shake-hands-line" className="text-3xl text-muted-foreground" />
          <p className="mt-2 font-medium">No dealers yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add the estate agencies that sell your inventory, then invite their people. Dealer logins only see their own firm&apos;s work.</p>
          {allowed.edit && (
            <Button className="mt-4" leftIcon="add-line" onClick={() => setEditing("new")}>
              Add dealer
            </Button>
          )}
        </div>
      ) : (
        <ScrollView className="-mx-1 min-h-0 flex-1" viewportClassName="px-1 pt-1 pb-2">
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {visible.map((d) => (
              <DealerCard
                key={d.code}
                dealer={d}
                lists={lists}
                allowed={allowed}
                now={now}
                onEdit={() => setEditing(d)}
                onInvite={() => setInviting(d)}
                onToggle={() => (d.isActive ? setConfirm({ dealer: d, kind: "deactivate" }) : act(() => setDealerActive(d.code, true), `${d.name} is active again. Reactivate its logins from Users.`))}
                onRemove={() => setConfirm({ dealer: d, kind: "remove" })}
              />
            ))}
          </div>
          {!visible.length && <p className="py-10 text-center text-sm text-muted-foreground">No dealers match.</p>}
        </ScrollView>
      )}

      {editing && (
        <DealerDialog
          dealer={editing === "new" ? null : editing}
          defaultCity={defaultValue(lists.city)}
          cities={lists.city}
          canAddCity={allowed.edit}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setMessage({ tone: "success", text: editing === "new" ? `${name} added. Invite their people next.` : `${name} saved.` })
            setEditing(null)
            router.refresh()
          }}
        />
      )}
      {inviting && (
        <DealerLoginDialog
          dealer={inviting}
          seats={dealerSeats}
          onClose={() => setInviting(null)}
          onInvited={(result, email) => {
            setInviting(null)
            setSent({ result, email })
            router.refresh()
          }}
        />
      )}
      {sent && <LinkSentDialog result={sent.result} email={sent.email} days={7} onClose={() => setSent(null)} />}
      {confirm && (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          className="sm:max-w-md"
          title={confirm.kind === "remove" ? `Remove ${confirm.dealer.name}?` : `Deactivate ${confirm.dealer.name}?`}
          description={
            confirm.kind === "remove"
              ? "Only dealers without logins or waiting invitations can be removed. Their past leads and bookings keep the dealer's name."
              : "Their logins are suspended and signed out at once, and waiting invitations are cancelled. You can activate the dealer again later."
          }
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={pending}
                leftIcon={confirm.kind === "remove" ? "delete-bin-6-line" : "forbid-line"}
                onClick={() =>
                  confirm.kind === "remove"
                    ? act(() => removeDealer(confirm.dealer.code), `${confirm.dealer.name} removed.`)
                    : act(
                        () => setDealerActive(confirm.dealer.code, false),
                        (r) => `${confirm.dealer.name} deactivated${r?.suspended ? `; ${r.suspended} login${r.suspended === 1 ? "" : "s"} suspended` : ""}.`,
                      )
                }
              >
                {confirm.kind === "remove" ? "Remove dealer" : "Deactivate"}
              </Button>
            </>
          }
        />
      )}
    </div>
  )
}
