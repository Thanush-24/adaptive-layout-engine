import { expect, test } from '@playwright/test'

/**
 * Each state below loads via a pre-baked URL hash so the run is deterministic:
 * fixed creative, fixed selection, no animation. The engine is deterministic, so
 * a diff here means the render or layout genuinely changed.
 */

// creative=d2c-skincare, canvas metrics off (so it matches the table-metric
// engine the tests pin), wall view, story selected.
const WALL_HASH =
  '#' +
  btoa(
    encodeURIComponent(
      JSON.stringify({
        c: 'd2c-skincare',
        o: {},
        r: {},
        s: 'story',
        d: '0000',
        m: 0,
        v: 0,
        z: [1080, 1350],
      }),
    ),
  )

const SCRUB = (w: number, h: number) =>
  '#' +
  btoa(
    encodeURIComponent(
      JSON.stringify({
        c: 'd2c-skincare',
        o: {},
        r: {},
        s: 'scrub',
        d: '0000',
        m: 0,
        v: 1,
        z: [w, h],
      }),
    ),
  )

test.beforeEach(async ({ page }) => {
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' })
})

test('surface wall', async ({ page }) => {
  await page.goto(`/${WALL_HASH}`)
  await expect(page.locator('.card .score-chip')).toHaveCount(17)
  await page.waitForTimeout(400)
  await expect(page).toHaveScreenshot('wall.png', { fullPage: true })
})

test('inspector — story rubric + trace', async ({ page }) => {
  await page.goto(`/${WALL_HASH}`)
  await page.locator('.card', { hasText: 'Story / Reel' }).locator('.card-head').click()
  await page.waitForTimeout(300)
  await expect(page.locator('.rail.right')).toHaveScreenshot('inspector.png')
})

for (const [label, w, h] of [
  ['banner', 320, 100],
  ['mpu', 300, 250],
  ['portrait', 300, 600],
  ['square', 1080, 1080],
  ['landscape', 1200, 628],
  ['ctv', 1920, 1080],
] as const) {
  test(`scrubber — ${label} ${w}×${h}`, async ({ page }) => {
    await page.goto(`/${SCRUB(w, h)}`)
    await expect(page.locator('.scrub-frame')).toBeVisible()
    await page.waitForTimeout(400)
    await expect(page.locator('.scrub-stage')).toHaveScreenshot(`scrub-${label}.png`)
  })
}
