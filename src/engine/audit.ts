/**
 * Post-hoc audit of the winning layout. The optimizer already prefers layouts
 * that avoid these problems; the auditor makes any residual issue explicit for
 * the trace panel and for CI assertions.
 */
import { MIN_LEGIBLE_PX } from './surfaces'
import { breach, inset, overlapArea, rect } from './geometry'
import type { Creative, DroppedElement, Placement, Surface, Warning } from './types'

export function audit(
  placements: Placement[],
  dropped: DroppedElement[],
  creative: Creative,
  surface: Surface,
  score: number,
): Warning[] {
  const warnings: Warning[] = []
  const frame = rect(0, 0, surface.w, surface.h)
  const safe = inset(frame, surface.safe)
  const min = MIN_LEGIBLE_PX[surface.viewingDistance]

  for (const p of placements) {
    if (p.role === 'background') continue
    const outFrame = breach(frame, p.rect)
    if (outFrame > 1) {
      warnings.push({
        code: 'frame-breach',
        elementId: p.id,
        severity: 'error',
        message: `${p.role} extends ${outFrame.toFixed(0)}px beyond the surface`,
      })
    } else {
      const outSafe = breach(safe, p.rect)
      if (outSafe > 1) {
        warnings.push({
          code: 'safe-area',
          elementId: p.id,
          severity: 'warn',
          message: `${p.role} intrudes ${outSafe.toFixed(0)}px into the safe-area margin`,
        })
      }
    }

    if (p.text) {
      const floor = p.role === 'legal' ? Math.max(9, min - 3) : min
      if (p.text.fontPx < floor) {
        warnings.push({
          code: 'sub-legible',
          elementId: p.id,
          severity: p.role === 'legal' ? 'info' : 'warn',
          message: `${p.role} renders at ${p.text.fontPx}px, below the ${floor}px legibility floor for ${surface.viewingDistance} viewing`,
        })
      }
      if (p.colors && p.colors.contrast < 4.5 && p.role !== 'cta') {
        warnings.push({
          code: 'sub-legible',
          elementId: p.id,
          severity: 'warn',
          message: `${p.role} contrast ${p.colors.contrast.toFixed(1)}:1 is below WCAG AA (4.5:1)`,
        })
      }
    }

    if (p.image && p.image.cropLoss > 0.55) {
      warnings.push({
        code: 'severe-crop',
        elementId: p.id,
        severity: 'warn',
        message: `${p.role} image loses ${(p.image.cropLoss * 100).toFixed(0)}% of its source area`,
      })
    }
  }

  // text collisions
  const texts = placements.filter((p) => p.text && p.role !== 'background')
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlapArea(texts[i].rect, texts[j].rect) > 4) {
        warnings.push({
          code: 'text-overlap',
          elementId: texts[i].id,
          severity: 'warn',
          message: `${texts[i].role} and ${texts[j].role} text boxes overlap`,
        })
      }
    }
  }

  for (const d of dropped) {
    const el = creative.elements.find((e) => e.id === d.id)
    warnings.push({
      code: el?.required ? 'required-dropped' : 'low-score',
      elementId: d.id,
      severity: el?.required ? 'error' : 'info',
      message: `${d.role} was dropped: ${d.reason}`,
    })
  }

  if (score < 0.55) {
    warnings.push({
      code: 'low-score',
      severity: 'warn',
      message: `composite quality score is ${score.toFixed(2)} — this surface may need a bespoke creative`,
    })
  }

  return warnings
}
