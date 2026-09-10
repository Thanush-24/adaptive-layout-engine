/**
 * Creative authoring format + validator.
 *
 * A creative is plain JSON. `parseCreative` accepts loosely-typed input (a file,
 * an API body, the playground editor), fills in role-derived defaults, and
 * returns either a fully-typed `Creative` or a list of path-anchored errors —
 * no throwing, so callers can show every problem at once.
 */
import type { AdElement, Creative, ElementKind, ElementRole, Tone } from './types'

export interface DslIssue {
  path: string
  message: string
}

export type ParseResult =
  | { ok: true; creative: Creative; warnings: DslIssue[] }
  | { ok: false; errors: DslIssue[]; warnings: DslIssue[] }

const ROLES: ElementRole[] = [
  'background',
  'logo',
  'headline',
  'subhead',
  'cta',
  'product',
  'badge',
  'legal',
]
const KINDS: ElementKind[] = ['text', 'image', 'shape']
const TONES: Tone[] = ['light', 'dark', 'auto']
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseCreative(input: unknown): ParseResult {
  const errors: DslIssue[] = []
  const warnings: DslIssue[] = []
  const err = (path: string, message: string) => errors.push({ path, message })
  const warn = (path: string, message: string) => warnings.push({ path, message })

  if (!isObj(input)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'creative must be a JSON object' }],
      warnings,
    }
  }

  if (typeof input.id !== 'string' || !input.id.trim())
    err('id', 'required, must be a non-empty string')
  if (input.name != null && typeof input.name !== 'string') err('name', 'must be a string')
  if (typeof input.brandColor !== 'string' || !HEX.test(input.brandColor)) {
    err('brandColor', 'required, must be a hex colour like "#f72585"')
  }
  if (!Array.isArray(input.elements) || input.elements.length === 0) {
    err('elements', 'required, must be a non-empty array')
    return { ok: false, errors, warnings }
  }

  const seenIds = new Set<string>()
  const roleCount = new Map<ElementRole, number>()
  const elements: AdElement[] = []

  input.elements.forEach((raw, i) => {
    const at = `elements[${i}]`
    if (!isObj(raw)) {
      err(at, 'must be an object')
      return
    }
    const id = typeof raw.id === 'string' ? raw.id : `el-${i}`
    if (typeof raw.id !== 'string') warn(`${at}.id`, `missing — using "${id}"`)
    if (seenIds.has(id)) err(`${at}.id`, `duplicate id "${id}"`)
    seenIds.add(id)

    const role = raw.role as ElementRole
    if (!ROLES.includes(role)) {
      err(`${at}.role`, `must be one of: ${ROLES.join(', ')}`)
      return
    }
    roleCount.set(role, (roleCount.get(role) ?? 0) + 1)

    const kind = (raw.kind ??
      (role === 'background' || role === 'product' ? 'image' : 'text')) as ElementKind
    if (!KINDS.includes(kind)) err(`${at}.kind`, `must be one of: ${KINDS.join(', ')}`)

    if (typeof raw.content !== 'string' || !raw.content) {
      err(
        `${at}.content`,
        kind === 'text' ? 'required text string' : 'required asset URL / gradient token',
      )
    }

    let priority = 50
    if (raw.priority != null) {
      if (typeof raw.priority !== 'number' || raw.priority < 0 || raw.priority > 100) {
        err(`${at}.priority`, 'must be a number in [0, 100]')
      } else priority = raw.priority
    }

    if (raw.required != null && typeof raw.required !== 'boolean')
      err(`${at}.required`, 'must be a boolean')
    if (raw.tone != null && !TONES.includes(raw.tone as Tone))
      err(`${at}.tone`, `must be one of: ${TONES.join(', ')}`)

    let image: AdElement['image']
    if (kind === 'image' || raw.image != null) {
      if (!isObj(raw.image)) {
        if (kind === 'image')
          err(`${at}.image`, 'image elements need { aspect, focal?, luminance? }')
      } else {
        const aspect = raw.image.aspect
        if (typeof aspect !== 'number' || aspect <= 0)
          err(`${at}.image.aspect`, 'required positive number (width / height)')
        const focal = raw.image.focal
        if (focal != null) {
          if (!isObj(focal) || !inRange(focal.x) || !inRange(focal.y)) {
            err(`${at}.image.focal`, 'must be { x, y } with each in [0, 1]')
          }
        }
        if (raw.image.luminance != null && !inRange(raw.image.luminance)) {
          err(`${at}.image.luminance`, 'must be in [0, 1]')
        }
        image = {
          aspect: typeof aspect === 'number' && aspect > 0 ? aspect : 1,
          focal:
            isObj(focal) && inRange(focal.x) && inRange(focal.y)
              ? { x: focal.x as number, y: focal.y as number }
              : undefined,
          luminance: inRange(raw.image.luminance) ? (raw.image.luminance as number) : undefined,
          protect: raw.image.protect === true || undefined,
        }
      }
    }

    let text: AdElement['text']
    if (isObj(raw.text)) {
      const t = raw.text
      for (const k of ['minPx', 'maxPx', 'maxLines'] as const) {
        if (t[k] != null && (typeof t[k] !== 'number' || (t[k] as number) < 0)) {
          err(`${at}.text.${k}`, 'must be a non-negative number')
        }
      }
      if (t.minPx != null && t.maxPx != null && (t.minPx as number) > (t.maxPx as number)) {
        err(`${at}.text`, `minPx (${t.minPx}) is greater than maxPx (${t.maxPx})`)
      }
      text = t as AdElement['text']
    }

    elements.push({
      id,
      role,
      kind,
      content: typeof raw.content === 'string' ? raw.content : '',
      priority,
      required: raw.required === true || undefined,
      tone: TONES.includes(raw.tone as Tone) ? (raw.tone as Tone) : undefined,
      image,
      text,
      color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color : undefined,
    })
  })

  // structural sanity
  if (!roleCount.get('headline')) warn('elements', 'no headline — most surfaces will look thin')
  if (!roleCount.get('cta')) warn('elements', 'no CTA — the ad has no call to action')
  for (const [role, n] of roleCount) {
    if (n > 1 && role !== 'badge')
      warn('elements', `${n} "${role}" elements — the engine places at most one per surface`)
  }
  const noRequired = !elements.some((e) => e.required)
  if (noRequired)
    warn(
      'elements',
      'nothing is marked "required" — degradation may drop anything on tight surfaces',
    )

  if (errors.length) return { ok: false, errors, warnings }

  return {
    ok: true,
    warnings,
    creative: {
      id: input.id as string,
      name: (input.name as string) ?? (input.id as string),
      vertical: typeof input.vertical === 'string' ? input.vertical : undefined,
      brandColor: input.brandColor as string,
      elements,
    },
  }
}

const inRange = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1

/** A minimal JSON-schema-ish description, for docs / editor hints. */
export const CREATIVE_SCHEMA = {
  id: 'string (required)',
  name: 'string',
  vertical: 'string',
  brandColor: 'hex colour (required)',
  elements: [
    {
      id: 'string',
      role: ROLES,
      kind: KINDS,
      content: 'text | asset URL | gradient token (required)',
      priority: '0..100',
      required: 'boolean',
      tone: TONES,
      image: {
        aspect: 'number > 0',
        focal: '{ x: 0..1, y: 0..1 }',
        luminance: '0..1',
        protect: 'boolean',
      },
      text: {
        family: 'string',
        weight: 'regular|medium|semibold|bold|black',
        minPx: 'number',
        maxPx: 'number',
        maxLines: 'number',
      },
    },
  ],
} as const
