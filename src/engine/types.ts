/**
 * Core data model for the Adaptive Layout Engine.
 *
 * The engine is a pure function of `(Creative, Surface) -> ResolvedLayout`. Nothing
 * in this file (or anywhere under `src/engine`) may import React or touch the DOM,
 * so the engine can run in Node, a worker, or a build step unchanged.
 */

/** A point in normalized [0..1] coordinates, origin top-left. */
export interface Vec2 {
  x: number
  y: number
}

/** An axis-aligned rectangle in device pixels, origin top-left. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Semantic role of an element. Roles carry layout intent: the engine uses them to
 * decide reading order, space weighting, degradation priority and styling.
 */
export type ElementRole =
  'background' | 'logo' | 'headline' | 'subhead' | 'cta' | 'product' | 'badge' | 'legal'

export type ElementKind = 'text' | 'image' | 'shape'

/** Preferred contrast polarity for text / shapes. `auto` lets the engine choose. */
export type Tone = 'light' | 'dark' | 'auto'

/** Font weight buckets the renderer understands. */
export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'black'

export interface TextStyle {
  /** Font family stack; the metrics table keys off the first family. */
  family?: string
  weight?: Weight
  /** Hard lower bound on rendered size in px. Default derives from role. */
  minPx?: number
  /** Hard upper bound on rendered size in px. Default derives from role. */
  maxPx?: number
  /** Maximum lines before the fitter must shrink or the auditor warns. */
  maxLines?: number
  /** Tracking in em, e.g. -0.01 for tight display type. */
  letterSpacing?: number
  /** Line height as a multiple of font size. Default 1.15. */
  lineHeight?: number
  transform?: 'none' | 'uppercase'
}

export interface ImageStyle {
  /** Intrinsic aspect ratio (w / h) of the source asset. */
  aspect: number
  /**
   * Focal point in [0..1] of the source. The engine keeps this point in frame
   * and biases cropping around it. Defaults to the center.
   */
  focal?: Vec2
  /** Dominant luminance of the asset in [0..1]; drives auto text color / scrim. */
  luminance?: number
  /** If true the asset has its own safe padding and should not be cropped hard. */
  protect?: boolean
}

export interface AdElement {
  id: string
  role: ElementRole
  kind: ElementKind
  /** Text content, or an asset URL / gradient token for image & shape kinds. */
  content: string
  /**
   * Degradation priority in [0..100]. Higher survives longer. The engine drops
   * the lowest-priority non-required elements first when content will not fit.
   */
  priority: number
  /** Required elements are never dropped; if they cannot fit the layout is flagged. */
  required?: boolean
  tone?: Tone
  text?: TextStyle
  image?: ImageStyle
  /** Optional fixed color for shapes / text overrides (hex). */
  color?: string
}

export interface Creative {
  id: string
  name: string
  /** Vertical / campaign tag, purely informational. */
  vertical?: string
  /** Brand accent color (hex), used for CTA fills and shape defaults. */
  brandColor: string
  elements: AdElement[]
}

export type Channel = 'display' | 'social' | 'ctv' | 'dooh' | 'native'

/** How far the viewer typically sits from the surface. Drives minimum legible px. */
export type ViewingDistance = 'near' | 'mid' | 'far'

/** Inset from each edge, in px, that content must stay clear of. */
export interface SafeArea {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Surface {
  id: string
  label: string
  w: number
  h: number
  channel: Channel
  safe: SafeArea
  viewingDistance: ViewingDistance
  /** Whether motion is permitted on this placement. */
  motion?: boolean
  /** Whether the surface is directly interactive (clickable CTA vs. QR / scan). */
  interactive?: boolean
}

/** Broad shape bucket the surface classifier assigns. Strategies gate on this. */
export type Archetype =
  | 'micro' // tiny strip, e.g. 320x50 — logo + CTA only
  | 'strip' // wide and short, e.g. 728x90 / 970x250
  | 'banner' // moderate landscape, e.g. 300x250 / 1200x628
  | 'square' // ~1:1
  | 'portrait' // taller than wide, e.g. 300x600 / 1080x1350
  | 'vertical' // extreme portrait, e.g. 1080x1920 stories / DOOH
  | 'landscape' // 16:9-ish large format, e.g. CTV 1920x1080
  | 'ultrawide' // >2.4:1, e.g. 3840x1080 DOOH

export interface ResolvedText {
  /** Wrapped lines as rendered. */
  lines: string[]
  fontPx: number
  lineHeight: number
  letterSpacing: number
  weight: Weight
  transform: 'none' | 'uppercase'
}

export interface ResolvedImage {
  /**
   * Source-space crop rectangle in [0..1], and the CSS `object-position` /
   * `object-fit` that reproduce it on an <img> without JS.
   */
  crop: Rect
  objectFit: 'cover' | 'contain'
  objectPosition: string
  /** How much of the source area is discarded, in [0..1]. */
  cropLoss: number
}

export interface ResolvedColors {
  /** Foreground color chosen for legibility against the local background. */
  fg: string
  /** Scrim overlay color + opacity applied behind text over imagery, if any. */
  scrim?: { color: string; opacity: number }
  /** Effective background luminance the fg was chosen against, in [0..1]. */
  bgLuminance: number
  /** WCAG contrast ratio of fg against that background. */
  contrast: number
}

export interface Placement {
  id: string
  role: ElementRole
  kind: ElementKind
  rect: Rect
  z: number
  text?: ResolvedText
  image?: ResolvedImage
  colors?: ResolvedColors
  /** Raw content passed through for the renderer. */
  content: string
}

export type WarningCode =
  | 'frame-breach'
  | 'safe-area'
  | 'text-overlap'
  | 'sub-legible'
  | 'severe-crop'
  | 'required-dropped'
  | 'low-score'

export interface Warning {
  code: WarningCode
  elementId?: string
  message: string
  severity: 'info' | 'warn' | 'error'
}

export interface DroppedElement {
  id: string
  role: ElementRole
  reason: string
}

/** Per-rule score in [0..1] plus its weight, so the UI can show the breakdown. */
export interface RuleScore {
  rule: string
  score: number
  weight: number
  detail?: string
}

export interface CandidateTrace {
  strategy: string
  variant: string
  /** Weighted total in [0..1]. */
  score: number
  ruleScores: RuleScore[]
  /** Elements this candidate had to drop to fit, before scoring. */
  dropped: DroppedElement[]
  rejected?: string
}

export interface DegradationStep {
  droppedId: string
  role: ElementRole
  reason: string
  scoreBefore: number
  scoreAfter: number
}

export interface Trace {
  archetype: Archetype
  contentBudget: Rect
  candidates: CandidateTrace[]
  winner: { strategy: string; variant: string; score: number }
  degradation: DegradationStep[]
  /** Wall-clock solve time in ms, filled by `resolveLayout`. */
  elapsedMs: number
}

export interface ResolvedLayout {
  surface: Surface
  creativeId: string
  placements: Placement[]
  dropped: DroppedElement[]
  /** Weighted composite quality score in [0..1]. */
  score: number
  ruleScores: RuleScore[]
  warnings: Warning[]
  trace: Trace
}

/** A region the partitioner hands to placement: a rect plus the role it should host. */
export interface Region {
  /** Roles this region is allowed to host, in preference order. */
  accepts: ElementRole[]
  rect: Rect
  /** If true, elements here render over the region behind them (overlay). */
  overlay?: boolean
  /** Text alignment hint for this region. */
  align?: 'start' | 'center' | 'end'
}

export interface LayoutCandidate {
  strategy: string
  variant: string
  regions: Region[]
  /** A priori suitability in [0..1] from the strategy itself, before placement. */
  affinity: number
}
