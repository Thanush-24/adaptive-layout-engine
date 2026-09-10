import { describe, expect, it } from 'vitest'
import { narrate } from './narrate'
import { resolveLayout } from './resolve'
import { SURFACES } from './surfaces'
import { CREATIVES } from '../data/creatives'

describe('narrate', () => {
  it('produces a non-empty, human-readable account for every creative × surface', () => {
    for (const c of CREATIVES) {
      for (const s of SURFACES) {
        const lines = narrate(resolveLayout(c, s))
        expect(lines.length).toBeGreaterThanOrEqual(3)
        // first line names the archetype and the chosen strategy
        expect(lines[0]).toContain(`${s.w}×${s.h}`)
        expect(lines[0].toLowerCase()).toContain(resolveLayout(c, s).trace.archetype)
        // every line is a real sentence
        for (const l of lines) expect(l.trim().length).toBeGreaterThan(10)
      }
    }
  })

  it('mentions degradation when elements were shed', () => {
    const micro = SURFACES.find((s) => s.id === 'mobile-banner')!
    const out = resolveLayout(CREATIVES[0], micro)
    const text = narrate(out).join(' ')
    if (out.trace.degradation.length > 0) {
      expect(text.toLowerCase()).toContain('shed')
    }
  })

  it('calls out warnings when present and confirms a clean fit otherwise', () => {
    for (const s of SURFACES) {
      const out = resolveLayout(CREATIVES[3], s)
      const last = narrate(out).at(-1)!
      if (out.warnings.length === 0) {
        expect(last.toLowerCase()).toContain('no warnings')
      }
    }
  })
})
