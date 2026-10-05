import "server-only"
import { nextCode } from "@/server/db/numbering"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { measures, priceFor, standardDimensions } from "../constants"

// Building units, shared by Inventory › Add units and the units import: their codes, and their
// area, dimensions, premiums and prices from size, features and base rate.

// Unit codes per project: SKE-0001, SKE-0002…
export async function unitCodes(trx, projectCode, n) {
  const key = `unit:${projectCode}`
  await trx("sequences").insert({ key, prefix: projectCode, format: "{PREFIX}-{SEQ}", padding: 4, reset: "never", nextValue: 1 }).onConflict("key").ignore()
  const codes = []
  for (let i = 0; i < n; i++) codes.push(await nextCode(trx, key))
  return codes
}

// Area, dimensions, premiums and prices of one unit from its size, features and base rate.
// Files have no features, premiums or dimensions.
export function figures({ type, sizeValue, sizeUnit, features, rate, marlaSqft, featureList, m }) {
  const isFile = type === "file"
  const own = isFile ? [] : [...new Set(features)].filter((f) => isLookupValue(featureList, f) || featureList.some((x) => x.value === f))
  const premiums = own.map((f) => ({ feature: f, percent: Number(featureList.find((x) => x.value === f)?.meta?.premium ?? 0) }))
  const { base, price } = priceFor({ rate, value: sizeValue, unit: sizeUnit, marlaSqft, premiums, m })
  return {
    sizeValue,
    sizeUnit,
    areaSqft: m.areaSqft(sizeValue, sizeUnit, marlaSqft),
    dimensions: isFile || m.sizedInSqft(type) ? null : standardDimensions(marlaSqft, m.sizeInMarla(sizeValue, sizeUnit), "marla"),
    features: JSON.stringify(own),
    premiums: JSON.stringify(premiums),
    baseRate: rate,
    basePrice: base,
    price: isFile ? base : price,
  }
}

// The workspace's sizing rules (Area units, Unit types, Block categories)
export const workspaceMeasures = async (db) => measures(await getLookups(db, ["area-unit", "unit-type", "block-category"]))
export const sizeError = (m, type, unit) => (m.unitsFor(type).includes(unit) ? null : `Size this type in ${m.unitsFor(type).map(m.unitShort).join(", ")}.`)
