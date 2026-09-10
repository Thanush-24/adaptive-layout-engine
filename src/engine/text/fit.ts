/**
 * Type fitting: given a string, a box and style bounds, find the largest font
 * size whose greedy-wrapped, line-balanced layout fits — then return the exact
 * lines that will render.
 */
import type { ResolvedText, TextStyle, Weight } from '../types'
import { measureEm, type FontSpec } from './metrics'

export interface FitInput {
  text: string
  boxW: number
  boxH: number
  style: Required<
    Pick<
      TextStyle,
      | 'family'
      | 'weight'
      | 'minPx'
      | 'maxPx'
      | 'maxLines'
      | 'letterSpacing'
      | 'lineHeight'
      | 'transform'
    >
  >
  preferCanvas?: boolean
}

export interface FitResult {
  fits: boolean
  fontPx: number
  lines: string[]
  /** Height the text actually occupies at `fontPx`, in px. */
  usedH: number
  /** Widest line width in px. */
  usedW: number
  /** True when the fitter hit `minPx` and still could not fit. */
  clipped: boolean
}

const spec = (s: FitInput['style']): FontSpec => ({
  family: s.family,
  weight: s.weight as Weight,
  letterSpacing: s.letterSpacing,
})

/** Greedy word wrap at a given font size. Returns the lines. */
function wrap(words: string[], maxEm: number, fs: FontSpec, preferCanvas: boolean): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word
    if (measureEm(trial, fs, preferCanvas) <= maxEm || !cur) {
      cur = trial
    } else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * Rebalance a greedy wrap so line lengths are even (avoids a lonely last word).
 * Tries every line count from the greedy result up to `maxLines` and keeps the
 * arrangement with the lowest raggedness that still fits `maxEm`.
 */
function balance(
  words: string[],
  maxEm: number,
  maxLines: number,
  fs: FontSpec,
  preferCanvas: boolean,
): string[] {
  const greedy = wrap(words, maxEm, fs, preferCanvas)
  if (greedy.length <= 1) return greedy

  let best = greedy
  let bestCost = raggedness(greedy, maxEm, fs, preferCanvas)

  for (let target = greedy.length; target <= Math.min(maxLines, words.length); target++) {
    const packed = packInto(words, target, maxEm, fs, preferCanvas)
    if (!packed) continue
    const cost = raggedness(packed, maxEm, fs, preferCanvas)
    if (cost < bestCost - 1e-6) {
      best = packed
      bestCost = cost
    }
  }
  return best
}

function packInto(
  words: string[],
  targetLines: number,
  maxEm: number,
  fs: FontSpec,
  preferCanvas: boolean,
): string[] | null {
  // Aim for an even em-budget per line, then greedily fill toward it.
  const totalEm = measureEm(words.join(' '), fs, preferCanvas)
  const budget = Math.min(maxEm, (totalEm / targetLines) * 1.06)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    const width = measureEm(trial, fs, preferCanvas)
    if (!cur || (width <= budget && lines.length < targetLines - 0)) {
      cur = trial
    } else if (width <= maxEm && lines.length >= targetLines - 1) {
      cur = trial
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  for (const l of lines) if (measureEm(l, fs, preferCanvas) > maxEm + 1e-6) return null
  return lines
}

function raggedness(
  lines: string[],
  maxEm: number,
  fs: FontSpec,
  preferCanvas: boolean,
): number {
  if (lines.length <= 1) return 0
  const widths = lines.map((l) => measureEm(l, fs, preferCanvas))
  const target = Math.max(...widths)
  let cost = 0
  for (let i = 0; i < widths.length; i++) {
    const slack = target - widths[i]
    // The last line is allowed to be short; penalise it less.
    cost += slack * slack * (i === widths.length - 1 ? 0.35 : 1)
  }
  void maxEm
  return cost
}

/**
 * Binary-search the largest whole-pixel font size in `[minPx, maxPx]` whose
 * balanced wrap fits the box. Always returns renderable lines; `fits`/`clipped`
 * report whether bounds were respected.
 */
export function fitText(input: FitInput): FitResult {
  const { text, boxW, boxH, style, preferCanvas = false } = input
  const content = style.transform === 'uppercase' ? text.toUpperCase() : text
  const words = content.split(/\s+/).filter(Boolean)
  const fs = spec(style)
  const lh = style.lineHeight

  const lo = Math.max(1, Math.floor(style.minPx))
  const hi = Math.max(lo, Math.floor(style.maxPx))

  // Fit to slightly less than the true box: font metrics (especially the table
  // backend) can under-estimate a real browser's rendering by a percent or two,
  // and this keeps text off the edge rather than one glyph past it.
  const safeW = boxW * 0.98

  const evaluate = (px: number): { ok: boolean; lines: string[]; w: number; h: number } => {
    const maxEm = safeW / px
    const lines = balance(words, maxEm, style.maxLines, fs, preferCanvas)
    const widestEm = Math.max(...lines.map((l) => measureEm(l, fs, preferCanvas)), 0)
    const w = widestEm * px
    const h = lines.length * px * lh
    const ok = lines.length <= style.maxLines && w <= safeW + 0.5 && h <= boxH + 0.5
    return { ok, lines, w, h }
  }

  let bestFit: { px: number; lines: string[]; w: number; h: number } | null = null
  let a = lo
  let b = hi
  while (a <= b) {
    const mid = (a + b) >> 1
    const r = evaluate(mid)
    if (r.ok) {
      bestFit = { px: mid, lines: r.lines, w: r.w, h: r.h }
      a = mid + 1
    } else {
      b = mid - 1
    }
  }

  if (bestFit) {
    return {
      fits: true,
      fontPx: bestFit.px,
      lines: bestFit.lines,
      usedW: bestFit.w,
      usedH: bestFit.h,
      clipped: false,
    }
  }

  // Nothing in range fits — render at minPx and report the clip.
  const r = evaluate(lo)
  return {
    fits: false,
    fontPx: lo,
    lines: r.lines,
    usedW: r.w,
    usedH: r.h,
    clipped: true,
  }
}

/** Build the `ResolvedText` the renderer consumes from a fit result + style. */
export function toResolvedText(fit: FitResult, style: FitInput['style']): ResolvedText {
  return {
    lines: fit.lines,
    fontPx: fit.fontPx,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    weight: style.weight as Weight,
    transform: style.transform,
    clipped: fit.clipped,
  }
}
