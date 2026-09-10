import { describe, expect, it } from 'vitest'
import { solveTracks } from './partition'

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)

describe('solveTracks', () => {
  it('distributes by weight when unconstrained', () => {
    const r = solveTracks(300, [{ weight: 1 }, { weight: 2 }])
    expect(r[1] / r[0]).toBeCloseTo(2, 5)
    expect(sum(r)).toBeCloseTo(300, 5)
  })

  it('respects min and redistributes the remainder', () => {
    const r = solveTracks(200, [{ weight: 1, min: 120 }, { weight: 1 }])
    expect(r[0]).toBeGreaterThanOrEqual(120)
    expect(sum(r)).toBeCloseTo(200, 5)
  })

  it('respects max and gives slack to the others', () => {
    const r = solveTracks(300, [{ weight: 1, max: 50 }, { weight: 1 }])
    expect(r[0]).toBeLessThanOrEqual(50 + 1e-6)
    expect(r[1]).toBeCloseTo(250, 5)
  })

  it('accounts for gaps', () => {
    const r = solveTracks(220, [{ weight: 1 }, { weight: 1 }], 20)
    expect(sum(r)).toBeCloseTo(200, 5)
  })

  it('never returns negative sizes even when mins exceed the total', () => {
    const r = solveTracks(100, [
      { weight: 1, min: 80 },
      { weight: 1, min: 80 },
    ])
    expect(r.every((x) => x >= 0)).toBe(true)
  })
})
