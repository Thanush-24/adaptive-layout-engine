/**
 * React renderer for a `ResolvedLayout`. Draws each placement at true device
 * pixels inside a scaled frame, with an optional debug overlay layer (safe area,
 * region boxes, focal points, baseline grid). Reads only `ResolvedLayout` — no
 * engine internals.
 */
import type { CSSProperties } from 'react'
import type { Placement, ResolvedLayout } from '@engine/types'

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
const WEIGHT: Record<string, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
}

const isGradient = (s: string) =>
  s.startsWith('linear-gradient') || s.startsWith('radial-gradient')
const isImg = (s: string) => s.startsWith('data:') || /^https?:\/\//.test(s)

export interface DebugFlags {
  safeArea?: boolean
  boxes?: boolean
  focal?: boolean
  baseline?: boolean
}

export interface AdSurfaceProps {
  layout: ResolvedLayout
  brandColor: string
  /** Rendered CSS width in px; height derives from the surface aspect. */
  width: number
  debug?: DebugFlags
}

export function AdSurface({ layout, brandColor, width, debug }: AdSurfaceProps) {
  const { surface } = layout
  const scale = width / surface.w
  const frameStyle: CSSProperties = {
    position: 'relative',
    width: surface.w,
    height: surface.h,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    overflow: 'hidden',
    background: '#fff',
    fontFamily: FONT,
  }

  return (
    <div style={{ width: surface.w * scale, height: surface.h * scale, position: 'relative' }}>
      <div style={frameStyle} data-adframe>
        {layout.placements
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((p) => (
            <PlacementEl key={p.id} p={p} brandColor={brandColor} />
          ))}
        {debug?.baseline && <BaselineGrid w={surface.w} h={surface.h} />}
        {debug?.safeArea && (
          <div
            style={{
              position: 'absolute',
              left: surface.safe.left,
              top: surface.safe.top,
              width: surface.w - surface.safe.left - surface.safe.right,
              height: surface.h - surface.safe.top - surface.safe.bottom,
              border: '1.5px dashed rgba(56,189,248,0.9)',
              pointerEvents: 'none',
            }}
          />
        )}
        {debug?.boxes &&
          layout.placements
            .filter((p) => p.role !== 'background')
            .map((p) => (
              <div
                key={`box-${p.id}`}
                style={{
                  position: 'absolute',
                  left: p.rect.x,
                  top: p.rect.y,
                  width: p.rect.w,
                  height: p.rect.h,
                  outline: '1px solid rgba(244,63,94,0.9)',
                  background: 'rgba(244,63,94,0.06)',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -14,
                    left: 0,
                    font: `600 10px ${FONT}`,
                    color: '#f43f5e',
                    background: '#fff',
                    padding: '0 3px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.role}
                </span>
              </div>
            ))}
        {debug?.focal &&
          layout.placements
            .filter((p) => p.image)
            .map((p) => {
              const cx = p.rect.x + p.rect.w / 2
              const cy = p.rect.y + p.rect.h / 2
              return (
                <div
                  key={`focal-${p.id}`}
                  style={{
                    position: 'absolute',
                    left: cx - 7,
                    top: cy - 7,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px solid #facc15',
                    boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
                    pointerEvents: 'none',
                  }}
                />
              )
            })}
      </div>
    </div>
  )
}

function PlacementEl({ p, brandColor }: { p: Placement; brandColor: string }) {
  const base: CSSProperties = {
    position: 'absolute',
    left: p.rect.x,
    top: p.rect.y,
    width: p.rect.w,
    height: p.rect.h,
    zIndex: p.z,
  }

  if (p.role === 'background') {
    if (p.kind === 'image' && p.image && isImg(p.content)) {
      return (
        <img
          alt=""
          src={p.content}
          style={{
            ...base,
            zIndex: 0,
            objectFit: p.image.objectFit,
            objectPosition: p.image.objectPosition,
          }}
        />
      )
    }
    return (
      <div
        style={{
          ...base,
          zIndex: 0,
          background: isGradient(p.content) ? p.content : p.content || '#e5e7eb',
        }}
      />
    )
  }

  if (p.kind === 'image' && p.image) {
    return (
      <img
        alt=""
        src={p.content}
        style={{
          ...base,
          objectFit: p.image.objectFit,
          objectPosition: p.image.objectPosition,
        }}
      />
    )
  }

  const t = p.text
  if (!t) return null
  const c = p.colors

  if (p.role === 'cta') {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: brandColor,
          borderRadius: 8,
        }}
      >
        <span
          style={{
            color: c?.fg ?? '#fff',
            fontFamily: FONT,
            fontWeight: WEIGHT[t.weight],
            fontSize: t.fontPx,
            lineHeight: t.lineHeight,
            letterSpacing: `${t.letterSpacing}em`,
            textTransform: t.transform,
            whiteSpace: 'nowrap',
          }}
        >
          {t.lines.join(' ')}
        </span>
      </div>
    )
  }

  return (
    <div style={base}>
      {c?.scrim && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: c.scrim.color,
            opacity: c.scrim.opacity,
          }}
        />
      )}
      <div
        style={{
          position: 'relative',
          color: c?.fg ?? '#111',
          fontFamily: FONT,
          fontWeight: WEIGHT[t.weight],
          fontSize: t.fontPx,
          lineHeight: t.lineHeight,
          letterSpacing: `${t.letterSpacing}em`,
          textTransform: t.transform,
        }}
      >
        {t.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  )
}

function BaselineGrid({ w, h }: { w: number; h: number }) {
  const step = 8
  const lines = []
  for (let y = step; y < h; y += step) {
    lines.push(
      <line
        key={y}
        x1={0}
        y1={y}
        x2={w}
        y2={y}
        stroke="rgba(99,102,241,0.12)"
        strokeWidth={1}
      />,
    )
  }
  return (
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {lines}
    </svg>
  )
}
