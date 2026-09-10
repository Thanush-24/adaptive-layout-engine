/**
 * A flexible 1D track solver, the primitive every layout strategy is built from.
 *
 * Each track declares a weight plus optional min/max in px. `solveTracks`
 * distributes `total` px by weight, clamps to bounds, then redistributes the
 * slack from clamped tracks across the remainder — iterating to a fixed point.
 * This is the same idea as CSS flex-grow/shrink, kept small and deterministic.
 */
import { clamp, rect } from '../geometry'
import type { Rect } from '../types'

export interface TrackSpec {
  weight: number
  min?: number
  max?: number
}

export function solveTracks(total: number, specs: TrackSpec[], gap = 0): number[] {
  const n = specs.length
  if (n === 0) return []
  const inner = Math.max(0, total - gap * (n - 1))
  const sizes = new Array(n).fill(0)
  const locked = new Array<boolean>(n).fill(false)
  let remaining = inner
  let weightPool = specs.reduce((s, t) => s + Math.max(0, t.weight), 0) || 1

  for (let iter = 0; iter < n + 2; iter++) {
    let changed = false
    let poolThisPass = weightPool
    let remThisPass = remaining
    for (let i = 0; i < n; i++) {
      if (locked[i]) continue
      const w = Math.max(0, specs[i].weight)
      const raw = poolThisPass > 0 ? (remThisPass * w) / poolThisPass : 0
      const lo = specs[i].min ?? 0
      const hi = specs[i].max ?? Infinity
      const clamped = clamp(raw, lo, hi)
      if (clamped !== raw && (clamped === lo || clamped === hi)) {
        sizes[i] = clamped
        locked[i] = true
        remaining -= clamped
        weightPool -= w
        changed = true
      } else {
        sizes[i] = raw
      }
    }
    if (!changed) break
  }

  // Assign whatever is left to the still-unlocked tracks by weight.
  const freeWeight = specs.reduce((s, t, i) => (locked[i] ? s : s + Math.max(0, t.weight)), 0)
  if (freeWeight > 0 && remaining > 0) {
    for (let i = 0; i < n; i++) {
      if (locked[i]) continue
      sizes[i] = (remaining * Math.max(0, specs[i].weight)) / freeWeight
    }
  }
  return sizes.map((v) => Math.max(0, v))
}

/** Split a rect into rows by weighted tracks. */
export function rows(container: Rect, specs: TrackSpec[], gap = 0): Rect[] {
  const hs = solveTracks(container.h, specs, gap)
  const out: Rect[] = []
  let y = container.y
  for (const h of hs) {
    out.push(rect(container.x, y, container.w, h))
    y += h + gap
  }
  return out
}

/** Split a rect into columns by weighted tracks. */
export function cols(container: Rect, specs: TrackSpec[], gap = 0): Rect[] {
  const ws = solveTracks(container.w, specs, gap)
  const out: Rect[] = []
  let x = container.x
  for (const w of ws) {
    out.push(rect(x, container.y, w, container.h))
    x += w + gap
  }
  return out
}
