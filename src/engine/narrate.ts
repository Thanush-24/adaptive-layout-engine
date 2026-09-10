/**
 * Turn a `ResolvedLayout`'s trace into a short plain-English account of what the
 * engine decided and why. Pure — reads only the resolved layout. Used by the
 * playground's inspector and the CLI's `--explain` output.
 */
import type { ResolvedLayout, RuleScore } from './types'

const pct = (n: number) => `${Math.round(n * 100)}%`

const STRATEGY_BLURB: Record<string, string> = {
  strip: 'a single horizontal line — logo, message, CTA',
  stack: 'a vertical stack in reading order',
  split: 'a two-column split, imagery beside the copy',
  'hero-overlay': 'full-bleed imagery with the copy in a scrimmed band',
  sidebar: 'a brand rail beside a large product area',
  poster: 'a centred poster composition',
  fallback: 'a single centred column (no strategy fit the shape well)',
}

const RULE_PHRASE: Record<string, (r: RuleScore) => string> = {
  legibility: (r) =>
    r.score >= 0.99
      ? 'every line clears the legibility floor'
      : `legibility is strained (${r.detail})`,
  'no-collision': (r) =>
    r.score >= 0.99 ? 'nothing overlaps' : `text elements collide (${r.detail})`,
  'safe-area': (r) =>
    r.score >= 0.99
      ? 'everything sits inside the safe area'
      : `content pushes into the safe-area margin`,
  containment: (r) =>
    r.score >= 0.99 ? 'everything stays within the frame' : 'content is clipped by the frame',
  'headline-impact': (r) =>
    `the headline lands at ${r.detail?.replace('headline ', '').replace(' target', '')}`,
  'cta-prominence': (r) =>
    r.score >= 0.8
      ? `the CTA reads as a button (${r.detail})`
      : `the CTA is under-scaled (${r.detail})`,
  'focal-preservation': (r) =>
    r.detail === 'no imagery'
      ? 'no imagery to preserve'
      : r.score >= 0.8
        ? 'imagery keeps its focal point'
        : `imagery is cropped hard (${r.detail})`,
  'whitespace-balance': (r) => `ink coverage is ${r.detail}`,
  completeness: (r) => r.detail ?? '',
  hierarchy: (r) => (r.score >= 0.99 ? 'the type hierarchy is clear' : (r.detail ?? '')),
  'brand-visibility': (r) =>
    r.score >= 0.8 ? 'the logo is clearly present' : 'the logo is small or missing',
}

export function narrate(layout: ResolvedLayout): string[] {
  const { trace } = layout
  const out: string[] = []

  // 1) archetype + strategy choice
  const w = trace.winner
  out.push(
    `The ${layout.surface.w}×${layout.surface.h} surface reads as **${trace.archetype}**, so the engine laid it out as **${w.strategy}·${w.variant}** — ${STRATEGY_BLURB[w.strategy] ?? w.strategy}.`,
  )

  // 2) why this candidate beat the rest
  const sorted = [...trace.candidates].sort((a, b) => b.score - a.score)
  const winnerT = sorted.find((c) => c.strategy === w.strategy && c.variant === w.variant)
  const runnerUp = sorted.find((c) => c !== winnerT)
  if (runnerUp && winnerT) {
    const margin = winnerT.score - runnerUp.score
    const swung = strongestDelta(winnerT.ruleScores, runnerUp.ruleScores)
    out.push(
      `It scored ${winnerT.score.toFixed(2)} against ${trace.candidates.length - 1} alternatives` +
        (runnerUp
          ? `; the closest was ${runnerUp.strategy}·${runnerUp.variant} at ${runnerUp.score.toFixed(2)}` +
            (swung ? `, which lost mainly on **${swung}**` : '') +
            (margin < 0.03 ? ' — a close call' : '') +
            '.'
          : '.'),
    )
  }

  // 3) the rubric highlights — best and worst rule
  const rs = [...layout.ruleScores]
    .filter((r) => !(r.rule === 'focal-preservation' && r.detail === 'no imagery'))
    .sort((a, b) => a.score - b.score)
  const worst = rs[0]
  const best = rs[rs.length - 1]
  if (worst && worst.score < 0.7) {
    out.push(
      `Weakest rule: **${worst.rule}** at ${pct(worst.score)} — ${RULE_PHRASE[worst.rule]?.(worst) ?? worst.detail}.`,
    )
  }
  if (best && best.score >= 0.95) {
    out.push(`Strongest: **${best.rule}** — ${RULE_PHRASE[best.rule]?.(best) ?? best.detail}.`)
  }

  // 4) degradation
  if (trace.degradation.length > 0) {
    const shed = trace.degradation.map((d) => d.role).join(', ')
    const last = trace.degradation[trace.degradation.length - 1]
    out.push(
      `To make everything fit it shed **${shed}** — the composite score rose from ${trace.degradation[0].scoreBefore.toFixed(2)} to ${last.scoreAfter.toFixed(2)}.`,
    )
  }

  // 5) unresolved warnings the reader should know about
  const errs = layout.warnings.filter((x) => x.severity === 'error')
  const warns = layout.warnings.filter((x) => x.severity === 'warn')
  if (errs.length) {
    out.push(`⚠ ${errs.map((e) => e.message).join(' ')}`)
  } else if (warns.length) {
    out.push(
      `Caveat: ${warns[0].message}${warns.length > 1 ? ` (+${warns.length - 1} more)` : ''}.`,
    )
  } else {
    out.push('No warnings — this surface is a clean fit for the creative.')
  }

  return out
}

function strongestDelta(a: RuleScore[], b: RuleScore[]): string | null {
  let rule: string | null = null
  let max = 0.08
  for (const ra of a) {
    const rb = b.find((x) => x.rule === ra.rule)
    if (!rb) continue
    const d = (ra.score - rb.score) * ra.weight
    if (d > max) {
      max = d
      rule = ra.rule
    }
  }
  return rule
}
