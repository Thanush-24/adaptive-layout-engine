/// <reference lib="webworker" />
/**
 * The layout engine, off the main thread. Keeps the playground — the surface
 * wall plus the live resize scrubber — responsive while every re-resolve runs.
 */
import { resolveLayout } from '@engine/resolve'
import type { ResolveRequest, ResolveResponse } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<ResolveRequest>) => {
  const { id, creative, surfaces, opts } = e.data
  const t0 = performance.now()
  const layouts = surfaces.map((s) => resolveLayout(creative, s, opts))
  const res: ResolveResponse = {
    id,
    layouts,
    workerMs: Math.round((performance.now() - t0) * 100) / 100,
  }
  ctx.postMessage(res)
}
