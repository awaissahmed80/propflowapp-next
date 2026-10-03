import "server-only"
import crypto from "node:crypto"
import { live } from "@/server/db/records"
import { assetUrl } from "@/server/assets"
import { getLookups } from "@/modules/lookups/server"

// Every booking has one private virtual folder (asset_folders, owner_type "booking"), named with
// its code, holding everything about it: documents uploaded against the checklist (Lists & Labels
// › Booking documents), proofs of payment and files attached in its activity. Files in it are
// private: only people who can work the booking open them (see /api/workspace/files).

// The booking's folder, made the first time it's needed → id
export async function ensureBookingFolder(db, booking, userId) {
  const found = await live(db, "assetFolders").where({ ownerType: "booking", ownerId: booking.id }).first("id")
  if (found) return found.id
  const [id] = await db("assetFolders").insert({
    code: crypto.randomBytes(9).toString("base64url").toLowerCase(),
    name: `${booking.code} · ${booking.customerName ?? "Booking"}`.slice(0, 120),
    app: "operations",
    ownerType: "booking",
    ownerId: booking.id,
    createdBy: userId,
  })
  return id
}

// Steps documents can be needed before, in order
export const GATES = ["allotment", "handover", "possession"]

// The checklist for a booking: each document type with what's been uploaded for it
export async function bookingDocuments(db, booking) {
  const [lists, folder] = await Promise.all([getLookups(db, ["booking-document"]), live(db, "assetFolders").where({ ownerType: "booking", ownerId: booking.id }).first("id")])
  const files = folder
    ? await live(db, "assets").where({ folderId: folder.id }).orderBy("createdAt").select("id", "code", "ownerType", "collection", "category", "title", "fileName", "mime", "size", "createdAt", "createdBy")
    : []
  const types = lists["booking-document"].filter((t) => t.isActive)
  const shape = (f) => ({
    code: f.code,
    url: assetUrl(f.code),
    title: f.title,
    name: f.fileName,
    mime: f.mime,
    size: f.size,
    at: f.createdAt,
    by: f.createdBy,
    source: f.ownerType === "receipt" ? "proof" : f.ownerType === "booking-activity" ? (f.collection === "voice" ? "voice" : "activity") : "document",
    category: f.category,
  })
  const all = files.map(shape)
  return {
    checklist: types.map((t) => ({
      key: t.value,
      label: t.label,
      icon: t.icon,
      gate: t.meta?.gate || null,
      required: t.meta?.required === "yes",
      files: all.filter((f) => f.category === t.value),
    })),
    files: all,
  }
}

// Required documents still missing before a step → ["Buyer's CNIC (both sides)", …]
export async function missingFor(db, booking, gate) {
  const { checklist } = await bookingDocuments(db, booking)
  const upTo = GATES.slice(0, GATES.indexOf(gate) + 1)
  return checklist.filter((d) => d.required && d.gate && upTo.includes(d.gate) && !d.files.length).map((d) => d.label)
}
