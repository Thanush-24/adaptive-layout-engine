import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { resolveLayout } from './resolve'
import { classify } from './surfaces'
import { breach, rect } from './geometry'
import { CREATIVES } from '../data/creatives'
import type { Surface } from './types'

const arbSurface = fc
  .record({
    w: fc.integer({ min: 120, max: 3840 }),
    h: fc.integer({ min: 50, max: 2160 }),
    vd: fc.constantFrom('near', 'mid', 'far') as fc.Arbitrary<Surface['viewingDistance']>,
    safe: fc.integer({ min: 0, max: 60 }),
  })
  .map(({ w, h, vd, safe }): Surface => ({
    id: `p-${w}x${h}`,
    label: 'prop',
    w,
    h,
    channel: 'display',
    safe: { top: safe, right: safe, bottom: safe, left: safe },
    viewingDistance: vd,
  }))

describe('resolveLayout — property based', () => {
  it('always contains placements within the frame and preserves required elements', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CREATIVES), arbSurface, (creative, surface) => {
        const out = resolveLayout(creative, surface)
        const frame = rect(0, 0, surface.w, surface.h)

        for (const p of out.placements) {
          expect(breach(frame, p.rect)).toBeLessThan(2.5)
        }
        for (const el of creative.elements.filter((e) => e.required)) {
          expect(out.dropped.some((d) => d.id === el.id)).toBe(false)
        }
        expect(out.score).toBeGreaterThan(0)
        expect(out.score).toBeLessThanOrEqual(1)
        expect(out.trace.candidates.length).toBeGreaterThan(0)
      }),
      { numRuns: 250 },
    )
  })

  it('classify is total and stable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8000 }),
        fc.integer({ min: 1, max: 8000 }),
        (w, h) => {
          const s = { w, h } as Surface
          const a = classify(s)
          expect(a).toBe(classify(s))
          expect(typeof a).toBe('string')
        },
      ),
    )
  })
})
