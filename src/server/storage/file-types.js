// What a file really is, from its first bytes (not its name or the browser's claim).
// Returns { mime, ext, label } for the types we accept, or null.
const SIGNATURES = [
  { mime: "application/pdf", ext: "pdf", label: "PDF", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", label: "PNG", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", label: "JPG", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", label: "WebP", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  // Voice notes as browsers record them: WebM/Opus (Chrome, Android), MP4/AAC (Safari, iPhone), Ogg
  { mime: "audio/webm", ext: "webm", label: "WebM audio", test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { mime: "audio/mp4", ext: "m4a", label: "M4A audio", test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  { mime: "audio/ogg", ext: "ogg", label: "Ogg audio", test: (b) => b.subarray(0, 4).toString("latin1") === "OggS" },
]

export function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null
  const hit = SIGNATURES.find((s) => s.test(buffer))
  return hit ? { mime: hit.mime, ext: hit.ext, label: hit.label } : null
}

// Accepted for proof of payment
export const PROOF_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"]
export const PROOF_MAX_BYTES = 10 * 1024 * 1024

// Voice notes (CRM)
export const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"]
export const VOICE_MAX_BYTES = 5 * 1024 * 1024 // a few minutes of speech
