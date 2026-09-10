import { useEffect, useMemo, useState } from 'react'
import { resolveLayout } from '@engine/resolve'
import { SURFACES } from '@engine/surfaces'
import type { Surface } from '@engine/types'
import { CREATIVES, CREATIVE_BY_ID } from '@data/creatives'
import {
  DEFAULT_STATE,
  applyOverrides,
  decodeState,
  encodeState,
  type PlaygroundState,
} from './state/urlState'
import { SurfaceCard } from './SurfaceCard'
import { Inspector } from './Inspector'
import { CreativeEditor } from './CreativeEditor'

const DEBUG_KEYS = ['safeArea', 'boxes', 'focal', 'baseline'] as const

export default function App() {
  const [state, setState] = useState<PlaygroundState>(() =>
    window.location.hash.length > 1 ? decodeState(window.location.hash) : DEFAULT_STATE,
  )
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const next = `#${encodeState(state)}`
    window.history.replaceState(null, '', next)
  }, [state])

  const baseCreative = CREATIVE_BY_ID[state.creativeId] ?? CREATIVES[0]
  const creative = useMemo(
    () => applyOverrides(baseCreative, state.overrides),
    [baseCreative, state.overrides],
  )

  const surfaces: Surface[] = useMemo(
    () =>
      SURFACES.map((s) => {
        const r = state.resized[s.id]
        return r ? { ...s, w: r[0], h: r[1] } : s
      }),
    [state.resized],
  )

  const layouts = useMemo(
    () =>
      surfaces.map((s) => ({
        surface: s,
        layout: resolveLayout(creative, s, { preferCanvas: state.preferCanvas }),
      })),
    [surfaces, creative, state.preferCanvas],
  )

  const selected = layouts.find((l) => l.surface.id === state.selectedSurface) ?? layouts[0]

  const times = layouts.map((l) => l.layout.trace.elapsedMs).sort((a, b) => a - b)
  const p50 = times[Math.floor(times.length / 2)] ?? 0
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0
  const avgScore = layouts.reduce((s, l) => s + l.layout.score, 0) / (layouts.length || 1)

  const patch = (p: Partial<PlaygroundState>) => setState((s) => ({ ...s, ...p })) //
  const setOverride = (id: string, value: string | null) =>
    setState((s) => {
      const o = { ...s.overrides }
      if (value == null || value === '') delete o[id]
      else o[id] = value
      return { ...s, overrides: o }
    })

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setToast('Shareable link copied')
    setTimeout(() => setToast(null), 1800)
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          <span className="mark">A</span>
          Adaptive Layout Engine
        </h1>
        <span className="perf">
          <span>
            p50 <b>{p50.toFixed(2)}ms</b>
          </span>
          <span>
            p95 <b>{p95.toFixed(2)}ms</b>
          </span>
          <span>
            avg score <b>{avgScore.toFixed(2)}</b>
          </span>
          <span>
            <b>{layouts.length}</b> surfaces
          </span>
        </span>
        <span className="spacer" />
        <button onClick={share}>Copy share link</button>
        <a
          href="https://github.com/Thanush-24/adaptive-layout-engine"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>

      <aside className="rail left">
        <div className="section">
          <h2>Creative</h2>
          <div className="creative-list">
            {CREATIVES.map((c) => (
              <button
                key={c.id}
                aria-pressed={c.id === state.creativeId}
                onClick={() => patch({ creativeId: c.id, overrides: {} })}
              >
                {c.name}
                <span className="v">{c.vertical}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <h2>Elements</h2>
          <CreativeEditor
            creative={baseCreative}
            overrides={state.overrides}
            onOverride={setOverride}
          />
        </div>
      </aside>

      <main className="main">
        <div className="wall-head">
          <h2>{baseCreative.name}</h2>
          <span className="sub">one creative · {layouts.length} surfaces · resolved live</span>
          <span className="spacer" style={{ flex: 1 }} />
          <div className="toggle-grid" style={{ gridTemplateColumns: 'repeat(5, auto)' }}>
            {DEBUG_KEYS.map((k) => (
              <label className="toggle" key={k} data-on={state.debug[k]}>
                <input
                  type="checkbox"
                  checked={state.debug[k]}
                  onChange={(e) => patch({ debug: { ...state.debug, [k]: e.target.checked } })}
                />
                {k}
              </label>
            ))}
            <label className="toggle" data-on={state.preferCanvas}>
              <input
                type="checkbox"
                checked={state.preferCanvas}
                onChange={(e) => patch({ preferCanvas: e.target.checked })}
              />
              canvas metrics
            </label>
          </div>
        </div>

        <div className="wall">
          {layouts.map(({ surface, layout }) => (
            <SurfaceCard
              key={surface.id}
              surface={surface}
              layout={layout}
              creative={creative}
              selected={surface.id === selected.surface.id}
              debug={state.debug}
              resized={!!state.resized[surface.id]}
              onSelect={() => patch({ selectedSurface: surface.id })}
              onResize={(w, h) =>
                patch({ resized: { ...state.resized, [surface.id]: [w, h] } })
              }
              onReset={() => {
                const r = { ...state.resized }
                delete r[surface.id]
                patch({ resized: r })
              }}
            />
          ))}
        </div>
      </main>

      <aside className="rail right">{selected && <Inspector layout={selected.layout} />}</aside>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
