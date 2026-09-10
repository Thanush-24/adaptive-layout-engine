import { describe, expect, it } from 'vitest'
import { fitText } from './fit'
import { measureEm } from './metrics'

const style = {
  family: 'system-ui',
  weight: 'bold' as const,
  minPx: 8,
  maxPx: 120,
  maxLines: 3,
  letterSpacing: 0,
  lineHeight: 1.1,
  transform: 'none' as const,
}

describe('fitText', () => {
  it('returns the largest size that fits the box', () => {
    const small = fitText({ text: 'Big Sale', boxW: 200, boxH: 40, style })
    const large = fitText({ text: 'Big Sale', boxW: 600, boxH: 200, style })
    expect(large.fontPx).toBeGreaterThan(small.fontPx)
    expect(small.fits).toBe(true)
  })

  it('never exceeds the width of the box', () => {
    const r = fitText({ text: 'Escape the grey this winter', boxW: 320, boxH: 400, style })
    for (const line of r.lines) {
      expect(
        measureEm(line, { family: 'system-ui', weight: 'bold', letterSpacing: 0 }) * r.fontPx,
      ).toBeLessThanOrEqual(321)
    }
  })

  it('respects maxLines', () => {
    const r = fitText({
      text: 'one two three four five six seven eight nine ten',
      boxW: 120,
      boxH: 400,
      style: { ...style, maxLines: 2 },
    })
    expect(r.lines.length).toBeLessThanOrEqual(2)
  })

  it('clamps to minPx and flags a clip when nothing fits', () => {
    const r = fitText({
      text: 'A very long headline that cannot possibly fit',
      boxW: 40,
      boxH: 12,
      style: { ...style, minPx: 10 },
    })
    expect(r.fontPx).toBe(10)
    expect(r.clipped).toBe(true)
    expect(r.fits).toBe(false)
  })

  it('balances lines rather than leaving a lonely last word', () => {
    const r = fitText({
      text: 'Planning that keeps itself up to date',
      boxW: 240,
      boxH: 400,
      style: { ...style, maxLines: 3 },
    })
    if (r.lines.length > 1) {
      const last = r.lines[r.lines.length - 1].split(' ').length
      expect(last).toBeGreaterThan(1)
    }
  })

  it('is deterministic', () => {
    const a = fitText({ text: 'Repeatable output', boxW: 200, boxH: 60, style })
    const b = fitText({ text: 'Repeatable output', boxW: 200, boxH: 60, style })
    expect(a).toEqual(b)
  })
})

describe('measureEm', () => {
  it('is monotonic in string length for the table backend', () => {
    const f = { family: 'system-ui', weight: 'regular' as const, letterSpacing: 0 }
    expect(measureEm('aa', f)).toBeGreaterThan(measureEm('a', f))
    expect(measureEm('aaaa', f)).toBeGreaterThan(measureEm('aa', f))
  })

  it('accounts for letter spacing', () => {
    const tight = { family: 'system-ui', weight: 'regular' as const, letterSpacing: 0 }
    const loose = { family: 'system-ui', weight: 'regular' as const, letterSpacing: 0.1 }
    expect(measureEm('spacing', loose)).toBeGreaterThan(measureEm('spacing', tight))
  })
})
