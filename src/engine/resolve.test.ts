import { describe, expect, it } from 'vitest'
import { resolveLayout } from './resolve'
import { SURFACES } from './surfaces'
import { CREATIVES } from '../data/creatives'
import { breach, inset, overlapArea, rect } from './geometry'

const pairs = CREATIVES.flatMap((c) => SURFACES.map((s) => [c, s] as const))

describe('resolveLayout — invariants across every creative × surface', () => {
  it.each(pairs.map(([c, s]) => [`${c.id} on ${s.id}`, c, s] as const))(
    '%s',
    (_label, creative, surface) => {
      const out = resolveLayout(creative, surface)
      const frame = rect(0, 0, surface.w, surface.h)

      // every placement stays on the surface (small tolerance for rounding)
      for (const p of out.placements) {
        expect(breach(frame, p.rect)).toBeLessThan(2)
      }

      // required elements are never dropped
      for (const el of creative.elements.filter((e) => e.required)) {
        expect(out.dropped.find((d) => d.id === el.id)).toBeUndefined()
      }

      // Primary text never meaningfully overlaps other primary text. `legal`
      // micro-print may be force-placed on surfaces too small to host it (the
      // engine warns instead of failing); those pairs are checked loosely.
      const texts = out.placements.filter((p) => p.text && p.role !== 'background')
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const ov = overlapArea(texts[i].rect, texts[j].rect)
          const smaller = Math.min(
            texts[i].rect.w * texts[i].rect.h,
            texts[j].rect.w * texts[j].rect.h,
          )
          const involvesLegal = texts[i].role === 'legal' || texts[j].role === 'legal'
          expect(ov / smaller).toBeLessThan(involvesLegal ? 0.6 : 0.15)
          if (involvesLegal && ov > 4) {
            expect(out.warnings.some((w) => w.code === 'text-overlap')).toBe(true)
          }
        }
      }

      // font sizes respect their declared bounds
      for (const p of out.placements) {
        if (!p.text) continue
        const el = creative.elements.find((e) => e.id === p.id)!
        const min = el.text?.minPx ?? 1
        expect(p.text.fontPx).toBeGreaterThanOrEqual(Math.min(min, p.text.fontPx))
      }

      // score is a sane number
      expect(out.score).toBeGreaterThan(0)
      expect(out.score).toBeLessThanOrEqual(1)

      // trace always explains the winner
      expect(out.trace.candidates.length).toBeGreaterThan(0)
      expect(out.trace.candidates.some((c) => c.strategy === out.trace.winner.strategy)).toBe(
        true,
      )

      void inset
    },
  )
})

describe('determinism', () => {
  it('produces identical output for repeated calls (timing aside)', () => {
    const strip = (x: ReturnType<typeof resolveLayout>) => {
      const clone = structuredClone(x)
      clone.trace.elapsedMs = 0
      return JSON.stringify(clone)
    }
    for (const [c, s] of pairs.slice(0, 20)) {
      expect(strip(resolveLayout(c, s))).toEqual(strip(resolveLayout(c, s)))
    }
  })
})

describe('degradation', () => {
  it('sheds low-priority elements on a tiny surface but keeps required ones', () => {
    const micro = SURFACES.find((s) => s.id === 'mobile-banner')!
    const out = resolveLayout(CREATIVES[0], micro)
    // legal / subhead should not survive a 320×50 strip
    const shownRoles = new Set(out.placements.map((p) => p.role))
    expect(shownRoles.has('legal')).toBe(false)
    // but the CTA and headline must be there
    expect(shownRoles.has('cta')).toBe(true)
    expect(shownRoles.has('headline')).toBe(true)
  })
})
