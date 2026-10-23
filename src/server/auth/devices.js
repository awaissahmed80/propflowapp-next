// "Chrome on Mac" from a browser's user agent, with an icon, for lists of signed-in browsers
export function describeDevice(ua = "") {
  const s = String(ua ?? "")
  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /Windows/.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /CrOS/.test(s)
              ? "Chromebook"
              : /Linux/.test(s)
                ? "Linux"
                : null
  const app = /PropFlowDesktop\//.test(s)
    ? "PropFlow app"
    : /Edg\//.test(s)
      ? "Edge"
      : /OPR\/|Opera/.test(s)
        ? "Opera"
        : /SamsungBrowser/.test(s)
          ? "Samsung Internet"
          : /Firefox\/|FxiOS/.test(s)
            ? "Firefox"
            : /CriOS|Chrome\//.test(s)
              ? "Chrome"
              : /Safari\//.test(s)
                ? "Safari"
                : null
  const icon = os === "iPhone" || os === "Android" ? "smartphone-line" : os === "iPad" ? "tablet-line" : os === "Mac" ? "macbook-line" : "computer-line"
  const device = app && os ? `${app} on ${os}` : (app ?? os ?? "Unknown browser")
  return { device, icon }
}
