/**
 * ale — Adaptive Layout Engine CLI.
 *
 *   ale render <creative.json> [--surfaces all|id,id,…] [--format html,svg,json]
 *                              [--out <dir>] [--explain]
 *   ale validate <creative.json>
 *   ale surfaces
 *   ale schema
 *
 * Resolves one authored creative onto every surface and writes a file per
 * surface × format. Uses the framework-agnostic engine — no browser.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve as resolvePath } from 'node:path'
import { resolveLayout } from '../src/engine/resolve.ts'
import { SURFACES, SURFACE_BY_ID } from '../src/engine/surfaces.ts'
import { parseCreative, CREATIVE_SCHEMA } from '../src/engine/dsl.ts'
import { narrate } from '../src/engine/narrate.ts'
import { renderToHtml } from '../src/render/html.ts'
import { renderToSvg } from '../src/render/svg.ts'
import type { Creative } from '../src/engine/types.ts'

const args = process.argv.slice(2)
const cmd = args[0]

const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name: string) => args.includes(`--${name}`)

function die(msg: string): never {
  process.stderr.write(`ale: ${msg}\n`)
  process.exit(1)
}

function loadCreative(path: string): Creative {
  let json: unknown
  try {
    json = JSON.parse(readFileSync(resolvePath(path), 'utf8'))
  } catch (e) {
    die(`cannot read ${path}: ${(e as Error).message}`)
  }
  const parsed = parseCreative(json)
  for (const w of parsed.warnings) process.stderr.write(`  warn  ${w.path}: ${w.message}\n`)
  if (!parsed.ok) {
    for (const err of parsed.errors)
      process.stderr.write(`  error ${err.path}: ${err.message}\n`)
    die(`${parsed.errors.length} error(s) in ${path}`)
  }
  return parsed.creative
}

function cmdValidate() {
  const path = args[1] ?? die('usage: ale validate <creative.json>')
  const parsed = parseCreative(JSON.parse(readFileSync(resolvePath(path), 'utf8')))
  for (const w of parsed.warnings) process.stdout.write(`warn  ${w.path}: ${w.message}\n`)
  if (parsed.ok) {
    process.stdout.write(`ok    ${parsed.creative.elements.length} elements, valid\n`)
  } else {
    for (const e of parsed.errors) process.stdout.write(`error ${e.path}: ${e.message}\n`)
    process.exit(1)
  }
}

function cmdSurfaces() {
  const w = Math.max(...SURFACES.map((s) => s.id.length))
  for (const s of SURFACES) {
    process.stdout.write(
      `${s.id.padEnd(w)}  ${String(s.w).padStart(4)}×${String(s.h).toString().padEnd(5)} ${s.channel.padEnd(7)} ${s.viewingDistance}\n`,
    )
  }
}

function cmdSchema() {
  process.stdout.write(JSON.stringify(CREATIVE_SCHEMA, null, 2) + '\n')
}

function cmdRender() {
  const path =
    args[1] ?? die('usage: ale render <creative.json> [--surfaces …] [--format …] [--out …]')
  const creative = loadCreative(path)

  const surfaceSel = flag('surfaces') ?? 'all'
  const surfaces =
    surfaceSel === 'all'
      ? SURFACES
      : surfaceSel
          .split(',')
          .map((id) => SURFACE_BY_ID[id.trim()] ?? die(`unknown surface "${id}"`))

  const formats = (flag('format') ?? 'html,svg').split(',').map((f) => f.trim())
  const outDir = resolvePath(flag('out') ?? join('ads', basename(path).replace(/\.json$/, '')))
  mkdirSync(outDir, { recursive: true })

  let worstScore = 1
  let warnCount = 0
  const rows: string[] = []

  for (const surface of surfaces) {
    const layout = resolveLayout(creative, surface)
    worstScore = Math.min(worstScore, layout.score)
    warnCount += layout.warnings.filter((w) => w.severity !== 'info').length

    for (const fmt of formats) {
      const file = join(outDir, `${surface.id}.${fmt}`)
      if (fmt === 'html') {
        writeFileSync(
          file,
          renderToHtml(layout, { brandColor: creative.brandColor, document: true }),
        )
      } else if (fmt === 'svg') {
        writeFileSync(
          file,
          renderToSvg(layout, { brandColor: creative.brandColor, standalone: true }),
        )
      } else if (fmt === 'json') {
        writeFileSync(file, JSON.stringify(layout, null, 2))
      } else {
        die(`unknown format "${fmt}" (want html, svg or json)`)
      }
    }

    const w = layout.warnings.filter((x) => x.severity !== 'info').length
    rows.push(
      `  ${surface.id.padEnd(16)} ${layout.score.toFixed(2)}  ${layout.trace.winner.strategy}/${layout.trace.winner.variant}` +
        (layout.dropped.length ? `  −${layout.dropped.length}` : '') +
        (w ? `  ⚠${w}` : ''),
    )

    if (has('explain')) {
      rows.push(...narrate(layout).map((l) => `      ${l.replace(/\*\*/g, '')}`))
      rows.push('')
    }
  }

  process.stdout.write(rows.join('\n') + '\n\n')
  process.stdout.write(
    `${surfaces.length} surface(s) × ${formats.join('+')} → ${outDir}\n` +
      `lowest score ${worstScore.toFixed(2)}, ${warnCount} warning(s)\n`,
  )
  if (worstScore < 0.55) process.exit(2)
}

switch (cmd) {
  case 'render':
    cmdRender()
    break
  case 'validate':
    cmdValidate()
    break
  case 'surfaces':
    cmdSurfaces()
    break
  case 'schema':
    cmdSchema()
    break
  default:
    process.stdout.write(
      'ale — Adaptive Layout Engine CLI\n\n' +
        '  ale render <creative.json> [--surfaces all|id,…] [--format html,svg,json] [--out dir] [--explain]\n' +
        '  ale validate <creative.json>\n' +
        '  ale surfaces\n' +
        '  ale schema\n',
    )
    process.exit(cmd ? 1 : 0)
}
