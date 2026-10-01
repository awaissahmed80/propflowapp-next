// Helpers for pick-list values from getLookups(), on the server or in the browser
export const activeOptions = (values = []) => values.filter((v) => v.isActive).map((v) => ({ value: v.value, label: v.label }))
export const labelOf = (values = [], value) => values.find((v) => v.value === value)?.label ?? null
export const lookupMap = (values = []) => Object.fromEntries(values.map((v) => [v.value, v]))
// The value forms preselect (chosen in Lists & Labels), if it's still on
export const defaultValue = (values = []) => values.find((v) => v.preselected && v.isActive)?.value ?? null
