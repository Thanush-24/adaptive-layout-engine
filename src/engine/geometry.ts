import type { Rect, SafeArea } from './types'

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Round to a whole pixel; keeps resolved layouts deterministic across runs. */
export const px = (v: number): number => Math.round(v * 100) / 100

export const rect = (x: number, y: number, w: number, h: number): Rect => ({
  x: px(x),
  y: px(y),
  w: px(w),
  h: px(h),
})

export const area = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h)

export const aspectOf = (r: Rect): number => (r.h === 0 ? 0 : r.w / r.h)

/** Shrink a rect by a uniform inset (or per-edge safe area). */
export function inset(r: Rect, by: number | SafeArea): Rect {
  const s: SafeArea = typeof by === 'number' ? { top: by, right: by, bottom: by, left: by } : by
  return rect(r.x + s.left, r.y + s.top, r.w - s.left - s.right, r.h - s.top - s.bottom)
}

export function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const btm = Math.min(a.y + a.h, b.y + b.h)
  return rect(x, y, Math.max(0, r - x), Math.max(0, btm - y))
}

/** Overlap area of two rects (0 when disjoint). */
export function overlapArea(a: Rect, b: Rect): number {
  return area(intersection(a, b))
}

/** True when `inner` is fully contained by `outer` within `tol` px. */
export function contains(outer: Rect, inner: Rect, tol = 0.5): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  )
}

/** How far (px) `inner` pokes outside `outer`, summed over all four edges. */
export function breach(outer: Rect, inner: Rect): number {
  return (
    Math.max(0, outer.x - inner.x) +
    Math.max(0, outer.y - inner.y) +
    Math.max(0, inner.x + inner.w - (outer.x + outer.w)) +
    Math.max(0, inner.y + inner.h - (outer.y + outer.h))
  )
}

/** Place a `w x h` box inside `within`, aligned per axis. */
export function alignIn(
  within: Rect,
  w: number,
  h: number,
  ax: 'start' | 'center' | 'end',
  ay: 'start' | 'center' | 'end',
): Rect {
  const x =
    ax === 'start'
      ? within.x
      : ax === 'end'
        ? within.x + within.w - w
        : within.x + (within.w - w) / 2
  const y =
    ay === 'start'
      ? within.y
      : ay === 'end'
        ? within.y + within.h - h
        : within.y + (within.h - h) / 2
  return rect(x, y, w, h)
}
