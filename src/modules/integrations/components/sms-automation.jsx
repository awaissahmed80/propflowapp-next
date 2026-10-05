"use client"

import { useRef, useState, useTransition } from "react"
import { toastAction } from "@/lib/toast-action"
import { cn } from "@/lib/utils"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { previewSmsAutomationNow, runSmsAutomationNow, saveSmsAutomation, saveSmsTemplate, sendTemplateTest } from "@/modules/settings/sms/actions"
import { PLACEHOLDERS, SAMPLE, render, templateByKey } from "../sms/templates"
import { SMS_MAX, smsParts } from "../sms/text"

// The SMS gateway's "Automatic messages" and "Templates" tabs.
//   sms.automation: { before: { on, days }, due: { on }, overdue: { on, days }, receipt: { on },
//   lastReminderDay, templates: [{ key, lang, body, custom }] }

const AUTO = [
  { key: "before", template: "installment-before", label: "Installment due soon", days: "days before the due date" },
  { key: "due", template: "installment-due", label: "Installment due today", text: "On the due date" },
  { key: "overdue", template: "installment-overdue", label: "Installment overdue", days: "days after the due date, if still unpaid" },
  { key: "receipt", template: "receipt", label: "Payment received", text: "When a payment clears (cheques and pay orders once they clear)" },
]

export function AutomaticMessages({ sms, onChanged }) {
  const [draft, setDraft] = useState(sms.automation)
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState(null)
  const save = (key, patch, success) => {
    const before = draft
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
    startTransition(async () => {
      const r = await toastAction(() => saveSmsAutomation({ [key]: { ...draft[key], ...patch } }), { loading: "Saving…", success })
      if (r?.error) setDraft(before)
      else {
        setPreview(null)
        onChanged()
      }
    })
  }
  const check = () =>
    startTransition(async () => {
      const r = await previewSmsAutomationNow()
      if (r?.ok) setPreview(r.preview)
    })
  const sendNow = async () => {
    if (
      !(await confirm({
        title: `Send ${preview?.count ?? "the due"} ${preview?.count === 1 ? "SMS" : "messages"} now?`,
        description: "Today's reminders and messages for cleared payments go out now through your SMS account.",
        confirmLabel: "Send now",
      }))
    )
      return
    startTransition(async () => {
      const r = await toastAction(() => runSmsAutomationNow(), {
        loading: "Sending…",
        success: (x) => {
          const sent = (x.reminders?.sent ?? 0) + (x.receipts?.sent ?? 0)
          const failed = (x.reminders?.failed ?? 0) + (x.receipts?.failed ?? 0)
          return `${sent} sent${failed ? `, ${failed} failed (see Messages)` : ""}.`
        },
      })
      if (r?.ok) {
        setPreview(null)
        onChanged()
      }
    })
  }

  return (
    <div className="space-y-5 pt-2">
      <p className="text-sm text-muted-foreground">Sent through your SMS account between 9 am and 8 pm (Pakistan time), once per installment or payment. Edit the wording in Templates.</p>
      <div className="divide-y rounded-xl border px-4">
        {AUTO.map((a) => {
          const v = draft[a.key]
          return (
            <div key={a.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="min-w-0 flex-1 basis-56 text-sm">
                <span className="block font-medium">{a.label}</span>
                {a.days ? (
                  <span className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <Input
                      aria-label={`${a.label}: days`}
                      type="number"
                      min={1}
                      max={30}
                      size="sm"
                      className="w-16"
                      defaultValue={v.days}
                      disabled={pending}
                      onBlur={(e) => {
                        const n = Math.min(30, Math.max(1, Math.round(Number(e.target.value) || v.days)))
                        e.target.value = n
                        if (n !== v.days) save(a.key, { days: n }, "Saved.")
                      }}
                    />
                    {a.days}
                  </span>
                ) : (
                  <span className="block text-muted-foreground">{a.text}</span>
                )}
              </span>
              <Switch aria-label={a.label} checked={v.on} disabled={pending} onChange={(on) => save(a.key, { on }, `${a.label}: ${on ? "on" : "off"}.`)} />
            </div>
          )
        })}
      </div>

      <section aria-labelledby="sms-due" className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sms-due" className="text-sm font-semibold">
            Due now
          </h3>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" leftIcon="search-eye-line" loading={pending && !preview} onClick={check}>
              Check
            </Button>
            {preview?.count > 0 && (
              <Button size="sm" leftIcon="send-plane-line" disabled={pending || !preview.inHours} onClick={sendNow}>
                Send now
              </Button>
            )}
          </span>
        </div>
        {!preview ? (
          <p className="text-sm text-muted-foreground">
            The scheduler sends these on its own every day. Check what&apos;s due right now, and send it straight away if the scheduler isn&apos;t set up yet.
            {sms.automation.lastReminderDay && ` Reminders last ran on ${sms.automation.lastReminderDay}.`}
          </p>
        ) : preview.count === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is due right now.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="flex flex-wrap gap-2">
              {Object.entries(preview.byTemplate).map(([k, n]) => (
                <Badge key={k} color="violet">
                  {templateByKey(k)?.label}: {n}
                </Badge>
              ))}
            </p>
            {!preview.inHours && <p className="text-amber-700 dark:text-amber-400">Outside sending hours (9 am to 8 pm Pakistan time). They go out with the next run in hours.</p>}
            <ul className="space-y-1.5">
              {preview.sample.map((m, i) => (
                <li key={i} className="rounded-lg bg-muted/60 px-3 py-2">
                  <span className="block text-xs text-muted-foreground tabular-nums">{m.phone}</span>
                  <span dir="auto">{m.text}</span>
                </li>
              ))}
            </ul>
            {preview.count > preview.sample.length && <p className="text-xs text-muted-foreground">…and {preview.count - preview.sample.length} more.</p>}
          </div>
        )}
      </section>
    </div>
  )
}

export function Templates({ sms, onChanged }) {
  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">One language per message. Click a placeholder to add it; it&apos;s filled in for each buyer.</p>
      {sms.automation.templates.map((t) => (
        <TemplateEditor key={t.key} t={t} onChanged={onChanged} />
      ))}
    </div>
  )
}

function TemplateEditor({ t, onChanged }) {
  const def = templateByKey(t.key)
  const [lang, setLang] = useState(t.lang)
  const [body, setBody] = useState(t.body)
  const [to, setTo] = useState("")
  const [error, setError] = useState(null)
  const [pending, startTransition] = useTransition()
  const area = useRef(null)
  const dirty = lang !== t.lang || body !== t.body
  const p = smsParts(body)
  const unknown = [...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !def.vars.includes(k))

  const insert = (name) => {
    const el = area.current
    const token = `{${name}}`
    const at = el ? el.selectionStart : body.length
    const next = body.slice(0, at) + token + body.slice(el ? el.selectionEnd : at)
    setBody(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + token.length, at + token.length)
    })
  }
  const switchLang = (l) => {
    setLang(l)
    // An untouched default follows the language
    if (!t.custom && body === def[lang]) setBody(def[l])
  }
  const save = (reset = false) =>
    startTransition(async () => {
      const r = await toastAction(() => saveSmsTemplate(t.key, { lang, body: reset ? "" : body }), { loading: "Saving…", success: reset ? "Back to the default text." : "Template saved." })
      if (r?.fieldErrors) setError(r.fieldErrors.body)
      if (r?.ok) {
        setError(null)
        if (reset) setBody(def[lang])
        onChanged()
      }
    })
  const test = () =>
    startTransition(async () => {
      await toastAction(() => sendTemplateTest(t.key, to), { loading: "Sending…", success: "Test sent with sample values." })
    })

  return (
    <section aria-label={def.label} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>
          <span className="flex items-center gap-2 font-medium">
            {def.label}
            {t.custom && <Badge color="gray">Edited</Badge>}
          </span>
          <span className="block text-xs text-muted-foreground">{def.when}</span>
        </span>
        <div role="radiogroup" aria-label={`${def.label}: language`} className="inline-flex rounded-full border p-1 text-xs">
          {[
            ["en", "English"],
            ["ur", "اردو"],
          ].map(([l, label]) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              onClick={() => switchLang(l)}
              className={cn("h-7 rounded-full px-3 font-medium", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Textarea
          ref={area}
          aria-label={`${def.label}: text`}
          dir={lang === "ur" ? "rtl" : "ltr"}
          rows={3}
          maxLength={SMS_MAX}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            setError(null)
          }}
          error={error}
        />
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          About {p.chars} characters · {p.parts} {p.parts === 1 ? "SMS" : "SMS parts"} per buyer{p.unicode ? " · Urdu / special characters: 70 per SMS" : ""} (names and amounts change the length)
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {def.vars.map((v) => (
          <button key={v} type="button" title={PLACEHOLDERS[v]} onClick={() => insert(v)} className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs hover:border-primary hover:text-primary">
            {`{${v}}`}
          </button>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Icon name="error-warning-line" /> Not a placeholder for this message: {unknown.map((u) => `{${u}}`).join(", ")}
        </p>
      )}
      <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
        <span className="block text-xs text-muted-foreground">Preview</span>
        <span dir="auto">{render(body, SAMPLE)}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <span className="flex items-end gap-2">
          <Input aria-label="Send a test to" size="sm" inputMode="tel" placeholder="0300 1234567" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button size="sm" variant="outline" leftIcon="send-plane-line" disabled={!to.trim() || pending || dirty} title={dirty ? "Save first" : undefined} onClick={test}>
            Send test
          </Button>
        </span>
        <span className="flex gap-2">
          {t.custom && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(true)}>
              Reset
            </Button>
          )}
          <Button size="sm" disabled={!dirty || pending || !body.trim()} onClick={() => save(false)}>
            Save
          </Button>
        </span>
      </div>
    </section>
  )
}
