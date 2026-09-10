/**
 * Role-derived defaults. Authors give minimal input (a string + a role); the
 * engine fills in sensible typography and priority so a bare creative still
 * resolves well.
 */
import type { AdElement, ElementRole, TextStyle, Weight } from './types'

const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

interface RoleDefault {
  weight: Weight
  minPx: number
  maxPx: number
  maxLines: number
  letterSpacing: number
  lineHeight: number
  transform: 'none' | 'uppercase'
  priority: number
}

export const ROLE_DEFAULTS: Record<ElementRole, RoleDefault> = {
  background: {
    weight: 'regular',
    minPx: 0,
    maxPx: 0,
    maxLines: 0,
    letterSpacing: 0,
    lineHeight: 1,
    transform: 'none',
    priority: 20,
  },
  logo: {
    weight: 'bold',
    minPx: 12,
    maxPx: 40,
    maxLines: 1,
    letterSpacing: -0.01,
    lineHeight: 1,
    transform: 'none',
    priority: 90,
  },
  headline: {
    weight: 'bold',
    minPx: 14,
    maxPx: 132,
    maxLines: 3,
    letterSpacing: -0.02,
    lineHeight: 1.08,
    transform: 'none',
    priority: 100,
  },
  subhead: {
    weight: 'regular',
    minPx: 11,
    maxPx: 40,
    maxLines: 3,
    letterSpacing: -0.005,
    lineHeight: 1.25,
    transform: 'none',
    priority: 60,
  },
  cta: {
    weight: 'semibold',
    minPx: 12,
    maxPx: 44,
    maxLines: 1,
    letterSpacing: 0.01,
    lineHeight: 1,
    transform: 'none',
    priority: 95,
  },
  product: {
    weight: 'regular',
    minPx: 0,
    maxPx: 0,
    maxLines: 0,
    letterSpacing: 0,
    lineHeight: 1,
    transform: 'none',
    priority: 80,
  },
  badge: {
    weight: 'bold',
    minPx: 10,
    maxPx: 22,
    maxLines: 1,
    letterSpacing: 0.04,
    lineHeight: 1,
    transform: 'uppercase',
    priority: 45,
  },
  legal: {
    weight: 'regular',
    minPx: 9,
    maxPx: 28,
    maxLines: 3,
    letterSpacing: 0,
    lineHeight: 1.2,
    transform: 'none',
    priority: 30,
  },
}

export type ResolvedTextStyle = Required<
  Pick<
    TextStyle,
    | 'family'
    | 'weight'
    | 'minPx'
    | 'maxPx'
    | 'maxLines'
    | 'letterSpacing'
    | 'lineHeight'
    | 'transform'
  >
>

export function resolveTextStyle(el: AdElement): ResolvedTextStyle {
  const d = ROLE_DEFAULTS[el.role]
  const s = el.text ?? {}
  return {
    family: s.family ?? FAMILY,
    weight: s.weight ?? d.weight,
    minPx: s.minPx ?? d.minPx,
    maxPx: s.maxPx ?? d.maxPx,
    maxLines: s.maxLines ?? d.maxLines,
    letterSpacing: s.letterSpacing ?? d.letterSpacing,
    lineHeight: s.lineHeight ?? d.lineHeight,
    transform: s.transform ?? d.transform,
  }
}

export function effectivePriority(el: AdElement): number {
  return el.priority ?? ROLE_DEFAULTS[el.role].priority
}
