/**
 * Framework-agnostic SVG renderer: `ResolvedLayout` -> a standalone `<svg>`
 * string. Crisp at any scale, no runtime, and the natural target for the CLI's
 * file exports. Reads only `ResolvedLayout`.
 */
import type { Placement, ResolvedLayout } from '@engine/types'

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const FONT = 'system-ui,-apple-system,&quot;Segoe UI&quot;,Roboto,sans-serif'
const WEIGHT: Record<string, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
}
const isImg = (s: string) => s.startsWith('data:') || /^https?:\/\//.test(s)
const isGradient = (s: string) =>
  s.startsWith('linear-gradient') || s.startsWith('radial-gradient')

export interface SvgOptions {
  brandColor?: string
  /** Emit an XML prolog + doctype (for a .svg file). Default false. */
  standalone?: boolean
}

export function renderToSvg(layout: ResolvedLayout, opts: SvgOptions = {}): string {
  const { surface } = layout
  const brand = opts.brandColor ?? '#4361ee'
  const defs: string[] = []
  const body: string[] = []
  let gradId = 0

  for (const p of layout.placements.slice().sort((a, b) => a.z - b.z)) {
    body.push(renderPlacement(p, brand, defs, () => `g${gradId++}`))
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${surface.w}" height="${surface.h}" viewBox="0 0 ${surface.w} ${surface.h}" font-family="${FONT}">
<rect width="${surface.w}" height="${surface.h}" fill="#ffffff"/>
${defs.length ? `<defs>\n${defs.join('\n')}\n</defs>` : ''}
${body.join('\n')}
</svg>`

  return opts.standalone ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n` : svg
}

function renderPlacement(
  p: Placement,
  brand: string,
  defs: string[],
  nextId: () => string,
): string {
  const r = p.rect

  if (p.role === 'background') {
    if (p.kind === 'image' && p.image && isImg(p.content)) {
      return coverImage(p.content, r, p.image.crop, `bg-${p.id}`, defs)
    }
    if (isGradient(p.content)) {
      const id = nextId()
      defs.push(gradientDef(id, p.content))
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#${id})"/>`
    }
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${esc(p.content || '#e5e7eb')}"/>`
  }

  if (p.kind === 'image' && p.image && isImg(p.content)) {
    return p.image.objectFit === 'contain'
      ? `<image x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" href="${esc(p.content)}" preserveAspectRatio="xMidYMid meet"/>`
      : coverImage(p.content, r, p.image.crop, `img-${p.id}`, defs)
  }

  const t = p.text
  if (!t) return ''
  const c = p.colors

  if (p.role === 'cta') {
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    return `<g>
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="${esc(brand)}"/>
  <text x="${cx}" y="${cy}" fill="${c?.fg ?? '#fff'}" font-size="${t.fontPx}" font-weight="${WEIGHT[t.weight]}" letter-spacing="${t.letterSpacing}em" text-anchor="middle" dominant-baseline="central"${t.transform === 'uppercase' ? ' style="text-transform:uppercase"' : ''}>${esc(t.lines.join(' '))}</text>
</g>`
  }

  const clipId = `clip-${p.id}`
  defs.push(
    `<clipPath id="${clipId}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`,
  )
  const scrim = c?.scrim
    ? `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${c.scrim.color}" opacity="${c.scrim.opacity}"/>`
    : ''
  const lh = t.fontPx * t.lineHeight
  const lines = t.lines
    .map((l, i) => `<tspan x="${r.x + 1}" y="${r.y + t.fontPx + i * lh}">${esc(l)}</tspan>`)
    .join('')
  return `<g clip-path="url(#${clipId})">
  ${scrim}
  <text fill="${c?.fg ?? '#111'}" font-size="${t.fontPx}" font-weight="${WEIGHT[t.weight]}" letter-spacing="${t.letterSpacing}em"${t.transform === 'uppercase' ? ' style="text-transform:uppercase"' : ''}>${lines}</text>
</g>`
}

/** Draw an image so its normalized `crop` region fills `r`, clipped to `r`. */
function coverImage(
  href: string,
  r: { x: number; y: number; w: number; h: number },
  crop: { x: number; y: number; w: number; h: number },
  id: string,
  defs: string[],
): string {
  const w = crop.w > 0 ? r.w / crop.w : r.w
  const h = crop.h > 0 ? r.h / crop.h : r.h
  const x = r.x - crop.x * w
  const y = r.y - crop.y * h
  defs.push(
    `<clipPath id="cx-${id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`,
  )
  return `<g clip-path="url(#cx-${id})"><image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(href)}" preserveAspectRatio="none"/></g>`
}

function gradientDef(id: string, token: string): string {
  // linear-gradient(135deg, #a, #b)  /  radial-gradient(...)
  const m = token.match(/gradient\(([^)]*)\)/)
  const parts = (m ? m[1] : '').split(',').map((s) => s.trim())
  const stops: string[] = []
  let angle = 135
  for (const part of parts) {
    if (/^-?\d+deg$/.test(part)) angle = parseInt(part, 10)
    else if (/^#|rgb/.test(part)) stops.push(part)
  }
  if (stops.length < 2) stops.push('#cccccc', '#999999')
  const rad = ((angle - 90) * Math.PI) / 180
  const x2 = (50 + Math.cos(rad) * 50).toFixed(1)
  const y2 = (50 + Math.sin(rad) * 50).toFixed(1)
  const stopEls = stops
    .map(
      (s, i) =>
        `<stop offset="${((i / (stops.length - 1)) * 100).toFixed(0)}%" stop-color="${esc(s)}"/>`,
    )
    .join('')
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${x2}%" y2="${y2}%">${stopEls}</linearGradient>`
}
