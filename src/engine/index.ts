/**
 * Adaptive Layout Engine — public API.
 *
 * Framework-agnostic: safe to import in Node, a worker, a build step, or the
 * browser. The only entry point most callers need is `resolveLayout`.
 */
export { resolveLayout } from './resolve'
export type { ResolveOptions } from './resolve'

export { classify, readingAxis, SURFACES, SURFACE_BY_ID, MIN_LEGIBLE_PX } from './surfaces'
export { STRATEGIES } from './layout/strategies'
export { fitText } from './text/fit'
export { measureEm } from './text/metrics'
export { fitImage, focalClipped } from './image/focal'
export {
  chooseForeground,
  contrastRatio,
  luminance,
  luminanceOf,
  parseHex,
  toHex,
  mix,
  onColor,
} from './image/color'
export { ROLE_DEFAULTS, resolveTextStyle, effectivePriority } from './defaults'

export * from './types'
