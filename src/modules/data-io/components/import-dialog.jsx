"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"
import { ENTITIES, autoMap, templateRows } from "../entities"
import { readImportFile } from "../parse"
import { downloadXlsx } from "../download"
import { importSetup, previewImport, runImport } from "../server/actions"

// Import from Excel or CSV, in four steps: pick the file → match its columns to PropFlow's fields
// (matched on their own where the headings say so) → choices (duplicates; for leads who gets them)
// and a check of every row without saving → import, with the rows that failed to download, fix and
// import again.
//   entity: leads | activities | contacts | units | employees · onDone(result) after an import

const STEPS = ["File", "Columns", "Check", "Done"]
const nf = (n) => Number(n ?? 0).toLocaleString("en-US")

export function ImportDialog({ entity: key, onClose, onDone }) {
  const e = ENTITIES[key]
  const [step, setStep] = useState(0)
  const [file, setFile] = useState(null) // { name, headers, rows }
  const [mapping, setMapping] = useState({})
  const [setup, setSetup] = useState(null)
  const [mode, setMode] = useState("skip")
  const [options, setOptions] = useState({})
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const input = useRef(null)

  useEffect(() => {
    importSetup(key).then((r) => {
      if (r?.error) setError(r.error)
      else {
        setSetup(r.options)
        if (key === "leads") setOptions({ assign: { mode: r.options.canReassign ? "rules" : "agent" } })
        if (key === "contacts") setOptions({ defaultType: r.options.types.find((t) => t.value === "customer")?.value ?? r.options.types[0]?.value })
      }
    })
  }, [key])

  const pick = async (f) => {
    if (!f) return
    setError("")
    const r = await readImportFile(f)
    if (r.error) return setError(r.error)
    setFile({ name: f.name, headers: r.headers, rows: r.rows })
    setMapping(autoMap(e, r.headers))
    setStep(1)
  }
  const fields = e.fields.filter((f) => key !== "employees" || setup?.salaries || !f.salary)
  const missing = fields.filter((f) => f.required && (mapping[f.key] == null || mapping[f.key] < 0))
  const sample = (i) =>
    file?.rows
      .map((r) => r[i])
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ")
  const body = () => ({ rows: file.rows, mapping, options, mode, fileName: file.name })

  const check = () =>
    startTransition(async () => {
      setError("")
      const r = await previewImport(key, body())
      if (r?.error) return setError(r.error)
      setPreview(r)
      setStep(2)
    })
  const run = () =>
    startTransition(async () => {
      setError("")
      const r = await runImport(key, body())
      if (r?.error) return setError(r.error)
      setResult(r.result)
      setStep(3)
      onDone?.(r.result)
    })
  // The rows that failed, as they were in the file, with what's wrong
  const downloadFailed = () => {
    const bad = new Map(result.errors.map((x) => [x.row, x.errors.join("; ")]))
    downloadXlsx([[...file.headers, "What's wrong"], ...file.rows.map((r, i) => (bad.has(i + 2) ? [...r, bad.get(i + 2)] : null)).filter(Boolean)], `${e.label} not imported`)
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`Import ${e.label.toLowerCase()}`}
      description={step === 0 ? "From an Excel (.xlsx) or CSV file. Nothing is saved until you press Import." : file?.name}
      scrollable
      className="sm:max-w-3xl"
      bodyClassName="space-y-5"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-1.5", i === step && "font-medium text-foreground")}>
                <span
                  className={cn("flex size-5 items-center justify-center rounded-full border text-[10px]", i < step && "border-primary bg-primary text-primary-foreground", i === step && "border-primary text-primary")}
                >
                  {i < step ? <Icon name="check-line" /> : i + 1}
                </span>
                {s}
                {i < STEPS.length - 1 && <Icon name="arrow-right-s-line" className="text-muted-foreground/50" />}
              </li>
            ))}
          </ol>
          <span className="flex gap-2">
            {step === 1 && (
              <>
                <Button variant="outline" disabled={pending} onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button loading={pending} disabled={missing.length > 0} onClick={check}>
                  Check {nf(file?.rows.length)} rows
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" disabled={pending} onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button loading={pending} disabled={!preview || preview.counts.new + (mode === "update" ? preview.counts.match : 0) === 0} onClick={run}>
                  Import {nf(preview?.counts.new + (mode === "update" ? preview?.counts.match : 0))}
                </Button>
              </>
            )}
            {step === 3 && <Button onClick={onClose}>Done</Button>}
          </span>
        </div>
      }
    >
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <Icon name="error-warning-line" className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {step === 0 && (
        <>
          {e.note && <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">{e.note}</p>}
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              pick(ev.dataTransfer.files?.[0])
            }}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="file-excel-2-line" className="text-4xl text-emerald-600" />
            <span className="font-medium">Drop your file here, or click to choose</span>
            <span className="text-sm text-muted-foreground">Excel (.xlsx) or CSV · up to 5,000 rows · the first row has the column headings</span>
          </button>
          <input ref={input} type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(ev) => pick(ev.target.files?.[0])} />
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Starting from scratch?
            <Button size="sm" variant="outline" leftIcon="download-2-line" onClick={() => downloadXlsx(templateRows(e, { salary: Boolean(setup?.salaries) }), `${e.label} import template`)}>
              Download the template
            </Button>
          </p>
          <p className="text-xs text-muted-foreground">Matches existing records by: {e.matchBy.toLowerCase()}.</p>
        </>
      )}

      {step === 1 && file && (
        <section aria-label="Match the columns">
          <p className="mb-3 text-sm text-muted-foreground">
            Which column holds each field? Matched from your headings where they say so; fields left on &ldquo;Don&apos;t import&rdquo; stay empty.
            {missing.length > 0 && <span className="text-red-600 dark:text-red-400"> Still needed: {missing.map((f) => f.label).join(", ")}.</span>}
          </p>
          <ul className="divide-y rounded-xl border">
            {fields.map((f) => {
              const col = mapping[f.key] ?? -1
              return (
                <li key={f.key} className="grid items-center gap-x-4 gap-y-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <span className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </span>
                  <span className="flex min-w-0 items-center gap-3">
                    <Select
                      aria-label={`Column for ${f.label}`}
                      className="w-56 shrink-0"
                      size="sm"
                      value={String(col)}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: Number(v) }))}
                      options={[{ value: "-1", label: "Don't import" }, ...file.headers.map((h, i) => ({ value: String(i), label: h }))]}
                    />
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{col >= 0 ? sample(col) || "(empty in the first rows)" : ""}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {step === 2 && preview && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["new", "New", "green", `Will be added`],
              ["match", "Already here", "blue", e.matchBy],
              ["error", "Can't import", "red", "Fix them in the file and import again"],
            ].map(([k, label, color, hint]) => (
              <div key={k} className="rounded-xl border p-3">
                <p className="flex items-center justify-between text-sm">
                  {label} <Badge color={color}>{nf(preview.counts[k])}</Badge>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            {preview.counts.match > 0 && (
              <Select
                label={`${nf(preview.counts.match)} already in PropFlow`}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "skip", label: "Skip them (leave as they are)" },
                  { value: "update", label: key === "activities" ? "Skip them (they're identical)" : "Update them: fill their empty fields" },
                ]}
              />
            )}
            {key === "leads" && setup && <LeadAssign setup={setup} value={options.assign} onChange={(assign) => setOptions((o) => ({ ...o, assign }))} />}
            {key === "contacts" && setup && (
              <Select label="Contact type when the file doesn't say" value={options.defaultType ?? ""} onChange={(v) => setOptions((o) => ({ ...o, defaultType: v }))} options={setup.types} />
            )}
            {(key === "leads" || key === "contacts") && (
              <Button size="sm" variant="ghost" leftIcon="refresh-line" loading={pending} onClick={check}>
                Check again with these choices
              </Button>
            )}
          </div>

          {preview.rows.some((r) => r.errors.length || r.warnings.length) && (
            <section aria-label="Rows to look at">
              <p className="mb-2 text-sm font-medium">Rows to look at{preview.warnings ? ` · ${nf(preview.warnings)} with notes` : ""}</p>
              <ul className="max-h-72 divide-y overflow-auto rounded-xl border text-sm">
                {preview.rows
                  .filter((r) => r.errors.length || r.warnings.length)
                  .map((r) => (
                    <li key={r.row} className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">Row {r.row}</span>
                        <span className="min-w-0 truncate font-medium">{r.label}</span>
                        {r.status === "error" ? <Badge color="red">Not imported</Badge> : r.status === "match" ? <Badge color="blue">Already here</Badge> : null}
                      </span>
                      {[...r.errors, ...r.warnings].map((m) => (
                        <span key={m} className={cn("block text-xs", r.errors.includes(m) ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
                          {m}
                        </span>
                      ))}
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}

      {step === 3 && result && (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl text-emerald-600">
            <Icon name="check-double-line" />
          </span>
          <p className="text-lg font-semibold">
            {nf(result.created)} {result.created === 1 ? e.one : e.label.toLowerCase()} imported
          </p>
          <p className="text-sm text-muted-foreground">
            {[result.updated && `${nf(result.updated)} updated`, result.skipped && `${nf(result.skipped)} skipped (already here)`, result.failed && `${nf(result.failed)} couldn't be imported`]
              .filter(Boolean)
              .join(" · ") || "Every row went in."}
          </p>
          {result.failed > 0 && (
            <Button variant="outline" leftIcon="download-2-line" onClick={downloadFailed}>
              Download the {nf(result.failed)} rows that failed
            </Button>
          )}
          {key === "leads" && <p className="text-xs text-muted-foreground">Next: import their history with Import › Lead activities (it finds each lead by its Old ID, mobile or code).</p>}
        </div>
      )}
    </Dialog>
  )
}

// Who gets imported leads
function LeadAssign({ setup, value, onChange }) {
  const v = value ?? { mode: "rules" }
  if (!setup.canReassign) return <p className="text-sm text-muted-foreground">Imported leads are assigned to you (your role can&apos;t assign leads to others).</p>
  const modes = [
    { value: "agent", label: "One sales agent" },
    ...(setup.rules.length ? [{ value: "rule", label: "Share out with an assignment rule" }] : []),
    { value: "rules", label: "CRM assignment rules, then round robin" },
    { value: "round-robin", label: "Round robin among all agents" },
    { value: "none", label: "Leave unassigned" },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="Assign the leads"
        value={v.mode}
        onChange={(mode) => onChange({ mode, agentId: mode === "agent" ? (v.agentId ?? setup.agents[0]?.value) : undefined, ruleId: mode === "rule" ? (v.ruleId ?? setup.rules[0]?.value) : undefined })}
        options={modes}
      />
      {v.mode === "agent" && <Select label="Sales agent" value={v.agentId ?? ""} onChange={(agentId) => onChange({ ...v, agentId })} options={setup.agents} />}
      {v.mode === "rule" && <Select label="Rule" value={v.ruleId ?? ""} onChange={(ruleId) => onChange({ ...v, ruleId })} options={setup.rules} />}
    </div>
  )
}
