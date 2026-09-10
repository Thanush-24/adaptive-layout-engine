/**
 * The scoring rubric. Every candidate layout is placed, then graded against a
 * fixed set of weighted rules, each returning a score in [0..1]. The weighted
 * mean is the composite quality score the optimizer maximises. Weights are
 * tuned so that a hard legibility or safe-area failure cannot be outvoted by
 * cosmetic wins.
 */
import { MIN_LEGIBLE_PX } from '../surfaces'
import { area, breach, clamp, inset, overlapArea, rect } from '../geometry'
import type { Creative, LayoutCandidate, Placement, RuleScore, Surface } from '../types'
import type { PlaceResult } from '../layout/place'

export interface ScoreInput {
  creative: Creative
  surface: Surface
  candidate: LayoutCandidate
  placed: PlaceResult
}

interface Rule {
  name: string
  weight: number
  score: (i: ScoreInput) => { score: number; detail?: string }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const textPlacements = (p: Placement[]) => p.filter((x) => x.text && x.role !== 'background')

const RULES: Rule[] = [
  {
    name: 'legibility',
    weight: 3,
    score: ({ surface, placed }) => {
      const min = MIN_LEGIBLE_PX[surface.viewingDistance]
      const texts = textPlacements(placed.placements)
      if (texts.length === 0) return { score: 0.6, detail: 'no text' }
      let worst = 1
      const offenders: string[] = []
      for (const t of texts) {
        const fp = t.text!.fontPx
        const floor = t.role === 'legal' ? Math.max(9, min - 3) : min
        const ratio = clamp01(fp / floor)
        if (ratio < 1) offenders.push(`${t.role} ${fp}px`)
        worst = Math.min(worst, ratio < 1 ? ratio * 0.5 : 1)
      }
      return {
        score: worst,
        detail: offenders.length ? `below ${min}px: ${offenders.join(', ')}` : 'all legible',
      }
    },
  },
  {
    name: 'safe-area',
    weight: 2.4,
    score: ({ surface, placed }) => {
      const safe = inset(rect(0, 0, surface.w, surface.h), surface.safe)
      const diag = Math.hypot(surface.w, surface.h)
      let total = 0
      for (const p of placed.placements) {
        if (p.role === 'background') continue
        total += breach(safe, p.rect)
      }
      return {
        score: clamp01(1 - total / (diag * 0.5)),
        detail: total > 0.5 ? `${total.toFixed(0)}px outside safe area` : 'within safe area',
      }
    },
  },
  {
    name: 'containment',
    weight: 2.6,
    score: ({ surface, placed }) => {
      const frame = rect(0, 0, surface.w, surface.h)
      const diag = Math.hypot(surface.w, surface.h)
      let total = 0
      for (const p of placed.placements) total += breach(frame, p.rect)
      return {
        score: clamp01(1 - total / (diag * 0.25)),
        detail: total > 0.5 ? `${total.toFixed(0)}px past the frame` : 'contained',
      }
    },
  },
  {
    name: 'no-collision',
    weight: 3,
    score: ({ placed }) => {
      const texts = textPlacements(placed.placements)
      let overlap = 0
      let own = 0
      let worstPair = 0
      for (let i = 0; i < texts.length; i++) {
        own += area(texts[i].rect)
        for (let j = i + 1; j < texts.length; j++) {
          const ov = overlapArea(texts[i].rect, texts[j].rect)
          overlap += ov
          const frac = ov / Math.max(1, Math.min(area(texts[i].rect), area(texts[j].rect)))
          worstPair = Math.max(worstPair, frac)
        }
      }
      if (own === 0) return { score: 1 }
      // A single badly overlapping pair is disqualifying — the optimizer must
      // never prefer a colliding layout when a clean one exists.
      const hardFloor = worstPair > 0.25 ? 0.15 : 1
      return {
        score: Math.min(hardFloor, clamp01(1 - (overlap / own) * 4)),
        detail:
          overlap > 1 ? `${(worstPair * 100).toFixed(0)}% worst-pair overlap` : 'no overlap',
      }
    },
  },
  {
    name: 'completeness',
    weight: 2.2,
    score: ({ creative, placed }) => {
      const total = creative.elements.length
      const shown = placed.placements.length
      const droppedRequired = placed.unplaced.some((d) => {
        const el = creative.elements.find((e) => e.id === d.id)
        return el?.required
      })
      if (droppedRequired) return { score: 0.05, detail: 'a required element is unplaced' }
      return {
        score: clamp01(shown / total),
        detail: `${shown}/${total} elements placed`,
      }
    },
  },
  {
    name: 'hierarchy',
    weight: 1.4,
    score: ({ placed }) => {
      const get = (role: string) =>
        placed.placements.find((p) => p.role === role)?.text?.fontPx ?? null
      const hl = get('headline')
      const sub = get('subhead')
      const legal = get('legal')
      let ok = 1
      const notes: string[] = []
      if (hl != null && sub != null && hl <= sub * 1.15) {
        ok -= 0.5
        notes.push('headline not dominant')
      }
      if (sub != null && legal != null && legal >= sub) {
        ok -= 0.3
        notes.push('legal too large')
      }
      return { score: clamp01(ok), detail: notes.join('; ') || 'clear hierarchy' }
    },
  },
  {
    name: 'headline-impact',
    weight: 1.8,
    score: ({ surface, placed }) => {
      const hl = placed.placements.find((p) => p.role === 'headline')?.text
      if (!hl) return { score: 0.5, detail: 'no headline' }
      const minDim = Math.min(surface.w, surface.h)
      const floor = MIN_LEGIBLE_PX[surface.viewingDistance] * 1.6
      // A headline should read at roughly a tenth of the short edge, never
      // below a clear step above body text. Below target it feels timid; well
      // over target is fine and only gently discounted.
      const target = clamp(minDim * 0.1, floor, minDim * 0.22)
      const ratio = hl.fontPx / target
      const s = ratio >= 1 ? clamp01(1 - (ratio - 1) * 0.12) : clamp01(0.4 + ratio * 0.6)
      return {
        score: s,
        detail: `headline ${hl.fontPx}px vs ~${Math.round(target)}px target`,
      }
    },
  },
  {
    name: 'cta-prominence',
    weight: 1.6,
    score: ({ surface, placed }) => {
      const cta = placed.placements.find((p) => p.role === 'cta')
      if (!cta) return { score: 0.5, detail: 'no CTA' }
      const frac = area(cta.rect) / (surface.w * surface.h)
      // Want the CTA to read as a button: not a hairline, not a billboard.
      const lo = 0.02
      const hi = 0.16
      const s = frac < lo ? clamp01(frac / lo) : frac > hi ? clamp01(1 - (frac - hi) / hi) : 1
      return { score: s, detail: `${(frac * 100).toFixed(1)}% of surface` }
    },
  },
  {
    name: 'brand-visibility',
    weight: 1.2,
    score: ({ creative, placed }) => {
      const hasLogo = creative.elements.some((e) => e.role === 'logo')
      if (!hasLogo) return { score: 0.6, detail: 'no logo in creative' }
      const logo = placed.placements.find((p) => p.role === 'logo')
      if (!logo) return { score: 0.15, detail: 'logo dropped' }
      const fp = logo.text?.fontPx ?? 0
      return { score: clamp01(fp / 16), detail: `logo ${fp}px` }
    },
  },
  {
    name: 'focal-preservation',
    weight: 1.5,
    score: ({ placed }) => {
      const imgs = placed.placements.filter((p) => p.image && p.role !== 'background')
      const bg = placed.placements.find((p) => p.role === 'background' && p.image)
      const all = [...imgs, ...(bg ? [bg] : [])]
      if (all.length === 0) return { score: 0.7, detail: 'no imagery' }
      let worst = 1
      for (const p of all) {
        const loss = p.image!.cropLoss
        worst = Math.min(worst, clamp01(1 - loss / 0.7))
      }
      return { score: worst, detail: `max crop loss ${((1 - worst) * 70).toFixed(0)}%` }
    },
  },
  {
    name: 'whitespace-balance',
    weight: 1.3,
    score: ({ surface, candidate, placed }) => {
      const contentArea = placed.placements
        .filter((p) => p.role !== 'background')
        .reduce((s, p) => s + area(p.rect), 0)
      const frac = contentArea / (surface.w * surface.h)
      // Sweet spot ~0.28–0.62 ink coverage for a legible ad.
      const s =
        frac < 0.14
          ? clamp01(frac / 0.14) * 0.7
          : frac > 0.78
            ? clamp01(1 - (frac - 0.78) / 0.22)
            : 1
      return {
        score: s * (0.6 + 0.4 * candidate.affinity),
        detail: `${(frac * 100).toFixed(0)}% ink`,
      }
    },
  },
]

export function scoreLayout(input: ScoreInput): { total: number; ruleScores: RuleScore[] } {
  const ruleScores: RuleScore[] = RULES.map((r) => {
    const { score, detail } = r.score(input)
    return { rule: r.name, score: clamp01(score), weight: r.weight, detail }
  })
  const wsum = RULES.reduce((s, r) => s + r.weight, 0)
  const total = ruleScores.reduce((s, r) => s + r.score * r.weight, 0) / wsum
  return { total: Math.round(total * 1000) / 1000, ruleScores }
}
