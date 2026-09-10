/**
 * CLI integration test. Builds `dist/ale.mjs` once, then drives it end to end.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(root, 'dist', 'ale.mjs')
const run = (...args: string[]) =>
  execFileSync('node', [CLI, ...args], { cwd: root, encoding: 'utf8' })

describe('ale CLI', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build:cli', '--silent'], { cwd: root, stdio: 'ignore' })
    expect(existsSync(CLI)).toBe(true)
  }, 60_000)

  it('lists surfaces and prints the schema', () => {
    expect(run('surfaces')).toMatch(/leaderboard\s+728×90/)
    expect(JSON.parse(run('schema'))).toHaveProperty('brandColor')
  })

  it('validates the bundled example', () => {
    expect(run('validate', 'examples/skincare.json')).toMatch(/valid/)
  })

  it('renders every format for a selection of surfaces', () => {
    const out = mkdtempSync(join(tmpdir(), 'ale-'))
    const log = run(
      'render',
      'examples/skincare.json',
      '--surfaces',
      'mpu,story,ctv-1080',
      '--format',
      'html,svg,json',
      '--out',
      out,
      '--explain',
    )
    expect(log).toMatch(/3 surface\(s\)/)

    const files = readdirSync(out).sort()
    expect(files).toEqual([
      'ctv-1080.html',
      'ctv-1080.json',
      'ctv-1080.svg',
      'mpu.html',
      'mpu.json',
      'mpu.svg',
      'story.html',
      'story.json',
      'story.svg',
    ])

    const svg = readFileSync(join(out, 'mpu.svg'), 'utf8')
    expect(svg.startsWith('<?xml')).toBe(true)
    expect(svg).toContain('width="300" height="250"')
    expect(svg).toContain('Shop now')

    const layout = JSON.parse(readFileSync(join(out, 'story.json'), 'utf8'))
    expect(layout.surface.id).toBe('story')
    expect(layout.placements.length).toBeGreaterThan(0)
  })

  it('exits non-zero on an invalid creative', () => {
    const bad = mkdtempSync(join(tmpdir(), 'ale-'))
    const file = join(bad, 'bad.json')
    execFileSync('node', [
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(file)}, '{"id":"x"}')`,
    ])
    expect(() => run('validate', file)).toThrow()
  })
})
