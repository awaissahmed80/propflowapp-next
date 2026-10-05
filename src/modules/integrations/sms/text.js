// SMS length, shared by the server and the browser. Plain English text uses the GSM alphabet (160
// characters, 153 per part when longer); anything else, like Urdu or emoji, is Unicode (70, then
// 67 per part). A few GSM characters (^ { } [ ] ~ | € \) take two places.

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXT = "^{}\\[~]|€"
export const SMS_MAX = 800 // characters, the gateway's limit

// → { unicode, chars, parts, left } (left: characters until the next part)
export function smsParts(text = "") {
  const chars = [...String(text)]
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_EXT.includes(c))
  const length = unicode ? chars.length : chars.reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0)
  const [single, multi] = unicode ? [70, 67] : [160, 153]
  const parts = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi)
  const left = length <= single ? single - length : parts * multi - length
  return { unicode, chars: length, parts, left }
}
