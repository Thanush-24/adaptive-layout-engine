/**
 * Procedural placeholder art. No external assets: every image is a self-contained
 * SVG data URI with a deliberate off-center focal point and a known mean
 * luminance, so focal-aware cropping and contrast-aware text both have something
 * real to work against.
 */

export interface ArtAsset {
  url: string
  aspect: number
  focal: { x: number; y: number }
  luminance: number
}

const enc = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s{2,}/g, ' ').trim())}`

/** A soft gradient field with a bright "subject" blob at the focal point. */
export function heroField(opts: {
  w?: number
  h?: number
  from: string
  to: string
  subject: string
  focal?: { x: number; y: number }
  luminance: number
}): ArtAsset {
  const w = opts.w ?? 1600
  const h = opts.h ?? 1200
  const f = opts.focal ?? { x: 0.66, y: 0.42 }
  const cx = Math.round(f.x * w)
  const cy = Math.round(f.y * h)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${opts.from}"/>
          <stop offset="1" stop-color="${opts.to}"/>
        </linearGradient>
        <radialGradient id="s" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="${opts.subject}" stop-opacity="0.95"/>
          <stop offset="0.6" stop-color="${opts.subject}" stop-opacity="0.35"/>
          <stop offset="1" stop-color="${opts.subject}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.round(Math.min(w, h) * 0.36)}" fill="url(#s)"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.round(Math.min(w, h) * 0.13)}" fill="${opts.subject}" opacity="0.9"/>
    </svg>`
  return { url: enc(svg), aspect: w / h, focal: f, luminance: opts.luminance }
}

/** A packshot-style asset: a centered object card with its own padding. */
export function packshot(opts: { tint: string; label: string; luminance?: number }): ArtAsset {
  const w = 900
  const h = 1100
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="none"/>
      <g transform="translate(${w / 2},${h / 2})">
        <rect x="-260" y="-360" rx="36" width="520" height="720" fill="${opts.tint}"/>
        <rect x="-200" y="-300" rx="20" width="400" height="480" fill="#ffffff" opacity="0.16"/>
        <circle cx="0" cy="150" r="120" fill="#ffffff" opacity="0.22"/>
        <text x="0" y="330" text-anchor="middle" font-family="system-ui, sans-serif"
              font-size="64" font-weight="800" fill="#ffffff" opacity="0.9">${opts.label}</text>
      </g>
    </svg>`
  return {
    url: enc(svg),
    aspect: w / h,
    focal: { x: 0.5, y: 0.42 },
    luminance: opts.luminance ?? 0.55,
  }
}

export const gradientToken = (from: string, to: string, angle = 135): string =>
  `linear-gradient(${angle}deg, ${from}, ${to})`
