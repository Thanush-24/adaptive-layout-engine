import type { Creative, ResolvedLayout, Surface } from '@engine/types'
import type { ResolveOptions } from '@engine/resolve'

export interface ResolveRequest {
  id: number
  creative: Creative
  surfaces: Surface[]
  opts?: ResolveOptions
}

export interface ResolveResponse {
  id: number
  layouts: ResolvedLayout[]
  /** Total wall-clock ms the worker spent, including structured-clone. */
  workerMs: number
}
