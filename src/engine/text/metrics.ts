/**
 * Text measurement with two backends that agree to within a few percent:
 *
 *  - **Canvas** (`measureText`) when a 2D context is available (browser, or Node
 *    with `node-canvas` — not a dependency here, so effectively browser-only).
 *  - **Metrics table** everywhere else. Per-family average advance widths keyed by
 *    character class, calibrated against Chrome's rendering of the bundled system
 *    stack. This keeps `resolveLayout` deterministic in tests and on the server.
 *
 * All widths are returned in `em` (multiply by font size in px).
 */
import type { Weight } from '../types'

export interface FontSpec {
  family: string
  weight: Weight
  letterSpacing: number // em
}

interface FamilyMetrics {
  /** Mean advance width in em for the character class. */
  lower: number
  upper: number
  digit: number
  space: number
  wide: number // m, w, @
  narrow: number // i, l, j, t, f, r
  punct: number
  /** Extra advance per unit of numeric font weight above 400, in em. */
  weightGain: number
  /** Cap height as a fraction of font size (for baseline math). */
  capHeight: number
}

const SYSTEM: FamilyMetrics = {
  lower: 0.502,
  upper: 0.63,
  digit: 0.55,
  space: 0.25,
  wide: 0.83,
  narrow: 0.29,
  punct: 0.31,
  weightGain: 0.02,
  capHeight: 0.71,
}

const TABLE: Record<string, FamilyMetrics> = {
  system: SYSTEM,
  'ui-sans': SYSTEM,
  inter: { ...SYSTEM, lower: 0.515, upper: 0.64, wide: 0.85 },
  'ui-serif': { ...SYSTEM, lower: 0.49, upper: 0.66, narrow: 0.31, weightGain: 0.024 },
  'ui-monospace': {
    lower: 0.6,
    upper: 0.6,
    digit: 0.6,
    space: 0.6,
    wide: 0.6,
    narrow: 0.6,
    punct: 0.6,
    weightGain: 0,
    capHeight: 0.68,
  },
}

const WEIGHT_NUM: Record<Weight, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
}

const WIDE = new Set(['m', 'w', 'M', 'W', '@', '—'])
const NARROW = new Set(['i', 'l', 'j', 't', 'f', 'r', 'I', "'", '|', '!', '.', ',', ';', ':'])

function familyKey(family: string): string {
  const first = family.toLowerCase().split(',')[0].trim().replace(/["']/g, '')
  if (first in TABLE) return first
  if (first.includes('mono')) return 'ui-monospace'
  if (first.includes('serif') && !first.includes('sans')) return 'ui-serif'
  if (first.includes('inter')) return 'inter'
  return 'system'
}

function classWidth(ch: string, m: FamilyMetrics): number {
  if (ch === ' ' || ch === ' ') return m.space
  if (WIDE.has(ch)) return m.wide
  if (NARROW.has(ch)) return m.narrow
  if (ch >= '0' && ch <= '9') return m.digit
  if (ch >= 'a' && ch <= 'z') return m.lower
  if (ch >= 'A' && ch <= 'Z') return m.upper
  if (/[\s]/.test(ch)) return m.space
  if (/[.,;:!?'"()[\]{}\-–/]/.test(ch)) return m.punct
  return m.lower // default for accented / non-latin letters
}

// ---- Canvas backend (browser) ----

let ctx: CanvasRenderingContext2D | null | undefined

function canvasCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx
  try {
    if (typeof document === 'undefined') {
      ctx = null
    } else {
      const c = document.createElement('canvas')
      ctx = c.getContext('2d')
    }
  } catch {
    ctx = null
  }
  return ctx ?? null
}

const cssFamily = (key: string): string => {
  switch (key) {
    case 'ui-serif':
      return 'ui-serif, Georgia, serif'
    case 'ui-monospace':
      return 'ui-monospace, SFMono-Regular, Menlo, monospace'
    case 'inter':
      return 'Inter, system-ui, sans-serif'
    default:
      return 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  }
}

/**
 * Width of `text` in em at the given spec. Deterministic: the table backend is
 * used unless `preferCanvas` is set and a context exists.
 */
export function measureEm(text: string, spec: FontSpec, preferCanvas = false): number {
  const key = familyKey(spec.family)

  if (preferCanvas) {
    const c = canvasCtx()
    if (c) {
      c.font = `${WEIGHT_NUM[spec.weight]} 100px ${cssFamily(key)}`
      const w = c.measureText(text).width / 100
      return w + spec.letterSpacing * Math.max(0, text.length - 1)
    }
  }

  const m = TABLE[key] ?? SYSTEM
  const wGain = ((WEIGHT_NUM[spec.weight] - 400) / 100) * m.weightGain
  let sum = 0
  for (const ch of text) sum += classWidth(ch, m) + wGain
  sum += spec.letterSpacing * Math.max(0, [...text].length - 1)
  return sum
}

export function capHeightEm(family: string): number {
  return (TABLE[familyKey(family)] ?? SYSTEM).capHeight
}

/** Reset cached canvas context — test helper only. */
export function __resetMetricsCache(): void {
  ctx = undefined
}
