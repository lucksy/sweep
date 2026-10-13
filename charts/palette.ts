// Chart colors. Every color reaches 3:1 contrast on a dark (#1e1e1e) and a
// light (#ffffff) terminal background; the numbers always print beside them,
// so color never carries meaning alone.

export type Risk = 'safe' | 'caution' | 'review'

export const RISK: Record<Risk, number> = { safe: 0x2e9e4a, caution: 0xc47f00, review: 0xd03b3b }
export const KEPT = 0x6b7280
export const AXIS = 0x737a80
/** The terminal's own foreground or background (bit 24 alone). */
export const NONE = 0x01000000
/** Footprint parts, in a fixed order so a part keeps its color everywhere. */
export const PARTS = [0x1f8fd1, 0xc47f00, 0x8f6bd6, 0x2e9e4a, 0xd0573b, 0x1a9e96, 0xb9488f, 0x7a8a2a]

export const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`

function luminance(c: number) {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f((c >> 16) & 0xff) + 0.7152 * f((c >> 8) & 0xff) + 0.0722 * f(c & 0xff)
}

/** WCAG contrast ratio of two colors. */
export function contrast(a: number, b: number) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
