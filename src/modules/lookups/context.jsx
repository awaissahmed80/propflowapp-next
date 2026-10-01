"use client"

import { createContext, useContext, useMemo } from "react"
import { measures } from "@/modules/estate/constants"
import { activeOptions, defaultValue, lookupMap } from "./options"

// A workspace's pick-lists for an app's pages, loaded once by the app's layout:
//   <LookupsProvider lists={await getLookups(db, keys)} app="estate" canAdd={ctx.can("edit")}> … useList("unit-status")
// app / canAdd: which app these pages are, and whether this person may add values to custom
// lists on the spot (LookupSelect)
const LookupsContext = createContext({ lists: {}, app: null, canAdd: false })

export function LookupsProvider({ lists, app = null, canAdd = false, children }) {
  return <LookupsContext.Provider value={{ lists, app, canAdd }}>{children}</LookupsContext.Provider>
}

export const useLookupsContext = () => useContext(LookupsContext)

// { values, map: { value → { label, color, icon, meta } }, options: active [{ value, label }],
//   label(v), defaultValue: the value forms preselect (or null) }
export function useList(key) {
  const values = useContext(LookupsContext).lists[key] ?? []
  const map = lookupMap(values)
  return { values, map, options: activeOptions(values), label: (v) => map[v]?.label ?? v, defaultValue: defaultValue(values) }
}

// Sizing rules (area units, unit types, block categories) from this workspace's lists; see
// measures() in modules/estate/constants.js
export function useMeasures() {
  const { lists } = useContext(LookupsContext)
  const units = lists["area-unit"]
  const types = lists["unit-type"]
  const cats = lists["block-category"]
  return useMemo(() => measures({ "area-unit": units, "unit-type": types, "block-category": cats }), [units, types, cats])
}
