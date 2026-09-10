import { describe, expect, it } from 'vitest'
import { parseCreative } from './dsl'
import { resolveLayout } from './resolve'
import { SURFACE_BY_ID } from './surfaces'

describe('parseCreative', () => {
  it('accepts a minimal valid creative and fills defaults', () => {
    const r = parseCreative({
      id: 'min',
      brandColor: '#4361ee',
      elements: [
        { id: 'h', role: 'headline', content: 'Hello world', required: true },
        { role: 'cta', content: 'Go' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.creative.name).toBe('min')
    expect(r.creative.elements[0].kind).toBe('text')
    expect(r.creative.elements[1].id).toBe('el-1') // auto id
    expect(r.creative.elements[1].priority).toBe(50) // default
    // it should resolve without throwing
    const layout = resolveLayout(r.creative, SURFACE_BY_ID['mpu'])
    expect(layout.placements.length).toBeGreaterThan(0)
  })

  it('reports every structural error at once with paths', () => {
    const r = parseCreative({
      brandColor: 'not-a-colour',
      elements: [
        { id: 'a', role: 'nope', content: 'x' },
        { id: 'a', role: 'headline', content: '' },
        {
          id: 'b',
          role: 'product',
          kind: 'image',
          content: 'u',
          image: { aspect: -1, focal: { x: 2, y: 0 } },
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const paths = r.errors.map((e) => e.path)
    expect(paths).toContain('id')
    expect(paths).toContain('brandColor')
    expect(paths).toContain('elements[0].role')
    expect(paths).toContain('elements[1].id') // duplicate
    expect(paths).toContain('elements[1].content')
    expect(paths).toContain('elements[2].image.aspect')
    expect(paths).toContain('elements[2].image.focal')
  })

  it('warns (not errors) on soft issues', () => {
    const r = parseCreative({
      id: 'soft',
      brandColor: '#000000',
      elements: [{ id: 'x', role: 'logo', content: 'Brand' }],
    })
    expect(r.ok).toBe(true)
    const codes = r.warnings.map((w) => w.message)
    expect(codes.some((m) => /no headline/.test(m))).toBe(true)
    expect(codes.some((m) => /no CTA/.test(m))).toBe(true)
    expect(codes.some((m) => /required/.test(m))).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(parseCreative(null).ok).toBe(false)
    expect(parseCreative('a string').ok).toBe(false)
    expect(parseCreative({ id: 'x', brandColor: '#000', elements: [] }).ok).toBe(false)
  })
})
