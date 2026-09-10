/**
 * Candidate enumeration: run every strategy that applies to the surface's
 * archetype and collect the region maps they propose. The optimizer places and
 * scores each one; nothing here looks at content beyond which roles exist.
 */
import { inset, rect } from '../geometry'
import type { Archetype, Creative, ElementRole, LayoutCandidate, Rect, Surface } from '../types'
import { STRATEGIES, type StrategyContext } from './strategies'

export function enumerateCandidates(
  creative: Creative,
  surface: Surface,
  archetype: Archetype,
): { candidates: LayoutCandidate[]; budget: Rect } {
  const frame = rect(0, 0, surface.w, surface.h)
  const budget = inset(frame, surface.safe)
  const roles = new Set<ElementRole>(creative.elements.map((e) => e.role))

  const ctx: StrategyContext = { archetype, budget, roles, frame, surface }

  const candidates: LayoutCandidate[] = []
  for (const strategy of STRATEGIES) {
    if (!strategy.applies(archetype)) continue
    for (const c of strategy.build(ctx)) {
      if (c.regions.length > 0) candidates.push(c)
    }
  }

  // Guarantee at least one candidate so `resolveLayout` is total.
  if (candidates.length === 0) {
    candidates.push({
      strategy: 'fallback',
      variant: 'single-column',
      affinity: 0.3,
      regions: [
        { accepts: ['background'], rect: frame, overlay: true },
        {
          accepts: ['logo', 'headline', 'subhead', 'product', 'cta', 'legal', 'badge'],
          rect: budget,
          align: 'center',
        },
      ],
    })
  }
  return { candidates, budget }
}
