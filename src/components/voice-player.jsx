"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// A voice-note player like WhatsApp's: play/pause, a waveform drawn from the recording itself
// (decoded in the browser), click or drag to seek, a countdown and 1× / 1.5× / 2× speed.
// The sound plays through a hidden <audio>; the controls are our own.
//   <VoicePlayer src={url} seconds={12} />   seconds: known length, while the waveform decodes

const BARS = 40
const SPEEDS = [1, 1.5, 2]
const peaksCache = new Map() // src → { peaks, duration }

const clock = (s) => {
  const t = Math.max(0, Math.round(s || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`
}

// Loudness of BARS slices of the recording, 0.15–1
async function loadPeaks(src) {
  if (peaksCache.has(src)) return peaksCache.get(src)
  const Ctx = window.AudioContext || window.webkitAudioContext
  const data = await (await fetch(src, { credentials: "same-origin" })).arrayBuffer()
  const ctx = new Ctx()
  try {
    const buf = await ctx.decodeAudioData(data)
    const ch = buf.getChannelData(0)
    const size = Math.max(1, Math.floor(ch.length / BARS))
    const raw = Array.from({ length: BARS }, (_, i) => {
      let sum = 0
      for (let j = i * size; j < Math.min(ch.length, (i + 1) * size); j++) sum += ch[j] * ch[j]
      return Math.sqrt(sum / size)
    })
    const max = Math.max(...raw, 0.0001)
    const out = { peaks: raw.map((v) => 0.15 + 0.85 * (v / max)), duration: buf.duration }
    peaksCache.set(src, out)
    return out
  } finally {
    ctx.close?.()
  }
}

// Gentle placeholder bars until (or if) the real ones can't be decoded
const placeholder = Array.from({ length: BARS }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 0.9)) + 0.15 * Math.abs(Math.sin(i * 2.3)))

export function VoicePlayer({ src, seconds = 0, className }) {
  const audio = useRef(null)
  const track = useRef(null)
  const [wave, setWave] = useState(() => peaksCache.get(src) ?? null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [failed, setFailed] = useState(false)
  const duration = wave?.duration || seconds || 0
  const progress = duration ? Math.min(1, time / duration) : 0

  // Draw the real waveform (and learn the true length: recorded WebM often has none)
  useEffect(() => {
    let off = false
    if (!peaksCache.has(src))
      loadPeaks(src)
        .then((w) => !off && setWave(w))
        .catch(() => {})
    return () => {
      off = true
    }
  }, [src])

  // Smooth progress while playing (timeupdate alone is jumpy)
  useEffect(() => {
    if (!playing) return undefined
    let id
    const tick = () => {
      setTime(audio.current?.currentTime ?? 0)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing])

  const toggle = async () => {
    const a = audio.current
    if (!a) return
    if (playing) return a.pause()
    // Only one voice note plays at a time
    document.querySelectorAll("audio[data-voice-note]").forEach((x) => x !== a && x.pause())
    try {
      if (duration && a.currentTime >= duration - 0.05) a.currentTime = 0
      a.playbackRate = speed
      await a.play()
    } catch {
      setFailed(true)
    }
  }
  const seekTo = (fraction) => {
    const a = audio.current
    if (!a || !duration) return
    a.currentTime = Math.max(0, Math.min(duration, fraction * duration))
    setTime(a.currentTime)
  }
  const seekFromPointer = (e) => {
    const r = track.current.getBoundingClientRect()
    seekTo((e.clientX - r.left) / r.width)
  }
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (audio.current) audio.current.playbackRate = next
  }

  const peaks = wave?.peaks ?? placeholder
  const at = Math.floor(progress * BARS)

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <audio
        ref={audio}
        data-voice-note
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setTime(duration)
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-lg text-primary-foreground shadow-sm transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none"
      >
        {/* Play and pause cross-fade with a little scale */}
        <Icon name="play-fill" className={cn("absolute translate-x-px transition-all duration-200", playing ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
        <Icon name="pause-fill" className={cn("absolute transition-all duration-200", playing ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
      </button>

      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Voice note position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromPointer(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
        onKeyDown={(e) => {
          const step = { ArrowRight: 5, ArrowLeft: -5 }[e.key]
          if (step) seekTo((time + step) / (duration || 1))
          else if (e.key === "Home") seekTo(0)
          else if (e.key === "End") seekTo(1)
          else if (e.key === " " || e.key === "Enter") toggle()
          else return
          e.preventDefault()
        }}
        className="flex h-8 min-w-0 flex-1 cursor-pointer touch-none items-center gap-[2px] rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {peaks.map((p, i) => (
          <span
            key={i}
            className={cn(
              "min-w-[2px] flex-1 rounded-full transition-[background-color,transform] duration-150",
              i < at ? "bg-primary" : "bg-foreground/20",
              playing && i === at && "bg-primary motion-safe:animate-pulse",
            )}
            style={{ height: `${Math.round(p * 100)}%`, transform: playing && i === at ? "scaleY(1.15)" : undefined }}
          />
        ))}
      </div>

      <span className="w-9 shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">{failed ? "—" : clock(playing || time ? duration - time : duration)}</span>
      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Playback speed ${speed}×`}
        className="h-6 shrink-0 cursor-pointer rounded-full bg-foreground/10 px-2 text-[11px] font-semibold tabular-nums transition-colors outline-none hover:bg-foreground/15 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {speed}×
      </button>
    </div>
  )
}
