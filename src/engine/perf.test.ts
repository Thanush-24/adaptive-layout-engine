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
  it('resolves a full creative × surface wall quickly and prints a benchmark', () => {
    const pairs = CREATIVES.flatMap((c) => SURFACES.map((s) => [c, s] as const))

    // warm up (JIT)
    for (const [c, s] of pairs) resolveLayout(c, s)

    const single: number[] = []
    const ITER = 6
    for (let i = 0; i < ITER; i++) {
      for (const [c, s] of pairs) {
        const t = performance.now()
        resolveLayout(c, s)
        single.push(performance.now() - t)
      }
    }

    const wall: number[] = []
    for (let i = 0; i < 20; i++) {
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

    // Smoke ceiling only — a hard perf bound in a unit suite is flaky under
    // parallel CI load. The real numbers are printed above and tracked in the
    // README. Locally p50 is ~1.7ms with canvas-free table metrics.
    expect(sp.p50).toBeLessThan(50)
    expect(sp.mean).toBeGreaterThan(0)
  })
})
