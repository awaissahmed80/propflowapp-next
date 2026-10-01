// Lookup colour name → validated chart colour (CSS variables in index.css, light + dark)
export const vizColor = (name) => `var(--viz-${name ?? "gray"})`
