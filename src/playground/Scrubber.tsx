import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Creative, ResolvedLayout, Surface } from '@engine/types'
import { classify } from '@engine/surfaces'
import { narrate } from '@engine/narrate'
import { AdSurface, type DebugFlags } from '../render/react/AdSurface'
import { createLayoutEngineClient } from './engine/client'
import { SCRUB_MAX, SCRUB_MIN } from './state/urlState'

const PRESETS: [string, number, number][] = [
  ['Banner', 320, 50],
  ['MPU', 300, 250],
  ['Half-page', 300, 600],
  ['Square', 1080, 1080],
  ['Story', 1080, 1920],
  ['Landscape', 1200, 628],
  ['CTV', 1920, 1080],
  ['DOOH wide', 3840, 1080],
]

const band = (s: number) => (s >= 0.82 ? 'good' : s >= 0.62 ? 'ok' : 'bad')
const barColor = (s: number) =>
  s >= 0.8 ? 'var(--good)' : s >= 0.55 ? 'var(--warn)' : 'var(--bad)'

export interface ScrubberProps {
  creative: Creative
  brandColor: string
  debug: DebugFlags
  dims: [number, number]
  preferCanvas: boolean
  onDims: (w: number, h: number) => void
  onToggleDebug: (k: keyof DebugFlags, v: boolean) => void
}

const mkSurface = (w: number, h: number): Surface => ({
  id: 'scrub',
  label: 'Scrubber',
  w,
  h,
  channel: 'display',
  safe: {
    top: Math.round(h * 0.04),
    right: Math.round(w * 0.04),
    bottom: Math.round(h * 0.04),
    left: Math.round(w * 0.04),
  },
  viewingDistance: Math.max(w, h) > 1600 ? 'far' : Math.max(w, h) > 700 ? 'mid' : 'near',
})

export function Scrubber({
  creative,
  brandColor,
  debug,
  dims,
  preferCanvas,
  onDims,
  onToggleDebug,
}: ScrubberProps) {
  const [w, h] = dims
  const [engine] = useState(() => createLayoutEngineClient())
  const surface = useMemo(() => mkSurface(w, h), [w, h])
  const [layout, setLayout] = useState<ResolvedLayout | null>(null)
  const [ms, setMs] = useState(0)
  const [threaded] = useState(() => engine.threaded)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    engine
      .resolve(creative, [surface], { preferCanvas })
      .then((r) => {
        if (!live) return
        setLayout(r.layouts[0])
        setMs(r.roundTripMs)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [engine, creative, surface, preferCanvas])

  // available render area
  const [avail, setAvail] = useState({ w: 800, h: 520 })
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setAvail({ w: el.clientWidth - 48, h: el.clientHeight - 48 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.min(avail.w / w, avail.h / h, 1)
  const renderW = w * scale

  // drag-resize
  const drag = useRef<{
    axis: 'x' | 'y' | 'xy'
    sx: number
    sy: number
    sw: number
    sh: number
  } | null>(null)
  const onPointerDown = (axis: 'x' | 'y' | 'xy') => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { axis, sx: e.clientX, sy: e.clientY, sw: w, sh: h }
  }
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      const clamp = (v: number) => Math.max(SCRUB_MIN, Math.min(SCRUB_MAX, Math.round(v)))
      const nw = d.axis === 'y' ? w : clamp(d.sw + (e.clientX - d.sx) / scale)
      const nh = d.axis === 'x' ? h : clamp(d.sh + (e.clientY - d.sy) / scale)
      if (nw !== w || nh !== h) onDims(nw, nh)
    },
    [w, h, scale, onDims],
  )
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const archetype = classify(surface)
  const lines = layout ? narrate(layout) : []

  return (
    <main className="main scrub">
      <div className="scrub-head">
        <div className="scrub-dims">
          <label>
            W
            <input
              type="range"
              min={SCRUB_MIN}
              max={SCRUB_MAX}
              value={w}
              onChange={(e) => onDims(Number(e.target.value), h)}
            />
            <input
              type="number"
              value={w}
              onChange={(e) => onDims(Number(e.target.value) || w, h)}
            />
          </label>
          <label>
            H
            <input
              type="range"
              min={SCRUB_MIN}
              max={SCRUB_MAX}
              value={h}
              onChange={(e) => onDims(w, Number(e.target.value))}
            />
            <input
              type="number"
              value={h}
              onChange={(e) => onDims(w, Number(e.target.value) || h)}
            />
          </label>
        </div>
        <div className="scrub-presets">
          {PRESETS.map(([name, pw, ph]) => (
            <button
              key={name}
              aria-pressed={w === pw && h === ph}
              onClick={() => onDims(pw, ph)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="scrub-live">
          <span className="tag">{threaded ? 'worker' : 'main'}</span>
          <span className="tag">{archetype}</span>
          {layout && (
            <>
              <span className="tag">
                {layout.trace.winner.strategy}·{layout.trace.winner.variant}
              </span>
              <span className="score-chip" data-band={band(layout.score)}>
                {layout.score.toFixed(2)}
              </span>
              <span className="tag">{ms.toFixed(1)}ms</span>
              {layout.dropped.length > 0 && (
                <span className="tag">−{layout.dropped.length}</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="scrub-stage" ref={stageRef}>
        {layout && (
          <div
            className="scrub-frame"
            style={{ width: renderW, height: h * scale }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <AdSurface layout={layout} brandColor={brandColor} width={renderW} debug={debug} />
            <span
              className="grip grip-x"
              onPointerDown={onPointerDown('x')}
              onPointerUp={onPointerUp}
              title="drag width"
            />
            <span
              className="grip grip-y"
              onPointerDown={onPointerDown('y')}
              onPointerUp={onPointerUp}
              title="drag height"
            />
            <span
              className="grip grip-xy"
              onPointerDown={onPointerDown('xy')}
              onPointerUp={onPointerUp}
              title="drag both"
            />
          </div>
        )}
      </div>

      <div className="scrub-foot">
        <div className="scrub-toggles">
          {(['safeArea', 'boxes', 'focal', 'baseline'] as const).map((k) => (
            <label className="toggle" key={k} data-on={!!debug[k]}>
              <input
                type="checkbox"
                checked={!!debug[k]}
                onChange={(e) => onToggleDebug(k, e.target.checked)}
              />
              {k}
            </label>
          ))}
        </div>
        {layout && (
          <div className="scrub-explain">
            <div className="narr">
              {lines.map((l, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: mdBold(l) }} />
              ))}
            </div>
            <div className="scrub-rubric">
              {layout.ruleScores.map((r) => (
                <div className="minirule" key={r.rule} title={r.detail}>
                  <span>{r.rule}</span>
                  <span className="bar">
                    <i style={{ width: `${r.score * 100}%`, background: barColor(r.score) }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

const mdBold = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
