/**
 * Layout strategies. Each strategy is a pure function that, given a surface and a
 * content budget, proposes one or more candidate region maps. A candidate is just
 * a list of `Region`s (a rect + the roles it will host). Strategies never place
 * elements or measure text — they only carve space and declare intent. The
 * optimizer places every candidate and scores the results.
 */
import { alignIn, inset, rect } from '../geometry'
import { MIN_LEGIBLE_PX } from '../surfaces'
import type { Archetype, ElementRole, LayoutCandidate, Rect, Region, Surface } from '../types'
import { cols, rows } from './partition'

export interface StrategyContext {
  archetype: Archetype
  /** Safe-area-inset content rect. */
  budget: Rect
  /** Roles actually present in the creative. */
  roles: Set<ElementRole>
  /** Full surface rect (0,0,w,h) for full-bleed backgrounds. */
  frame: Rect
  surface: Surface
}

/** Minimum height a single-line control (CTA / logo) needs to stay legible. */
export function ctrlBand(ctx: StrategyContext): { min: number; max: number } {
  const legible = MIN_LEGIBLE_PX[ctx.surface.viewingDistance]
  const min = Math.max(44, legible * 2.2)
  return { min, max: min * 1.5 }
}

export type Strategy = {
  name: string
  applies: (a: Archetype) => boolean
  build: (ctx: StrategyContext) => LayoutCandidate[]
}

const has = (roles: Set<ElementRole>, r: ElementRole) => roles.has(r)
const GAP = 12

/** background region spanning the full frame, always first so it renders behind. */
function bgRegion(frame: Rect): Region {
  return { accepts: ['background'], rect: frame, overlay: true }
}

// --------------------------------------------------------------------------
// strip — logo | message | CTA on one horizontal line. Micro / wide formats.
// --------------------------------------------------------------------------
const strip: Strategy = {
  name: 'strip',
  applies: (a) => a === 'micro' || a === 'strip' || a === 'ultrawide' || a === 'landscape',
  build: (ctx) => {
    const { budget, roles, frame, archetype } = ctx
    const hasLogo = has(roles, 'logo')
    const hasCta = has(roles, 'cta')
    // A legal line only earns its own track when there is vertical room for one.
    const legalH = has(roles, 'legal') && budget.h >= 74 ? Math.min(20, budget.h * 0.2) : 0
    const [rowMain, rowLegal] = rows(
      budget,
      [{ weight: 1 }, { weight: 0, min: legalH, max: legalH }],
      legalH ? 4 : 0,
    )
    const ctaW = archetype === 'micro' ? 92 : Math.min(220, rowMain.w * 0.24)
    const logoW = hasLogo ? Math.min(archetype === 'micro' ? 40 : 120, rowMain.w * 0.18) : 0

    const [logoCol, midCol, ctaCol] = cols(
      rowMain,
      [
        { weight: 0, min: logoW, max: logoW },
        { weight: 1 },
        { weight: 0, min: hasCta ? ctaW : 0, max: hasCta ? ctaW : 0 },
      ],
      GAP,
    )

    const regions: Region[] = [bgRegion(frame)]
    if (hasLogo) regions.push({ accepts: ['logo'], rect: logoCol, align: 'center' })
    regions.push({
      accepts:
        archetype === 'micro' ? ['headline', 'subhead'] : ['headline', 'subhead', 'badge'],
      rect: midCol,
      align: 'start',
    })
    if (hasCta) regions.push({ accepts: ['cta'], rect: ctaCol, align: 'center' })
    if (legalH) regions.push({ accepts: ['legal'], rect: rowLegal, align: 'start' })

    const variants: LayoutCandidate[] = [
      {
        strategy: 'strip',
        variant: 'logo-message-cta',
        regions,
        affinity: archetype === 'micro' ? 0.9 : 0.7,
      },
    ]

    // Centered variant for landscape/ultrawide with a background image.
    if ((archetype === 'landscape' || archetype === 'ultrawide') && has(roles, 'background')) {
      const band = inset(budget, { top: budget.h * 0.28, right: 0, bottom: 0, left: 0 })
      const [msg, cta] = rows(
        band,
        [{ weight: 1 }, { weight: 0, min: hasCta ? 64 : 0, max: hasCta ? 72 : 0 }],
        GAP,
      )
      variants.push({
        strategy: 'strip',
        variant: 'overlay-lower-third',
        regions: [
          bgRegion(frame),
          ...(hasLogo
            ? [
                {
                  accepts: ['logo'] as ElementRole[],
                  rect: rect(budget.x, budget.y, 160, 56),
                  align: 'start' as const,
                },
              ]
            : []),
          { accepts: ['headline', 'subhead'], rect: msg, overlay: true, align: 'start' },
          ...(hasCta
            ? [
                {
                  accepts: ['cta'] as ElementRole[],
                  rect: cta,
                  overlay: true,
                  align: 'start' as const,
                },
              ]
            : []),
        ],
        affinity: 0.75,
      })
    }
    return variants
  },
}

// --------------------------------------------------------------------------
// stack — vertical rhythm: logo / headline / subhead / product / cta / legal.
// --------------------------------------------------------------------------
const stack: Strategy = {
  name: 'stack',
  applies: (a) => a === 'banner' || a === 'square' || a === 'portrait' || a === 'vertical',
  build: (ctx) => {
    const { budget, roles, frame } = ctx
    const cb = ctrlBand(ctx)
    const u = cb.min / 44 // legibility-driven scale (1 for near, ~1.6 for far)
    const order: { role: ElementRole; weight: number; min?: number; max?: number }[] = []
    if (has(roles, 'logo')) order.push({ role: 'logo', weight: 0, min: 28 * u, max: 56 * u })
    if (has(roles, 'badge')) order.push({ role: 'badge', weight: 0, min: 22 * u, max: 40 * u })
    if (has(roles, 'headline')) order.push({ role: 'headline', weight: 2.2, min: 44 * u })
    if (has(roles, 'subhead')) order.push({ role: 'subhead', weight: 1.1, min: 28 * u })
    if (has(roles, 'product')) order.push({ role: 'product', weight: 3, min: 60 })
    if (has(roles, 'cta')) order.push({ role: 'cta', weight: 0, min: cb.min, max: cb.max })
    if (has(roles, 'legal')) order.push({ role: 'legal', weight: 0, min: 14 * u, max: 26 * u })

    const trackRects = rows(
      budget,
      order.map((o) => ({ weight: o.weight, min: o.min, max: o.max })),
      GAP,
    )
    const regions: Region[] = [bgRegion(frame)]
    order.forEach((o, i) => {
      regions.push({
        accepts: [o.role],
        rect: trackRects[i],
        align: o.role === 'legal' ? 'start' : 'center',
      })
    })

    const candidates: LayoutCandidate[] = [
      { strategy: 'stack', variant: 'centered', regions, affinity: 0.8 },
    ]

    // Left-aligned variant reads better on tall portrait / vertical surfaces.
    if (ctx.archetype === 'portrait' || ctx.archetype === 'vertical') {
      candidates.push({
        strategy: 'stack',
        variant: 'left-aligned',
        regions: regions.map((r) =>
          r.accepts[0] === 'background' ? r : { ...r, align: 'start' as const },
        ),
        affinity: 0.72,
      })
    }
    return candidates
  },
}

// --------------------------------------------------------------------------
// split — imagery on one side, text block on the other.
// --------------------------------------------------------------------------
const split: Strategy = {
  name: 'split',
  applies: (a) => a === 'banner' || a === 'square' || a === 'landscape',
  build: (ctx) => {
    const { budget, roles, frame } = ctx
    if (!has(roles, 'product') && !has(roles, 'background')) return []

    const make = (imageLeft: boolean): LayoutCandidate => {
      const [a, b] = cols(budget, [{ weight: 1 }, { weight: 1.05 }], GAP * 1.5)
      const imgCol = imageLeft ? a : b
      const txtCol = imageLeft ? b : a
      const txtRows = rows(
        txtCol,
        [
          ...(has(roles, 'logo') ? [{ weight: 0, min: 26, max: 48 }] : []),
          ...(has(roles, 'headline') ? [{ weight: 2 }] : []),
          ...(has(roles, 'subhead') ? [{ weight: 1 }] : []),
          ...(has(roles, 'cta')
            ? [{ weight: 0, min: ctrlBand(ctx).min, max: ctrlBand(ctx).max }]
            : []),
        ],
        GAP,
      )
      const regions: Region[] = [
        bgRegion(frame),
        { accepts: ['product', 'background'], rect: imgCol, align: 'center' },
      ]
      let ri = 0
      const push = (role: ElementRole) => {
        regions.push({ accepts: [role], rect: txtRows[ri++], align: 'start' })
      }
      if (has(roles, 'logo')) push('logo')
      if (has(roles, 'headline')) push('headline')
      if (has(roles, 'subhead')) push('subhead')
      if (has(roles, 'cta')) push('cta')
      return {
        strategy: 'split',
        variant: imageLeft ? 'image-left' : 'image-right',
        regions,
        affinity: 0.74,
      }
    }
    return [make(false), make(true)]
  },
}

// --------------------------------------------------------------------------
// hero-overlay — full-bleed image, text in a scrimmed band.
// --------------------------------------------------------------------------
const heroOverlay: Strategy = {
  name: 'hero-overlay',
  applies: (a) =>
    a === 'square' ||
    a === 'portrait' ||
    a === 'vertical' ||
    a === 'landscape' ||
    a === 'banner',
  build: (ctx) => {
    const { budget, roles, frame } = ctx
    if (!has(roles, 'background') && !has(roles, 'product')) return []

    const band = (where: 'bottom' | 'top' | 'center'): LayoutCandidate => {
      const bandH = budget.h * (ctx.archetype === 'vertical' ? 0.34 : 0.44)
      const bandRect =
        where === 'bottom'
          ? rect(budget.x, budget.y + budget.h - bandH, budget.w, bandH)
          : where === 'top'
            ? rect(budget.x, budget.y, budget.w, bandH)
            : alignIn(budget, budget.w, bandH, 'center', 'center')

      const parts = rows(
        bandRect,
        [
          ...(has(roles, 'logo') && where !== 'center'
            ? [{ weight: 0, min: 26, max: 44 }]
            : []),
          ...(has(roles, 'headline') ? [{ weight: 2 }] : []),
          ...(has(roles, 'subhead') ? [{ weight: 1 }] : []),
          ...(has(roles, 'cta')
            ? [{ weight: 0, min: ctrlBand(ctx).min, max: ctrlBand(ctx).max }]
            : []),
        ],
        GAP,
      )
      const regions: Region[] = [
        { accepts: ['background', 'product'], rect: frame, overlay: true },
      ]
      let i = 0
      const align = where === 'center' ? ('center' as const) : ('start' as const)
      if (has(roles, 'logo') && where !== 'center')
        regions.push({ accepts: ['logo'], rect: parts[i++], overlay: true, align })
      if (has(roles, 'headline'))
        regions.push({ accepts: ['headline'], rect: parts[i++], overlay: true, align })
      if (has(roles, 'subhead'))
        regions.push({ accepts: ['subhead'], rect: parts[i++], overlay: true, align })
      if (has(roles, 'cta'))
        regions.push({ accepts: ['cta'], rect: parts[i++], overlay: true, align })
      if (has(roles, 'badge'))
        regions.push({
          accepts: ['badge'],
          rect: rect(budget.x, budget.y, 120, 40),
          overlay: true,
          align: 'start',
        })
      return { strategy: 'hero-overlay', variant: `band-${where}`, regions, affinity: 0.78 }
    }

    const out = [band('bottom')]
    if (ctx.archetype !== 'vertical') out.push(band('center'))
    out.push(band('top'))
    return out
  },
}

// --------------------------------------------------------------------------
// sidebar — narrow brand rail + large product area. Landscape / banner.
// --------------------------------------------------------------------------
const sidebar: Strategy = {
  name: 'sidebar',
  applies: (a) => a === 'landscape' || a === 'banner' || a === 'ultrawide',
  build: (ctx) => {
    const { budget, roles, frame } = ctx
    if (!has(roles, 'product')) return []
    const railW = Math.min(320, Math.max(180, budget.w * 0.3))
    const [rail, main] = cols(
      budget,
      [{ weight: 0, min: railW, max: railW }, { weight: 1 }],
      GAP * 1.5,
    )
    const railParts = rows(
      rail,
      [
        ...(has(roles, 'logo') ? [{ weight: 0, min: 30, max: 52 }] : []),
        ...(has(roles, 'headline') ? [{ weight: 2 }] : []),
        ...(has(roles, 'subhead') ? [{ weight: 1 }] : []),
        ...(has(roles, 'cta')
          ? [{ weight: 0, min: ctrlBand(ctx).min, max: ctrlBand(ctx).max }]
          : []),
      ],
      GAP,
    )
    const regions: Region[] = [
      bgRegion(frame),
      { accepts: ['product'], rect: main, align: 'center' },
    ]
    let i = 0
    for (const role of ['logo', 'headline', 'subhead', 'cta'] as ElementRole[]) {
      if (has(roles, role))
        regions.push({ accepts: [role], rect: railParts[i++], align: 'start' })
    }
    return [{ strategy: 'sidebar', variant: 'rail-left', regions, affinity: 0.7 }]
  },
}

// --------------------------------------------------------------------------
// poster — centered composition over full-bleed background. Square / portrait.
// --------------------------------------------------------------------------
const poster: Strategy = {
  name: 'poster',
  applies: (a) => a === 'square' || a === 'portrait' || a === 'vertical',
  build: (ctx) => {
    const { budget, roles, frame } = ctx
    const core = inset(budget, {
      top: budget.h * 0.12,
      bottom: budget.h * 0.12,
      left: budget.w * 0.06,
      right: budget.w * 0.06,
    })
    const parts = rows(
      core,
      [
        ...(has(roles, 'logo') ? [{ weight: 0, min: 30, max: 52 }] : []),
        ...(has(roles, 'badge') ? [{ weight: 0, min: 24, max: 40 }] : []),
        ...(has(roles, 'headline') ? [{ weight: 3 }] : []),
        ...(has(roles, 'subhead') ? [{ weight: 1.4 }] : []),
        ...(has(roles, 'cta')
          ? [{ weight: 0, min: ctrlBand(ctx).min, max: ctrlBand(ctx).max }]
          : []),
      ],
      GAP * 1.4,
    )
    const regions: Region[] = [bgRegion(frame)]
    let i = 0
    for (const role of ['logo', 'badge', 'headline', 'subhead', 'cta'] as ElementRole[]) {
      if (has(roles, role))
        regions.push({
          accepts: [role],
          rect: parts[i++],
          overlay: has(roles, 'background'),
          align: 'center',
        })
    }
    return [{ strategy: 'poster', variant: 'centered', regions, affinity: 0.68 }]
  },
}

export const STRATEGIES: Strategy[] = [strip, stack, split, heroOverlay, sidebar, poster]
