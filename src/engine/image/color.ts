/**
 * Color math for contrast-aware text and scrims. Pure sRGB / WCAG 2.1.
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h.slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function toHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.round(clamp255(v)).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Relative luminance in [0..1] per WCAG. */
export function luminance(rgb: RGB): number {
  const chan = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b)
}

/** Luminance directly from a hex string, or from a raw [0..1] value token. */
export function luminanceOf(input: string | number): number {
  if (typeof input === 'number') return clamp01(input)
  if (/^#?[0-9a-f]{3,8}$/i.test(input.trim())) return luminance(parseHex(input))
  return 0.5
}

export function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const WHITE_L = 1
const BLACK_L = 0

export interface ForegroundChoice {
  fg: string
  bgLuminance: number
  contrast: number
  scrim?: { color: string; opacity: number }
}

/**
 * Pick black or white text for a background of luminance `bgL`, adding the
 * lightest scrim needed to clear `targetContrast` (default 4.5, WCAG AA body).
 *
 * `volatile` marks a background whose luminance is only a mean (an image, not a
 * solid). There the real background swings around `bgL`, so we demand extra
 * headroom and lay down a protective scrim whenever contrast is merely adequate.
 */
export function chooseForeground(
  bgL: number,
  targetContrast = 4.5,
  volatile = false,
): ForegroundChoice {
  const whiteC = contrastRatio(WHITE_L, bgL)
  const blackC = contrastRatio(BLACK_L, bgL)
  const useWhite = whiteC >= blackC
  const fg = useWhite ? '#ffffff' : '#0b0b0c'
  const rawContrast = useWhite ? whiteC : blackC

  // For a volatile (image) background the true luminance swings around the mean.
  // Design for the adverse excursion — the patch that drifts toward the text
  // color and so erodes contrast most.
  const SWING = 0.28
  const designL = volatile
    ? useWhite
      ? Math.min(1, bgL + SWING)
      : Math.max(0, bgL - SWING)
    : bgL
  const designContrast = contrastRatio(useWhite ? WHITE_L : BLACK_L, designL)

  if (designContrast >= targetContrast) {
    return { fg, bgLuminance: round3(bgL), contrast: round2(rawContrast) }
  }

  // Solve for the scrim opacity that pushes the *design* luminance far enough.
  //   L' = (1 - a) * designL + a * scrimL
  const scrimL = useWhite ? 0 : 1
  let aLo = 0
  let aHi = 1
  for (let i = 0; i < 24; i++) {
    const a = (aLo + aHi) / 2
    const effL = (1 - a) * designL + a * scrimL
    const c = contrastRatio(useWhite ? WHITE_L : BLACK_L, effL)
    if (c >= targetContrast) aHi = a
    else aLo = a
  }
  const opacity = round2(clamp01(aHi))
  const effL = (1 - opacity) * designL + opacity * scrimL
  return {
    fg,
    bgLuminance: round3(bgL),
    contrast: round2(contrastRatio(useWhite ? WHITE_L : BLACK_L, effL)),
    scrim: { color: scrimL === 0 ? '#000000' : '#ffffff', opacity },
  }
}

/** Mix two hex colors, `t` in [0..1] toward `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  })
}

/** A readable on-color for a brand fill (used for CTA label text). */
export function onColor(fillHex: string): string {
  return chooseForeground(luminance(parseHex(fillHex)), 3).fg
}

const round2 = (v: number) => Math.round(v * 100) / 100
const round3 = (v: number) => Math.round(v * 1000) / 1000
