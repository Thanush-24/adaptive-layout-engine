import { defineConfig, devices } from '@playwright/test'

/**
 * Visual-regression suite for the playground. Opt-in — `npm run test:visual` —
 * not part of `npm test`, since it needs a browser download.
 *
 * Baselines are platform-specific (Playwright suffixes them with the OS). The
 * committed baselines are darwin; a first CI run on Linux should be
 * `npm run test:visual -- --update-snapshots` to establish its own, then those
 * get committed. Standard Playwright practice.
 */
export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
