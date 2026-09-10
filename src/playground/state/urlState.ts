/**
 * Shareable playground state, encoded into the URL hash. Only the knobs that
 * change what the engine sees are persisted; everything else is view state.
 */
import type { AdElement, Creative } from '@engine/types'
import { CREATIVE_BY_ID, CREATIVES } from '@data/creatives'

export type PlaygroundView = 'wall' | 'scrubber'

export const SCRUB_MIN = 50
export const SCRUB_MAX = 3840

function clampDim(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(SCRUB_MIN, Math.min(SCRUB_MAX, Math.round(v)))
    : 600
}

export interface PlaygroundState {
  creativeId: string
  /** Per-element text overrides, keyed by element id. */
  overrides: Record<string, string>
  /** Surfaces resized away from their preset, keyed by surface id -> [w, h]. */
  resized: Record<string, [number, number]>
  selectedSurface: string
  debug: { safeArea: boolean; boxes: boolean; focal: boolean; baseline: boolean }
  preferCanvas: boolean
  view: PlaygroundView
  /** Scrubber dimensions, [w, h]. */
  scrub: [number, number]
}

export const DEFAULT_STATE: PlaygroundState = {
  creativeId: CREATIVES[0].id,
  overrides: {},
  resized: {},
  selectedSurface: 'story',
  debug: { safeArea: false, boxes: false, focal: false, baseline: false },
  preferCanvas: true,
  view: 'wall',
  scrub: [1080, 1350],
}

export function encodeState(s: PlaygroundState): string {
  const compact = {
    c: s.creativeId,
    o: s.overrides,
    r: s.resized,
    s: s.selectedSurface,
    d: [s.debug.safeArea, s.debug.boxes, s.debug.focal, s.debug.baseline]
      .map((b) => (b ? 1 : 0))
      .join(''),
    m: s.preferCanvas ? 1 : 0,
    v: s.view === 'scrubber' ? 1 : 0,
    z: s.scrub,
  }
  return btoa(encodeURIComponent(JSON.stringify(compact)))
}

export function decodeState(hash: string): PlaygroundState {
  try {
    const raw = JSON.parse(decodeURIComponent(atob(hash.replace(/^#/, ''))))
    const d = String(raw.d ?? '0000')
    return {
      creativeId: CREATIVE_BY_ID[raw.c] ? raw.c : DEFAULT_STATE.creativeId,
      overrides: typeof raw.o === 'object' && raw.o ? raw.o : {},
      resized: typeof raw.r === 'object' && raw.r ? raw.r : {},
      selectedSurface: raw.s ?? DEFAULT_STATE.selectedSurface,
      debug: {
        safeArea: d[0] === '1',
        boxes: d[1] === '1',
        focal: d[2] === '1',
        baseline: d[3] === '1',
      },
      preferCanvas: raw.m ? true : false,
      view: raw.v ? 'scrubber' : 'wall',
      scrub:
        Array.isArray(raw.z) && raw.z.length === 2
          ? [clampDim(raw.z[0]), clampDim(raw.z[1])]
          : DEFAULT_STATE.scrub,
    }
  } catch {
    return DEFAULT_STATE
  }
}

/** Apply text overrides to a creative, returning a new Creative. */
export function applyOverrides(base: Creative, overrides: Record<string, string>): Creative {
  if (!Object.keys(overrides).length) return base
  return {
    ...base,
    elements: base.elements.map((el): AdElement => {
      const o = overrides[el.id]
      if (o == null) return el
      if (el.kind === 'image' && (o.startsWith('http') || o.startsWith('data:'))) {
        return { ...el, content: o }
      }
      if (el.kind === 'text') return { ...el, content: o }
      return el
    }),
  }
}
