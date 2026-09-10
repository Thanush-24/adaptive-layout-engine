import type { Archetype, Surface, SafeArea, ViewingDistance } from './types'

const pad = (v: number): SafeArea => ({ top: v, right: v, bottom: v, left: v })

/**
 * Minimum legible cap-height in px for body text, by viewing distance. Derived
 * from the ~0.007 rad angular threshold for comfortable reading, mapped to the
 * canonical distance for each bucket (0.35 m phone, 0.6 m desktop, 2.5 m TV).
 */
export const MIN_LEGIBLE_PX: Record<ViewingDistance, number> = {
  near: 11,
  mid: 13,
  far: 22,
}

export const SURFACES: Surface[] = [
  // ---- Display ----
  s('leaderboard', 'Leaderboard', 728, 90, 'display', pad(6), 'mid'),
  s('mobile-banner', 'Mobile banner', 320, 50, 'display', pad(4), 'near'),
  s('large-mobile', 'Large mobile banner', 320, 100, 'display', pad(6), 'near'),
  s('mpu', 'MPU / medium rectangle', 300, 250, 'display', pad(8), 'near'),
  s('half-page', 'Half page', 300, 600, 'display', pad(10), 'near'),
  s('billboard', 'Billboard', 970, 250, 'display', pad(10), 'mid'),
  s('skyscraper', 'Wide skyscraper', 160, 600, 'display', pad(6), 'near'),
  // ---- Social ----
  s('story', 'Story / Reel', 1080, 1920, 'social', edge(96, 48, 220, 48), 'near', true, true),
  s('feed-square', 'Feed square', 1080, 1080, 'social', pad(64), 'near', true, true),
  s('feed-portrait', 'Feed portrait', 1080, 1350, 'social', pad(72), 'near', true, true),
  s('feed-landscape', 'Feed landscape', 1200, 628, 'social', pad(48), 'near', true, true),
  // ---- Connected TV ----
  s('ctv-1080', 'CTV 1080p', 1920, 1080, 'ctv', pad(96), 'far', true, false),
  s('ctv-720', 'CTV 720p', 1280, 720, 'ctv', pad(64), 'far', true, false),
  // ---- DOOH ----
  s('dooh-portrait', 'DOOH portrait', 1080, 1920, 'dooh', pad(80), 'far', true, false),
  s('dooh-landscape', 'DOOH landscape', 1920, 1080, 'dooh', pad(80), 'far', true, false),
  s('dooh-ultrawide', 'DOOH ultrawide', 3840, 1080, 'dooh', pad(80), 'far', false, false),
  // ---- Native ----
  s('native', 'Native card', 1200, 627, 'native', pad(24), 'near', false, true),
]

export const SURFACE_BY_ID: Record<string, Surface> = Object.fromEntries(
  SURFACES.map((x) => [x.id, x]),
)

function s(
  id: string,
  label: string,
  w: number,
  h: number,
  channel: Surface['channel'],
  safe: SafeArea,
  viewingDistance: ViewingDistance,
  motion = true,
  interactive = true,
): Surface {
  return { id, label, w, h, channel, safe, viewingDistance, motion, interactive }
}

function edge(top: number, right: number, bottom: number, left: number): SafeArea {
  return { top, right, bottom, left }
}

/**
 * Classify a surface into a layout archetype from its shape and size alone.
 * Strategies gate on the archetype; the classifier is intentionally simple and
 * total so its output is easy to reason about in the trace.
 */
export function classify(surface: Surface): Archetype {
  const { w, h } = surface
  const ar = w / h
  const minDim = Math.min(w, h)
  const A = w * h

  // Tiny strips (320×50, 300×50): logo + message + CTA on one line, nothing else.
  if (h <= 66 && ar >= 2.2) return 'micro'
  // Very wide formats.
  if (ar >= 2.4) return A > 500_000 ? 'ultrawide' : 'strip'
  // Wide landscape: 16:9 CTV, 1200×628 social/native, 970×250 billboard-ish.
  if (ar >= 1.55) return minDim <= 200 ? 'strip' : 'landscape'
  // Moderate landscape: 300×250 rectangle, 320×100.
  if (ar > 1.15) return h <= 120 ? 'micro' : 'banner'
  if (ar >= 0.85) return 'square'
  if (ar >= 0.5) return 'portrait'
  return 'vertical'
}

/** Convenience: the archetype's dominant reading axis. */
export function readingAxis(a: Archetype): 'x' | 'y' {
  return a === 'micro' || a === 'strip' || a === 'ultrawide' || a === 'landscape' ? 'x' : 'y'
}
