"use client"

import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { accentHex } from "../constants"
import { submitPublicEntry } from "../server/public-actions"

// A lead form as visitors see it: always light, styled with the form's accent color. Used on the
// hosted form page, embeds (embed.js), landing pages and the builder's preview.
//   workspace: the workspace slug · form: { code, name, status, fields, settings }
//   page: the landing page code it sits on · cities: [{ value, label }] for the city question
//   embed: transparent, and tells the parent page its height · onTest(values): the builder's
//   preview sends a test entry instead · workspaceName: shown under the button

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-(--accent) focus:ring-3 focus:ring-(--accent)/20 aria-invalid:border-red-500"
const chevron =
  "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22><path fill=%22%2364748b%22 d=%22M12 15l-5-5h10z%22/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-9"

const Required = () => <span className="text-red-600"> *</span>

function Field({ field, value, error, onChange, cities, uid }) {
  const id = `${uid}-${field.id}`
  const errorId = `${id}-error`
  const described = error ? errorId : undefined
  const errorText = error && (
    <span id={errorId} className="mt-1 block text-xs text-red-600">
      {error}
    </span>
  )

  if (field.type === "radio")
    return (
      <fieldset aria-describedby={described}>
        <legend className="mb-1 text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <Required />}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => (
            <label key={o} className={cn("flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm text-slate-800", value === o ? "border-(--accent) bg-(--accent)/10" : "border-slate-300")}>
              <input type="radio" name={id} className="accent-(--accent)" checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
        {errorText}
      </fieldset>
    )

  if (field.type === "checkbox" || field.type === "consent")
    return (
      <div>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            id={id}
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-(--accent)"
            checked={Boolean(value)}
            aria-invalid={Boolean(error)}
            aria-describedby={described}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {field.label}
            {field.required && <Required />}
          </span>
        </label>
        {errorText}
      </div>
    )

  const common = { id, value: value ?? "", "aria-invalid": Boolean(error), "aria-describedby": described, onChange: (e) => onChange(e.target.value) }
  let control
  if (field.type === "textarea") control = <textarea rows={3} className={cn(inputClass, "h-auto py-2")} placeholder={field.placeholder ?? undefined} {...common} />
  else if (field.type === "select" || field.type === "city") {
    const options = field.type === "city" ? cities : (field.options ?? []).map((o) => ({ value: o, label: o }))
    control = (
      <select className={cn(inputClass, chevron)} {...common}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  } else
    control = (
      <input
        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
        inputMode={field.type === "phone" ? "tel" : undefined}
        autoComplete={{ name: "name", phone: "tel", email: "email" }[field.type]}
        className={inputClass}
        placeholder={field.placeholder ?? undefined}
        {...common}
      />
    )
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {field.label}
        {field.required && <Required />}
      </span>
      {control}
      {errorText}
    </label>
  )
}

// Cloudflare Turnstile: loads its script once, renders the check, and hands back the token
// (one use each; reset after a failed send). Usually invisible to people.
let turnstileScript = null
function loadTurnstile() {
  if (typeof window === "undefined") return Promise.resolve(null)
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstileScript ??= new Promise((resolve) => {
    const el = document.createElement("script")
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    el.async = true
    el.onload = () => resolve(window.turnstile ?? null)
    el.onerror = () => resolve(null)
    document.head.appendChild(el)
  })
  return turnstileScript
}
function Captcha({ siteKey, onToken, resetKey }) {
  const holder = useRef(null)
  const widget = useRef(null)
  useEffect(() => {
    let gone = false
    loadTurnstile().then((ts) => {
      if (gone || !ts || !holder.current) return
      widget.current = ts.render(holder.current, { sitekey: siteKey, theme: "light", size: "flexible", callback: onToken, "expired-callback": () => onToken(null), "error-callback": () => onToken(null) })
    })
    return () => {
      gone = true
      if (widget.current != null) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [siteKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (resetKey && widget.current != null) {
      window.turnstile?.reset(widget.current)
      onToken(null)
    }
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={holder} className="min-h-[65px]" />
}

//   captcha: Turnstile site key (null: the workspace switched the captcha off; never in the builder)
export function PublicLeadForm({ workspace, form, page = null, accent, embed = false, onTest = null, cities = [], workspaceName = null, captcha = null, className }) {
  const uid = useId()
  const box = useRef(null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState("")
  const [state, setState] = useState("idle") // idle | sending | done
  const [token, setToken] = useState(null)
  const [resets, setResets] = useState(0)
  const needsCaptcha = Boolean(captcha) && !onTest
  const s = form.settings ?? {}
  const wa = String(s.whatsapp ?? "").replace(/\D/g, "")

  // Embedded: a see-through page that tells the parent its height, so the iframe never scrolls
  useEffect(() => {
    if (!embed || !box.current) return
    for (let el = box.current.parentElement; el; el = el.parentElement) el.style.background = "transparent"
    // A dark page inside a light iframe gets an opaque backdrop: keep this one light
    const html = document.documentElement
    const keepLight = () => {
      if (html.classList.contains("dark")) html.classList.replace("dark", "light")
      if (html.style.colorScheme !== "light") html.style.colorScheme = "light"
    }
    keepLight()
    const mo = new MutationObserver(keepLight)
    mo.observe(html, { attributes: true, attributeFilter: ["class", "style"] })
    const post = () => window.parent.postMessage({ type: "propflow:form-height", formId: form.code, height: Math.ceil(box.current?.getBoundingClientRect().height ?? 0) }, "*")
    const ro = new ResizeObserver(post)
    ro.observe(box.current)
    post()
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [embed, form.code])

  const submit = async (e) => {
    e.preventDefault()
    if (state === "sending") return
    setState("sending")
    setMessage("")
    let r
    try {
      if (onTest) r = await onTest(values)
      else {
        const utm = new URLSearchParams(window.location.search).get("utm_source")
        const trap = new FormData(e.currentTarget).get("website") ?? ""
        r = await submitPublicEntry(workspace, form.code, values, { utm, page, trap: String(trap), captcha: token })
        // Tokens work once: get a fresh one for the next try
        if (needsCaptcha && !r?.ok) setResets((n) => n + 1)
      }
    } catch {
      r = { error: "We couldn't send that. Check your connection and try again." }
    }
    if (r?.ok) {
      setErrors({})
      setState("done")
      const to = String(s.redirectUrl ?? "").trim()
      if (!onTest && /^https?:\/\//i.test(to))
        setTimeout(() => {
          try {
            window.top.location.href = to
          } catch {
            window.location.href = to
          }
        }, 1200)
      return
    }
    setErrors(r?.fieldErrors ?? {})
    setMessage(r?.error ?? (r?.fieldErrors ? "" : "That didn't work. Try again."))
    setState("idle")
  }

  return (
    <div ref={box} className={cn(embed ? "bg-transparent p-1" : "", className)}>
      <div style={{ "--accent": accentHex(accent ?? s.accent) }} className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm [color-scheme:light] sm:p-6">
        {state === "done" ? (
          <div className="py-6 text-center" role="status">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-(--accent)/10 text-2xl text-(--accent)">
              <Icon name="check-line" />
            </span>
            <p className="mt-3 text-base font-semibold">{s.successMessage || "Thank you!"}</p>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#25d366] px-4 text-sm font-semibold text-white">
                <Icon name="whatsapp-line" /> Message us on WhatsApp
              </a>
            )}
            <button
              type="button"
              className="mt-4 block w-full cursor-pointer text-sm text-slate-500 underline-offset-2 hover:underline"
              onClick={() => {
                setValues({})
                setState("idle")
              }}
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            {(s.title || s.intro) && (
              <div>
                {s.title && <h3 className="text-lg font-semibold">{s.title}</h3>}
                {s.intro && <p className="mt-1 text-sm text-slate-600">{s.intro}</p>}
              </div>
            )}
            {form.fields.map((f) => (
              <Field
                key={f.id}
                uid={uid}
                field={f}
                cities={cities}
                value={values[f.id]}
                error={errors[f.id]}
                onChange={(v) => {
                  setValues((x) => ({ ...x, [f.id]: v }))
                  setErrors((x) => ({ ...x, [f.id]: undefined }))
                }}
              />
            ))}
            {/* Bots fill every field; people never see this one */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0" defaultValue="" />
            {needsCaptcha && <Captcha siteKey={captcha} onToken={setToken} resetKey={resets} />}
            {message && (
              <p role="alert" className="text-sm text-red-600">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={state === "sending" || (needsCaptcha && !token)}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--accent) text-[15px] font-semibold text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-60"
            >
              {state === "sending" && <Icon name="loader-4-line" className="animate-spin" />}
              {s.submitLabel || "Send"}
            </button>
            <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
              <Icon name="lock-line" /> Your details are only shared with {workspaceName || "the developer"}.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
