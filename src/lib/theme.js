// Light / dark / system theme. The choice is kept in localStorage under "theme" (the key
// next-themes used) and, with what it resolved to, in the "pf-theme" cookie
// ("system.dark", "light.light"…) shared by every PropFlow subdomain. The root layout reads the
// cookie and renders <html class="dark|light"> on the server, so the first paint has the right
// theme without any inline script.
export const THEME_KEY = "theme"
export const THEME_COOKIE = "pf-theme"
export const THEMES = ["light", "dark", "system"]

// Cookie value → { theme, resolved }; unknown → system, light
export function parseThemeCookie(value) {
  const [theme, resolved] = String(value ?? "").split(".")
  return { theme: THEMES.includes(theme) ? theme : "system", resolved: resolved === "dark" ? "dark" : "light" }
}
