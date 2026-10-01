"use client"

import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Notice } from "@/modules/users/components/user-parts"
import { Icon } from "@/components/ui/icon"

// Drop zone + file picker that uploads each chosen file and reports progress
export function Uploader({ accept, label, hint, upload, onDone, className }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const [errors, setErrors] = useState([])
  const run = async (files) => {
    const list = [...files]
    if (!list.length) return
    setErrors([])
    const failed = []
    for (const [i, file] of list.entries()) {
      setProgress({ done: i, total: list.length })
      const data = new FormData()
      data.set("file", file)
      const result = await upload(data)
      if (result?.error) failed.push(result.error)
    }
    setProgress(null)
    setErrors(failed)
    onDone(list.length - failed.length)
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          run(e.dataTransfer.files)
        }}
        disabled={Boolean(progress)}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          over ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <Icon name={progress ? "loader-4-line" : "upload-cloud-2-line"} className={cn("text-2xl text-primary", progress && "animate-spin")} />
        <span className="font-medium">{progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </button>
      <input ref={input} type="file" multiple accept={accept} className="sr-only" onChange={(e) => run(e.target.files).finally(() => (e.target.value = ""))} />
      {errors.length > 0 && <Notice tone="error">{errors.length === 1 ? errors[0] : `${errors.length} files weren't added: ${errors.join(" ")}`}</Notice>}
    </div>
  )
}
