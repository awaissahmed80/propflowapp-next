// Lookup color name → validated chart color (CSS variables in index.css, light + dark)
export const vizColor = (name) => `var(--viz-${name ?? "gray"})`
