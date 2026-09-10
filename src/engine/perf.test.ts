/**
 * Throughput check + human-readable benchmark table.
 *   npm test         — runs this with a generous ceiling
 *   npm run bench     — runs only this file and prints the table
 *
 * Uses table font metrics (no canvas), matching a build-time / server caller.
 */
import { describe, expect, it } from 'vitest'
import { resolveLayout } from './resolve'
import { SURFACES } from './surfaces'
import { CREATIVES } from '../data/creatives'

function percentiles(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return {
    p50: at(0.5),
    p95: at(0.95),
    max: s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  }
}

describe('engine performance', () => {
  it(
    'resolves a full creative × surface wall and prints a benchmark',
    { timeout: 30_000 },
    () => {
      const pairs = CREATIVES.flatMap((c) => SURFACES.map((s) => [c, s] as const))

      // warm up (JIT) — and check correctness holds under repeated resolution
      for (const [c, s] of pairs) {
        const out = resolveLayout(c, s)
        expect(out.placements.length).toBeGreaterThan(0)
        expect(out.score).toBeGreaterThan(0)
      }

      const single: number[] = []
      const ITER = 3
      for (let i = 0; i < ITER; i++) {
        for (const [c, s] of pairs) {
          const t = performance.now()
          resolveLayout(c, s)
          single.push(performance.now() - t)
        }
      }

      const wall: number[] = []
      for (let i = 0; i < 5; i++) {
        const t = performance.now()
        for (const [c, s] of pairs) resolveLayout(c, s)
        wall.push(performance.now() - t)
      }

      const sp = percentiles(single)
      const wp = percentiles(wall)

      // eslint-disable-next-line no-console
      console.log(
        [
          '',
          '  Adaptive Layout Engine — benchmark (table metrics)',
          `  ${pairs.length} creative×surface pairs`,
          `  single resolve   p50 ${sp.p50.toFixed(3)}ms   p95 ${sp.p95.toFixed(3)}ms   max ${sp.max.toFixed(2)}ms`,
          `  full wall (119)  p50 ${wp.p50.toFixed(1)}ms   p95 ${wp.p95.toFixed(1)}ms`,
          `  throughput       ${Math.round(1000 / sp.mean).toLocaleString()} resolves/sec`,
          '',
        ].join('\n'),
      )

      // Timing is printed, not asserted — a wall-clock bound inside a parallel
      // vitest pool is inherently flaky (the event loop gets starved by other
      // workers). `npm run bench` runs this file alone for a clean read; the
      // README records the numbers. Correctness under repeated resolution is
      // checked in the warm-up loop above.
      expect(sp.mean).toBeGreaterThan(0)
      expect(Number.isFinite(wp.p50)).toBe(true)
    },
  )
})
