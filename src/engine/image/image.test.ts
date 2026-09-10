import { describe, expect, it } from 'vitest'
import { fitImage, focalClipped } from './focal'
import { chooseForeground, contrastRatio, luminance, mix, onColor, parseHex } from './color'

describe('fitImage — focal-aware cropping', () => {
  it('keeps the focal point inside the crop for a wide source in a tall box', () => {
    const img = { aspect: 16 / 9, focal: { x: 0.8, y: 0.5 } }
    const r = fitImage(img, { x: 0, y: 0, w: 300, h: 600 }, { mode: 'cover' })
    expect(focalClipped(img, r)).toBe(false)
    expect(r.crop.w).toBeLessThan(1) // horizontally cropped
  })

  it('keeps the focal point inside the crop for a tall source in a wide box', () => {
    const img = { aspect: 3 / 4, focal: { x: 0.5, y: 0.2 } }
    const r = fitImage(img, { x: 0, y: 0, w: 728, h: 90 }, { mode: 'cover' })
    expect(focalClipped(img, r)).toBe(false)
    expect(r.crop.h).toBeLessThan(1)
  })

  it('reports crop loss and emits a usable object-position', () => {
    const r = fitImage({ aspect: 2, focal: { x: 0.5, y: 0.5 } }, { x: 0, y: 0, w: 100, h: 400 })
    expect(r.cropLoss).toBeGreaterThan(0)
    expect(r.objectPosition).toMatch(/^\d+(\.\d+)?% \d+(\.\d+)?%$/)
  })

  it('does not crop protected assets', () => {
    const r = fitImage({ aspect: 1, protect: true }, { x: 0, y: 0, w: 300, h: 250 })
    expect(r.objectFit).toBe('contain')
    expect(r.cropLoss).toBe(0)
  })
})

describe('color', () => {
  it('luminance ranks black < grey < white', () => {
    expect(luminance(parseHex('#000'))).toBeLessThan(luminance(parseHex('#888')))
    expect(luminance(parseHex('#888'))).toBeLessThan(luminance(parseHex('#fff')))
  })

  it('chooses white text on a dark ground and dark text on a light ground', () => {
    expect(chooseForeground(0.05).fg).toBe('#ffffff')
    expect(chooseForeground(0.95).fg).toBe('#0b0b0c')
  })

  it('does not scrim a solid mid-tone that already has strong contrast', () => {
    const c = chooseForeground(0.5, 4.5)
    expect(c.scrim).toBeUndefined()
    expect(c.contrast).toBeGreaterThanOrEqual(4.5)
  })

  it('scrims white text on a dark image that could have bright patches', () => {
    const solid = chooseForeground(0.1, 4.5, false)
    const image = chooseForeground(0.1, 4.5, true)
    expect(solid.fg).toBe('#ffffff')
    expect(solid.scrim).toBeUndefined() // solid dark ground is fine bare
    expect(image.scrim).toBeDefined() // same mean, but volatile → protect it
    expect(image.contrast).toBeGreaterThanOrEqual(4.4)
  })

  it('onColor returns a legible label color for a brand fill', () => {
    const fg = onColor('#f72585')
    expect(
      contrastRatio(luminance(parseHex(fg)), luminance(parseHex('#f72585'))),
    ).toBeGreaterThan(2.5)
  })

  it('mix interpolates between two colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
