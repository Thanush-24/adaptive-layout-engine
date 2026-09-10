/**
 * Degradation policy: which element to remove next when a layout will not reach
 * an acceptable score with everything present. Lowest effective priority goes
 * first; `required` elements are never chosen; ties break deterministically by
 * a fixed role order then id.
 */
import { effectivePriority } from './defaults'
import type { AdElement, ElementRole } from './types'

const ROLE_SHED_ORDER: ElementRole[] = [
  'legal',
  'badge',
  'subhead',
  'product',
  'logo',
  'cta',
  'headline',
  'background',
]

export function nextToDrop(active: AdElement[]): AdElement | null {
  const droppable = active.filter((e) => !e.required && e.role !== 'headline')
  if (droppable.length === 0) return null

  return [...droppable].sort((a, b) => {
    const pa = effectivePriority(a)
    const pb = effectivePriority(b)
    if (pa !== pb) return pa - pb
    const ra = ROLE_SHED_ORDER.indexOf(a.role)
    const rb = ROLE_SHED_ORDER.indexOf(b.role)
    if (ra !== rb) return ra - rb
    return a.id < b.id ? -1 : 1
  })[0]
}
