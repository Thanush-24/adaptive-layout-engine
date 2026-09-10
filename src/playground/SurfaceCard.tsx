import { useMemo, useRef, useState } from 'react'
import type { Creative, ResolvedLayout, Surface } from '@engine/types'
import { AdSurface, type DebugFlags } from '../render/react/AdSurface'
import { exportNodeToPng } from './export/png'
import { toStandaloneHtml, download } from './export/snippet'

const band = (s: number) => (s >= 0.82 ? 'good' : s >= 0.62 ? 'ok' : 'bad')

export interface SurfaceCardProps {
  surface: Surface
  layout: ResolvedLayout
  creative: Creative
  selected: boolean
  debug: DebugFlags
  onSelect: () => void
  onResize: (w: number, h: number) => void
  onReset: () => void
  resized: boolean
}

export function SurfaceCard({
  surface,
  layout,
  creative,
  selected,
  debug,
  onSelect,
  onResize,
  onReset,
  resized,
}: SurfaceCardProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(String(surface.w))
  const [h, setH] = useState(String(surface.h))

  const renderW = useMemo(() => {
    const maxW = 212
    const maxH = 260
    const s = Math.min(maxW / surface.w, maxH / surface.h, 1)
    return Math.max(120, surface.w * s)
  }, [surface.w, surface.h])

  const errs = layout.warnings.filter((x) => x.severity === 'error').length
  const warns = layout.warnings.filter((x) => x.severity === 'warn').length

  return (
    <div className={`card${selected ? ' selected' : ''}`}>
      <button className="card-head" onClick={onSelect} aria-pressed={selected}>
        <span className="label">{surface.label}</span>
        <span className="dims">
          {surface.w}×{surface.h}
        </span>
        <span className="spacer" />
        <span className="score-chip" data-band={band(layout.score)}>
          {layout.score.toFixed(2)}
        </span>
      </button>

      <div className="card-stage" ref={stageRef}>
        <AdSurface
          layout={layout}
          brandColor={creative.brandColor}
          width={renderW}
          debug={debug}
        />
      </div>

      <div className="card-foot">
        <span className="tag">{layout.trace.archetype}</span>
        <span className="tag">
          {layout.trace.winner.strategy}·{layout.trace.winner.variant}
        </span>
        {layout.dropped.length > 0 && (
          <span className="tag">−{layout.dropped.length} dropped</span>
        )}
        {warns > 0 && <span className="warn">⚠ {warns}</span>}
        {errs > 0 && <span className="bad">✕ {errs}</span>}
        <span className="tag">{layout.trace.elapsedMs.toFixed(2)}ms</span>
      </div>

      <div className="resize-row">
        <input value={w} onChange={(e) => setW(e.target.value)} aria-label="width" />
        <span style={{ color: 'var(--text-dim)' }}>×</span>
        <input value={h} onChange={(e) => setH(e.target.value)} aria-label="height" />
        <button
          onClick={() => {
            const nw = Math.max(80, Math.min(4096, Number(w) || surface.w))
            const nh = Math.max(40, Math.min(4096, Number(h) || surface.h))
            onResize(nw, nh)
          }}
        >
          apply
        </button>
        {resized && (
          <button
            onClick={() => {
              onReset()
              setW(String(surface.w))
              setH(String(surface.h))
            }}
          >
            reset
          </button>
        )}
      </div>

      <div className="resize-row" style={{ borderTop: 'none', paddingTop: 0 }}>
        <button
          onClick={async () => {
            const frame = stageRef.current?.querySelector(
              '[data-adframe]',
            ) as HTMLElement | null
            if (frame)
              await exportNodeToPng(
                frame,
                { w: surface.w, h: surface.h },
                `${creative.id}-${surface.id}.png`,
              )
          }}
        >
          PNG
        </button>
        <button
          onClick={() =>
            download(`${creative.id}-${surface.id}.html`, toStandaloneHtml(layout, creative))
          }
        >
          HTML
        </button>
      </div>
    </div>
  )
}
