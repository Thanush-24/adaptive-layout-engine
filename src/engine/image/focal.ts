/**
 * Focal-point-aware image fitting. Given a source aspect ratio, a focal point and
 * a destination rect, compute the crop that (a) covers the box, (b) keeps the
 * focal point inside the visible area with margin, and (c) minimises discarded
 * source area. Output is expressed both as a normalized crop rect and as the CSS
 * `object-fit` / `object-position` that reproduce it on a plain `<img>`.
 */
import { clamp } from '../geometry'
import type { ImageStyle, Rect, ResolvedImage } from '../types'

const CENTER = { x: 0.5, y: 0.5 }

export function fitImage(
  img: ImageStyle,
  box: Rect,
  opts: { mode?: 'cover' | 'contain' | 'auto' } = {},
): ResolvedImage {
  const focal = img.focal ?? CENTER
  const boxAR = box.w / box.h
  const srcAR = img.aspect

  const mode =
    opts.mode === 'auto' || opts.mode === undefined
      ? img.protect
        ? 'contain'
        : 'cover'
      : opts.mode

  if (mode === 'contain') {
    return {
      crop: { x: 0, y: 0, w: 1, h: 1 },
      objectFit: 'contain',
      objectPosition: '50% 50%',
      cropLoss: 0,
    }
  }

  // cover: one axis fills, the other is cropped around the focal point.
  let cropW = 1
  let cropH = 1
  if (srcAR > boxAR) {
    // source is wider — crop left/right
    cropW = boxAR / srcAR
  } else {
    // source is taller — crop top/bottom
    cropH = srcAR / boxAR
  }

  // Position the crop window so the focal point sits at the same relative spot,
  // clamped so the window stays within the source and keeps >=8% margin to the
  // focal point where possible.
  const margin = 0.08
  const cx = clamp(focal.x, cropW / 2, 1 - cropW / 2)
  const cy = clamp(focal.y, cropH / 2, 1 - cropH / 2)

  let x = clamp(cx - cropW / 2, 0, 1 - cropW)
  let y = clamp(cy - cropH / 2, 0, 1 - cropH)

  // Nudge to respect focal margin if there is slack.
  if (focal.x - x < margin && x > 0) x = Math.max(0, focal.x - margin)
  if (x + cropW - focal.x < margin && x + cropW < 1)
    x = Math.min(1 - cropW, focal.x + margin - cropW)
  if (focal.y - y < margin && y > 0) y = Math.max(0, focal.y - margin)
  if (y + cropH - focal.y < margin && y + cropH < 1)
    y = Math.min(1 - cropH, focal.y + margin - cropH)

  const posX = cropW >= 1 ? 50 : round1((x / (1 - cropW)) * 100)
  const posY = cropH >= 1 ? 50 : round1((y / (1 - cropH)) * 100)

  return {
    crop: { x: round3(x), y: round3(y), w: round3(cropW), h: round3(cropH) },
    objectFit: 'cover',
    objectPosition: `${posX}% ${posY}%`,
    cropLoss: round3(1 - cropW * cropH),
  }
}

/** True when the focal point would be cropped out entirely by `resolved`. */
export function focalClipped(img: ImageStyle, resolved: ResolvedImage): boolean {
  const f = img.focal ?? CENTER
  const c = resolved.crop
  return f.x < c.x || f.x > c.x + c.w || f.y < c.y || f.y > c.y + c.h
}

const round1 = (v: number) => Math.round(v * 10) / 10
const round3 = (v: number) => Math.round(v * 1000) / 1000
