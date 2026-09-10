// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdSurface } from './react/AdSurface'
import { renderToHtml } from './html'
import { resolveLayout } from '@engine/resolve'
import { SURFACE_BY_ID } from '@engine/surfaces'
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
