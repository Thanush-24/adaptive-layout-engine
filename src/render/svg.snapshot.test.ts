// @vitest-environment jsdom
/**
 * SVG render snapshots. The layout fingerprint (engine/snapshot.test.ts) pins
 * geometry; this pins the *rendering* layer — colours, scrims, gradient/crop
 * math, escaping — for a representative slice of the matrix. A visual change
 * shows up here as a reviewable diff without a headless browser.
 */
import { describe, expect, it } from 'vitest'
import { renderToSvg } from './svg'
import { resolveLayout } from '@engine/resolve'
import { SURFACE_BY_ID } from '@engine/surfaces'
import { CREATIVES } from '@data/creatives'

const SURFACES = [
  'mobile-banner',
  'mpu',
  'half-page',
  'feed-square',
  'story',
  'ctv-1080',
  'dooh-ultrawide',
]

describe('SVG render snapshots', () => {
  for (const c of CREATIVES) {
    it(`${c.id}`, () => {
      const out = SURFACES.map((id) => {
        const s = SURFACE_BY_ID[id]
        const svg = renderToSvg(resolveLayout(c, s), { brandColor: c.brandColor })
        // Redact embedded asset payloads — their geometry (x/y/width/height) is
        // what matters here and stays; the base64/SVG blob would just bloat the
        // snapshot.
        return `### ${id} ${s.w}×${s.h}\n${svg.replace(/href="data:[^"]*"/g, 'href="data:…"')}`
      }).join('\n\n')
      expect(out).toMatchSnapshot()
    })
  }
})
