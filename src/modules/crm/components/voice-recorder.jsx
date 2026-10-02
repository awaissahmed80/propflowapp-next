"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// Record a short voice note in the browser, like WhatsApp: tap the mic, speak, tap ✓.
// onDone({ blob, url, seconds, type }) once finished; the caller shows and uploads it.
// WebM/Opus where the browser can (Chrome, Android), MP4/AAC otherwise (Safari, iPhone).
const MAX_SECONDS = 5 * 60
const pickType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? ""
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

export function VoiceRecorder({ onDone, onRecordingChange, className }) {
  const [state, setState] = useState("idle") // idle | starting | recording
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState("")
  const rec = useRef(null) // { recorder, stream, chunks, started, timer, cancelled }

  const stopTracks = () => rec.current?.stream?.getTracks().forEach((t) => t.stop())
  useEffect(
    () => () => {
      clearInterval(rec.current?.timer)
      stopTracks()
    },
    [],
  )

  const setRecording = (on) => {
    setState(on ? "recording" : "idle")
    onRecordingChange?.(on)
  }

  const start = async () => {
    setError("")
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setError("This browser can't record audio.")
    setState("starting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = pickType()
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const r = { recorder, stream, chunks: [], started: Date.now(), cancelled: false }
      recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data)
      recorder.onstop = () => {
        clearInterval(r.timer)
        stopTracks()
        setRecording(false)
        if (r.cancelled || !r.chunks.length) return
        const blob = new Blob(r.chunks, { type: recorder.mimeType || type || "audio/webm" })
        onDone({ blob, url: URL.createObjectURL(blob), seconds: Math.round((Date.now() - r.started) / 1000), type: blob.type })
      }
      r.timer = setInterval(() => {
        const s = (Date.now() - r.started) / 1000
        setSeconds(s)
        if (s >= MAX_SECONDS) recorder.stop()
      }, 250)
      rec.current = r
      setSeconds(0)
      recorder.start()
      setRecording(true)
    } catch (err) {
      setState("idle")
      setError(err?.name === "NotAllowedError" ? "Microphone access is blocked. Allow it from the address bar to record." : "Couldn't start the microphone.")
    }
  }
  const finish = (cancel = false) => {
    if (!rec.current) return
    rec.current.cancelled = cancel
    rec.current.recorder.state !== "inactive" && rec.current.recorder.stop()
  }

  if (state === "recording")
    return (
      <div className={cn("flex min-w-0 flex-1 items-center gap-2", className)} role="status" aria-live="polite">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
        <span className="text-[13px] font-medium text-red-600 tabular-nums dark:text-red-400">Recording {clock(seconds)}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => finish(true)}
          aria-label="Discard recording"
          title="Discard"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="delete-bin-line" />
        </button>
        <button
          type="button"
          onClick={() => finish(false)}
          aria-label="Finish recording"
          title="Done"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Icon name="check-line" />
        </button>
      </div>
    )

  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {error && <span className="text-[12px] text-destructive">{error}</span>}
      <button
        type="button"
        onClick={start}
        disabled={state === "starting"}
        aria-label="Record a voice note"
        title="Record a voice note"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-50"
      >
        <Icon name={state === "starting" ? "loader-3-fill" : "mic-line"} className={cn("text-lg", state === "starting" && "animate-spin")} />
      </button>
    </span>
  )
}
