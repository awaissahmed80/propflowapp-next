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

// Word and Excel files (.docx, .xlsx) are zip archives: only recognized when the caller passes
// the file's name (so other apps never accept them) and the archive holds that format's parts.
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const OFFICE = [
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word", part: "word/" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel", part: "xl/" },
]
function officeType(buffer, name) {
  const ext = String(name ?? "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1]
  const kind = OFFICE.find((o) => o.ext === ext)
  if (!kind || !buffer.subarray(0, 4).equals(ZIP)) return null
  // Zip entry names are stored as plain text in each local header: look for the format's folder
  // and the package's [Content_Types].xml
  if (!buffer.includes("[Content_Types].xml", 0, "latin1") || !buffer.includes(kind.part, 0, "latin1")) return null
  return { mime: kind.mime, ext: kind.ext, label: kind.label }
}

//   name: the file's name, only needed to recognize Word and Excel files
export function detectFileType(buffer, name = null) {
  if (!buffer || buffer.length < 12) return null
  const hit = SIGNATURES.find((s) => s.test(buffer))
  if (hit) return { mime: hit.mime, ext: hit.ext, label: hit.label }
  return name ? officeType(buffer, name) : null
}

// Accepted for proof of payment
export const PROOF_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"]
export const PROOF_MAX_BYTES = 10 * 1024 * 1024

// Voice notes (CRM)
export const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"]
export const VOICE_MAX_BYTES = 5 * 1024 * 1024 // a few minutes of speech

// Documents app: PDFs, photos and scans, Word and Excel files, up to 20 MB each
export const DOCUMENT_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", ...OFFICE.map((o) => o.mime)]
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024
