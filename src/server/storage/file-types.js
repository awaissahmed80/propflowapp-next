// What a file really is, from its first bytes (not its name or the browser's claim).
// Returns { mime, ext, label } for the types we accept, or null.
const SIGNATURES = [
  { mime: "application/pdf", ext: "pdf", label: "PDF", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", label: "PNG", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", label: "JPG", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", label: "WebP", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
]

export function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null
  const hit = SIGNATURES.find((s) => s.test(buffer))
  return hit ? { mime: hit.mime, ext: hit.ext, label: hit.label } : null
}

// Accepted for proof of payment
export const PROOF_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"]
export const PROOF_MAX_BYTES = 10 * 1024 * 1024
