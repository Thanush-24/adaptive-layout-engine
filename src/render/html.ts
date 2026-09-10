/**
 * Framework-agnostic renderer: `ResolvedLayout` -> a self-contained HTML string.
 *
 * The same geometry the React component uses, emitted as inline-styled divs so a
 * resolved ad can be exported, server-rendered, or dropped into an email without
 * any runtime. No engine internals leak in — this only reads `ResolvedLayout`.
 */
import type { Placement, ResolvedLayout } from '../engine/types'

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const isGradient = (s: string): boolean =>
  s.startsWith('linear-gradient') || s.startsWith('radial-gradient')
const isImageUrl = (s: string): boolean => s.startsWith('data:') || /^https?:\/\//.test(s)

function elementHtml(p: Placement, brandColor: string): string {
  const { rect: r } = p
  const base = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`

  if (p.role === 'background') {
    if (p.kind === 'image' && p.image && isImageUrl(p.content)) {
      return `<img alt="" src="${esc(p.content)}" style="${base}object-fit:${p.image.objectFit};object-position:${p.image.objectPosition};z-index:0"/>`
    }
    const bg = isGradient(p.content) ? p.content : p.content
    return `<div style="${base}background:${esc(bg)};z-index:0"></div>`
  }

  if (p.kind === 'image' && p.image) {
    return `<img alt="" src="${esc(p.content)}" style="${base}object-fit:${p.image.objectFit};object-position:${p.image.objectPosition};z-index:${p.z}"/>`
  }

  const c = p.colors
  const t = p.text
  if (!t) return ''
  const scrim = c?.scrim
    ? `<div style="position:absolute;inset:0;background:${c.scrim.color};opacity:${c.scrim.opacity}"></div>`
    : ''

  if (p.role === 'cta') {
    return `<div style="${base}display:flex;align-items:center;justify-content:center;background:${esc(
      brandColor,
    )};border-radius:8px;z-index:${p.z}">
      <span style="color:${c?.fg ?? '#fff'};font:${weight(t.weight)} ${t.fontPx}px/${t.lineHeight} ${FONT};letter-spacing:${t.letterSpacing}em;text-transform:${t.transform};white-space:nowrap">${esc(
        t.lines.join(' '),
      )}</span>
    </div>`
  }

  const align = 'left'
  const lines = t.lines.map((l) => esc(l)).join('<br/>')
  return `<div style="${base}z-index:${p.z};overflow:hidden">
    ${scrim}
    <div style="position:relative;color:${c?.fg ?? '#111'};font:${weight(t.weight)} ${t.fontPx}px/${t.lineHeight} ${FONT};letter-spacing:${t.letterSpacing}em;text-transform:${t.transform};text-align:${align}">${lines}</div>
  </div>`
}

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
const weight = (w: string): number =>
  ({ regular: 400, medium: 500, semibold: 600, bold: 700, black: 900 })[w] ?? 400

export interface RenderOptions {
  brandColor?: string
  /** Wrap in a full HTML document. Default false (fragment only). */
  document?: boolean
}

export function renderToHtml(layout: ResolvedLayout, opts: RenderOptions = {}): string {
  const { surface } = layout
  const brand = opts.brandColor ?? '#4361ee'
  const body = layout.placements
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((p) => elementHtml(p, brand))
    .join('\n')

  const frame = `<div style="position:relative;width:${surface.w}px;height:${surface.h}px;overflow:hidden;background:#fff;font-family:${FONT}">
${body}
</div>`

  if (!opts.document) return frame
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${esc(layout.creativeId)} — ${esc(surface.label)} ${surface.w}×${surface.h}</title>
<style>*{margin:0;box-sizing:border-box}body{display:grid;place-items:center;min-height:100vh;background:#f4f4f5}</style>
</head><body>
${frame}
</body></html>`
}
