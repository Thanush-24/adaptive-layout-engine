/**
 * Placement: turn a candidate region map + the creative's elements into concrete
 * `Placement`s. Fits text, fits images around their focal point, and resolves
 * per-element colors against the local background.
 *
 * Every element assigned to a region is placed. Elements with no region are
 * returned as `unplaced` — except `required` ones, which are force-placed into a
 * carved sliver so the contract "a required element is always rendered" holds;
 * the scorer and auditor then penalise / flag the compromise.
 */
import { MIN_LEGIBLE_PX } from '../surfaces'
import { alignIn, inset, rect } from '../geometry'
import { resolveTextStyle } from '../defaults'
import { fitText, toResolvedText } from '../text/fit'
import { fitImage } from '../image/focal'
import { chooseForeground, luminance, luminanceOf, onColor, parseHex } from '../image/color'
import type {
  AdElement,
  Creative,
  DroppedElement,
  LayoutCandidate,
  Placement,
  Rect,
  Region,
  ResolvedColors,
  Surface,
} from '../types'

export interface PlaceResult {
  placements: Placement[]
  unplaced: DroppedElement[]
  baseLuminance: number
}

const CTA_PAD_X = 18
const CTA_PAD_Y = 10

export function place(
  creative: Creative,
  surface: Surface,
  candidate: LayoutCandidate,
  active: AdElement[],
  preferCanvas: boolean,
): PlaceResult {
  const frame = rect(0, 0, surface.w, surface.h)
  const budget = inset(frame, surface.safe)
  const minLegible = MIN_LEGIBLE_PX[surface.viewingDistance]

  const bgEl = active.find((e) => e.role === 'background')
  const baseLuminance = bgEl ? (bgEl.image?.luminance ?? luminanceOf(bgEl.content)) : 0.98

  const placements: Placement[] = []
  const placedIds = new Set<string>()
  let z = 0

  const localBgLuminance = (region: { rect: Rect; overlay?: boolean }): number => {
    if (!region.overlay) return baseLuminance
    const base = bgEl ? (bgEl.image?.luminance ?? luminanceOf(bgEl.content)) : 0.5
    const centerY = (region.rect.y + region.rect.h / 2) / frame.h
    const v = base + (centerY - 0.5) * -0.12
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

  const placeInto = (el: AdElement, region: Region, forced: boolean): boolean => {
    z += 1
    const pad = forced ? 0 : roleInset(el, surface)
    const box = clampToFrame(inset(region.rect, pad), frame)
    if (box.w <= 2 || box.h <= 2) return false

    if (el.role === 'background') {
      const img = el.image ?? { aspect: surface.w / surface.h }
      placements.push({
        id: el.id,
        role: 'background',
        kind: el.kind,
        rect: frame,
        z: 0,
        image: el.kind === 'image' ? fitImage(img, frame, { mode: 'cover' }) : undefined,
        content: el.content,
      })
      return true
    }

    if (el.kind === 'image') {
      const img = el.image ?? { aspect: 1 }
      const inner = el.role === 'product' ? inset(box, Math.min(box.w, box.h) * 0.04) : box
      const drawRect = img.protect ? containRect(inner, img.aspect) : inner
      placements.push({
        id: el.id,
        role: el.role,
        kind: 'image',
        rect: drawRect,
        z,
        image: fitImage(img, drawRect, { mode: img.protect ? 'contain' : 'cover' }),
        content: el.content,
      })
      return true
    }

    // text / shape
    const style = resolveTextStyle(el)
    const isCta = el.role === 'cta'
    const textBox = isCta
      ? inset(box, { top: CTA_PAD_Y, bottom: CTA_PAD_Y, left: CTA_PAD_X, right: CTA_PAD_X })
      : box

    const fit = fitText({
      text: el.content,
      boxW: Math.max(4, textBox.w),
      boxH: Math.max(4, textBox.h),
      style,
      preferCanvas,
    })

    const localL = localBgLuminance(region)
    const colors: ResolvedColors = isCta
      ? ctaColors(creative.brandColor)
      : el.color
        ? { fg: el.color, bgLuminance: round3(localL), contrast: 21 }
        : toResolvedColors(
            chooseForeground(localL, el.role === 'headline' ? 3 : 4.5, region.overlay),
          )

    const textW = Math.min(textBox.w, fit.usedW)
    const textH = Math.min(textBox.h, fit.usedH)
    const align = region.align ?? 'start'
    const inner = alignIn(
      textBox,
      textW,
      textH,
      align,
      region.overlay ? 'center' : el.role === 'legal' ? 'end' : 'center',
    )
    const expanded = isCta
      ? inset(inner, {
          top: -CTA_PAD_Y,
          bottom: -CTA_PAD_Y,
          left: -CTA_PAD_X,
          right: -CTA_PAD_X,
        })
      : inner
    // Hard guarantee: nothing ever renders outside the surface, however
    // degenerate the region. Safe-area / legibility compromises are the
    // scorer's and auditor's job to flag; a frame breach is never allowed.
    const placedRect = clampToFrame(expanded, frame)

    placements.push({
      id: el.id,
      role: el.role,
      kind: el.kind,
      rect: placedRect,
      z,
      text: toResolvedText(fit, style),
      colors,
      content: el.content,
    })
    void forced
    void minLegible
    return true
  }

  const minimalPlacement = (el: AdElement, box: Rect): void => {
    z += 1
    if (el.kind === 'text') {
      const style = resolveTextStyle(el)
      const fit = fitText({
        text: el.content,
        boxW: Math.max(4, box.w),
        boxH: Math.max(4, box.h),
        style,
        preferCanvas,
      })
      placements.push({
        id: el.id,
        role: el.role,
        kind: 'text',
        rect: box,
        z,
        text: toResolvedText(fit, style),
        colors: toResolvedColors(chooseForeground(baseLuminance, 4.5)),
        content: el.content,
      })
    } else {
      placements.push({
        id: el.id,
        role: el.role,
        kind: el.kind,
        rect: box,
        z,
        content: el.content,
      })
    }
  }

  // 1) assign one element per region, first matching role in region order.
  for (const region of candidate.regions) {
    for (const role of region.accepts) {
      const el = active.find((e) => e.role === role && !placedIds.has(e.id))
      if (!el) continue
      if (placeInto(el, region, false)) placedIds.add(el.id)
      break
    }
  }

  // 2) force-place any unplaced *required* element into a carved sliver.
  const unplaced: DroppedElement[] = []
  for (const el of active) {
    if (placedIds.has(el.id)) continue
    if (el.required) {
      const region = carveFallbackRegion(el, budget, frame, placements)
      if (placeInto(el, region, true)) {
        placedIds.add(el.id)
        continue
      }
      // Last resort for a pathologically small surface: a minimal frame-anchored
      // placement so the "required element always renders" contract still holds.
      const w = Math.min(frame.w, Math.max(24, frame.w - 4))
      const h = Math.min(frame.h, el.role === 'legal' ? 12 : 20)
      minimalPlacement(el, clampToFrame(rect(2, 2, w, h), frame))
      placedIds.add(el.id)
      continue
    }
    unplaced.push({ id: el.id, role: el.role, reason: 'no region available in this layout' })
  }

  return { placements, unplaced, baseLuminance }
}

// ---- helpers ----

/**
 * A small constant breathing-room inset applied inside a region before fitting.
 * Deliberately tiny and absolute — strategies already space tracks with a gap,
 * and a proportional inset collapses short control tracks on large surfaces.
 */
function roleInset(el: AdElement, _surface: Surface): number {
  switch (el.role) {
    case 'legal':
      return 1
    case 'cta':
      return 3
    case 'headline':
      return 2
    default:
      return 4
  }
}

function clampToFrame(r: Rect, frame: Rect): Rect {
  const x = Math.max(frame.x, r.x)
  const y = Math.max(frame.y, r.y)
  const w = Math.min(r.x + r.w, frame.x + frame.w) - x
  const h = Math.min(r.y + r.h, frame.y + frame.h) - y
  return rect(x, y, Math.max(0, w), Math.max(0, h))
}

function containRect(box: Rect, aspect: number): Rect {
  const boxAR = box.w / box.h
  let w = box.w
  let h = box.h
  if (aspect > boxAR) h = w / aspect
  else w = h * aspect
  return alignIn(box, w, h, 'center', 'center')
}

/**
 * Carve a last-resort region for a required element that no strategy region
 * could host. Legal → a thin band pinned to the bottom safe edge; everything
 * else → a small box in the top-left safe corner. Deliberately cramped so the
 * scorer still prefers layouts that gave the element a real slot.
 */
function carveFallbackRegion(
  el: AdElement,
  budget: Rect,
  frame: Rect,
  placed: Placement[],
): Region {
  void placed
  // Prefer the safe budget, but never let it collapse below a usable size —
  // fall back toward the full frame for pathologically small budgets.
  const w = Math.max(budget.w, Math.min(frame.w, 48))
  const x = Math.min(budget.x, frame.w - w)

  if (el.role === 'legal') {
    const h = Math.max(Math.min(budget.h * 0.18, 26), 10)
    const y = Math.min(budget.y + budget.h - h, frame.h - h)
    return { accepts: [el.role], rect: rect(x, y, w, h), overlay: true, align: 'start' }
  }
  const h = Math.max(Math.min(budget.h * 0.5, el.role === 'cta' ? 48 : 64), 14)
  const y = Math.min(budget.y, frame.h - h)
  return { accepts: [el.role], rect: rect(x, y, w, h), overlay: true, align: 'start' }
}

function ctaColors(brand: string): ResolvedColors {
  const bl = luminance(parseHex(brand))
  return { fg: onColor(brand), bgLuminance: round3(bl), contrast: 21 }
}

function toResolvedColors(c: ReturnType<typeof chooseForeground>): ResolvedColors {
  return { fg: c.fg, bgLuminance: c.bgLuminance, contrast: c.contrast, scrim: c.scrim }
}

const round3 = (v: number) => Math.round(v * 1000) / 1000
