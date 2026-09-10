/**
 * Golden matrix: a compact fingerprint of the resolved layout for every
 * creative × surface pair. Any change in engine behaviour shows up here as a
 * reviewable diff. Deterministic (table font metrics, no canvas).
 */
import { describe, expect, it } from 'vitest'
import { resolveLayout } from './resolve'
import { SURFACES } from './surfaces'
import { CREATIVES } from '../data/creatives'

function fingerprint() {
  const lines: string[] = []
  for (const c of CREATIVES) {
    for (const s of SURFACES) {
      const r = resolveLayout(c, s)
      const placed = r.placements
        .filter((p) => p.role !== 'background')
        .map(
          (p) =>
            `${p.role}@${Math.round(p.rect.x)},${Math.round(p.rect.y)} ${Math.round(p.rect.w)}x${Math.round(p.rect.h)}${p.text ? ` ${p.text.fontPx}px/${p.text.lines.length}L` : ''}`,
        )
        .join(' | ')
      lines.push(
        `${c.id.padEnd(14)} ${s.id.padEnd(16)} ${r.trace.winner.strategy}/${r.trace.winner.variant} score=${r.score.toFixed(2)} drop=${r.dropped.length} warn=${r.warnings.length}\n    ${placed}`,
      )
    }
  }
  return lines.join('\n')
}

describe('resolved layout matrix', () => {
  it('matches the golden fingerprint', () => {
    expect(fingerprint()).toMatchSnapshot()
  })
})
