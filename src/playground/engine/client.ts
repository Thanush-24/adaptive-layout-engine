/**
 * Promise wrapper around the layout worker, with latest-wins semantics: while a
 * request is in flight, new calls are queued and only the most recent survives —
 * exactly what a resize scrubber needs. Falls back to a synchronous in-thread
 * resolve if Workers are unavailable (SSR, old browsers, tests).
 */
import { resolveLayout } from '@engine/resolve'
import type { Creative, ResolvedLayout, Surface } from '@engine/types'
import type { ResolveOptions } from '@engine/resolve'
import type { ResolveRequest, ResolveResponse } from './protocol'

export interface LayoutEngineClient {
  resolve(creative: Creative, surfaces: Surface[], opts?: ResolveOptions): Promise<EngineResult>
  dispose(): void
  readonly threaded: boolean
}

export interface EngineResult {
  layouts: ResolvedLayout[]
  /** Wall-clock ms measured on the main thread (round-trip incl. clone). */
  roundTripMs: number
  /** ms the worker itself spent resolving (0 in the sync fallback). */
  workerMs: number
}

export function createLayoutEngineClient(): LayoutEngineClient {
  let worker: Worker | null = null
  try {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    }
  } catch {
    worker = null
  }

  if (!worker) {
    return {
      threaded: false,
      dispose() {},
      async resolve(creative, surfaces, opts) {
        const t0 = performance.now()
        const layouts = surfaces.map((s) => resolveLayout(creative, s, opts))
        return { layouts, roundTripMs: round(performance.now() - t0), workerMs: 0 }
      },
    }
  }

  interface PendingEntry {
    resolve: (r: EngineResult) => void
    reject: (e: unknown) => void
    t0: number
  }

  let seq = 0
  const pending = new Map<number, PendingEntry>()
  // latest-wins queue: only the most recent un-sent request survives
  let queued: { req: Omit<ResolveRequest, 'id'>; entry: PendingEntry } | null = null
  let inFlight = false

  const w = worker
  w.onmessage = (e: MessageEvent<ResolveResponse>) => {
    const { id, layouts, workerMs } = e.data
    const p = pending.get(id)
    if (p) {
      pending.delete(id)
      p.resolve({ layouts, workerMs, roundTripMs: round(performance.now() - p.t0) })
    }
    inFlight = false
    flush()
  }
  w.onerror = (e) => {
    for (const p of pending.values()) p.reject(e)
    pending.clear()
    inFlight = false
  }

  function flush() {
    if (inFlight || !queued) return
    const { req, entry } = queued
    queued = null
    const id = ++seq
    pending.set(id, entry)
    inFlight = true
    w.postMessage({ id, ...req } satisfies ResolveRequest)
  }

  return {
    threaded: true,
    dispose() {
      w.terminate()
    },
    resolve(creative, surfaces, opts) {
      return new Promise<EngineResult>((resolve, reject) => {
        // supersede any queued (not yet sent) request
        if (queued) queued.entry.reject(new Error('superseded'))
        queued = {
          req: { creative, surfaces, opts },
          entry: { resolve, reject, t0: performance.now() },
        }
        flush()
      })
    },
  }
}

const round = (v: number) => Math.round(v * 100) / 100
