/**
 * `resolveLayout` — the engine's single entry point.
 *
 *   classify → enumerate candidates → place + score every candidate →
 *   select the best → (if weak) shed the lowest-priority element and retry →
 *   audit → emit layout + full decision trace.
 *
 * Pure and deterministic: same `(creative, surface)` always yields byte-identical
 * output. Set `preferCanvas` to use browser font metrics in the playground;
 * tests leave it off so snapshots are stable.
 */
import { audit } from './audit'
import { classify } from './surfaces'
import { enumerateCandidates } from './layout/candidates'
import { place, type PlaceResult } from './layout/place'
import { scoreLayout } from './score/rubric'
import { nextToDrop } from './degrade'
import type {
  AdElement,
  CandidateTrace,
  Creative,
  DegradationStep,
  DroppedElement,
  LayoutCandidate,
  ResolvedLayout,
  Surface,
} from './types'

export interface ResolveOptions {
  preferCanvas?: boolean
  /** Composite score at or above which degradation stops. Default 0.82. */
  goodEnough?: number
  /** Hard cap on degradation passes. Default 4. */
  maxDegradations?: number
}

interface Attempt {
  best: {
    candidate: LayoutCandidate
    placed: PlaceResult
    total: number
    ruleScores: ReturnType<typeof scoreLayout>['ruleScores']
  }
  all: CandidateTrace[]
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function resolveLayout(
  creative: Creative,
  surface: Surface,
  opts: ResolveOptions = {},
): ResolvedLayout {
  const t0 = now()
  const preferCanvas = opts.preferCanvas ?? false
  const goodEnough = opts.goodEnough ?? 0.82
  const maxDeg = opts.maxDegradations ?? 4

  const archetype = classify(surface)

  const runAttempt = (active: AdElement[]): Attempt => {
    const { candidates } = enumerateCandidates(creative, surface, archetype)
    const scored = candidates.map((candidate) => {
      const placed = place(creative, surface, candidate, active, preferCanvas)
      const { total, ruleScores } = scoreLayout({ creative, surface, candidate, placed })
      const trace: CandidateTrace = {
        strategy: candidate.strategy,
        variant: candidate.variant,
        score: total,
        ruleScores,
        dropped: placed.unplaced,
      }
      return { candidate, placed, total, ruleScores, trace }
    })

    // Deterministic argmax: score, then affinity, then strategy/variant name.
    scored.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      if (b.candidate.affinity !== a.candidate.affinity)
        return b.candidate.affinity - a.candidate.affinity
      return (a.candidate.strategy + a.candidate.variant).localeCompare(
        b.candidate.strategy + b.candidate.variant,
      )
    })

    return {
      best: {
        candidate: scored[0].candidate,
        placed: scored[0].placed,
        total: scored[0].total,
        ruleScores: scored[0].ruleScores,
      },
      all: scored.map((s) => s.trace),
    }
  }

  let active = [...creative.elements]
  let attempt = runAttempt(active)
  const degradation: DegradationStep[] = []
  const shed: DroppedElement[] = []

  for (let pass = 0; pass < maxDeg; pass++) {
    const requiredUnplaced = attempt.best.placed.unplaced.some(
      (d) => creative.elements.find((e) => e.id === d.id)?.required,
    )
    if (attempt.best.total >= goodEnough && !requiredUnplaced) break

    const victim = nextToDrop(active)
    if (!victim) break

    const nextActive = active.filter((e) => e.id !== victim.id)
    const nextAttempt = runAttempt(nextActive)

    const improved = nextAttempt.best.total > attempt.best.total + 0.01
    if (!improved && !requiredUnplaced) break

    degradation.push({
      droppedId: victim.id,
      role: victim.role,
      reason: requiredUnplaced
        ? 'made room for a required element that would not fit'
        : `raised composite score ${attempt.best.total.toFixed(2)} → ${nextAttempt.best.total.toFixed(2)}`,
      scoreBefore: attempt.best.total,
      scoreAfter: nextAttempt.best.total,
    })
    shed.push({ id: victim.id, role: victim.role, reason: 'shed during degradation' })
    active = nextActive
    attempt = nextAttempt
  }

  const { best, all } = attempt
  const dropped: DroppedElement[] = [...shed, ...best.placed.unplaced]
  const warnings = audit(best.placed.placements, dropped, creative, surface, best.total)

  const elapsedMs = Math.round((now() - t0) * 1000) / 1000

  return {
    surface,
    creativeId: creative.id,
    placements: best.placed.placements,
    dropped,
    score: best.total,
    ruleScores: best.ruleScores,
    warnings,
    trace: {
      archetype,
      contentBudget: enumerateCandidates(creative, surface, archetype).budget,
      candidates: all,
      winner: {
        strategy: best.candidate.strategy,
        variant: best.candidate.variant,
        score: best.total,
      },
      degradation,
      elapsedMs,
    },
  }
}
