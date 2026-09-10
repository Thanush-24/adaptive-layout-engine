// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdSurface } from './react/AdSurface'
import { renderToHtml } from './html'
import { renderToSvg } from './svg'
import { resolveLayout } from '@engine/resolve'
import { SURFACES, SURFACE_BY_ID } from '@engine/surfaces'
import { CREATIVES } from '@data/creatives'

const creative = CREATIVES[0]
const surface = SURFACE_BY_ID['mpu']
const layout = resolveLayout(creative, surface)

describe('AdSurface (React)', () => {
  it('renders every non-dropped placement', () => {
    const html = renderToStaticMarkup(
      <AdSurface layout={layout} brandColor={creative.brandColor} width={300} />,
    )
    // headline text should appear
    expect(html).toContain('summer')
    // CTA fill uses the brand color
    expect(html).toContain(creative.brandColor)
  })

  it('draws debug overlays only when asked', () => {
    const plain = renderToStaticMarkup(
      <AdSurface layout={layout} brandColor={creative.brandColor} width={300} />,
    )
    const debug = renderToStaticMarkup(
      <AdSurface
        layout={layout}
        brandColor={creative.brandColor}
        width={300}
        debug={{ safeArea: true, boxes: true }}
      />,
    )
    expect(debug.length).toBeGreaterThan(plain.length)
  })
})

describe('renderToHtml (framework-agnostic)', () => {
  it('produces a standalone document with the surface dimensions', () => {
    const doc = renderToHtml(layout, { brandColor: creative.brandColor, document: true })
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain(`${surface.w}px`)
    expect(doc).toContain('Shop the sale')
  })

  it('escapes user content', () => {
    const evil = {
      ...creative,
      elements: creative.elements.map((e) =>
        e.role === 'headline' ? { ...e, content: '<script>alert(1)</script>' } : e,
      ),
    }
    const out = renderToHtml(resolveLayout(evil, surface), { brandColor: '#000' })
    expect(out).not.toContain('<script>alert(1)</script>')
  })
})

describe('renderToSvg', () => {
  it('produces well-formed, parseable SVG for every creative × a sample of surfaces', () => {
    const sample = SURFACES.filter((_, i) => i % 3 === 0)
    for (const c of CREATIVES) {
      for (const s of sample) {
        const svg = renderToSvg(resolveLayout(c, s), { brandColor: c.brandColor })
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        expect(doc.querySelector('parsererror')).toBeNull()
        const root = doc.documentElement
        expect(root.getAttribute('width')).toBe(String(s.w))
        expect(root.getAttribute('viewBox')).toBe(`0 0 ${s.w} ${s.h}`)
      }
    }
  })

  it('emits a standalone document with an XML prolog when asked', () => {
    const svg = renderToSvg(resolveLayout(creative, surface), { standalone: true })
    expect(svg.startsWith('<?xml')).toBe(true)
  })

  it('escapes content in text and attributes', () => {
    const evil = {
      ...creative,
      elements: creative.elements.map((e) =>
        e.role === 'headline' ? { ...e, content: '</text><script/>' } : e,
      ),
    }
    const svg = renderToSvg(resolveLayout(evil, surface))
    expect(svg).not.toContain('</text><script/>')
    expect(
      new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror'),
    ).toBeNull()
  })
})
