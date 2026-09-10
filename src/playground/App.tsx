import { useEffect, useMemo, useState } from 'react'
import { SURFACES } from '@engine/surfaces'
import type { ResolvedLayout, Surface } from '@engine/types'
import { CREATIVES, CREATIVE_BY_ID } from '@data/creatives'
import {
  DEFAULT_STATE,
  applyOverrides,
  decodeState,
  encodeState,
  type PlaygroundState,
} from './state/urlState'
import { createLayoutEngineClient } from './engine/client'
import { SurfaceCard } from './SurfaceCard'
import { Inspector } from './Inspector'
import { CreativeEditor } from './CreativeEditor'
import { Scrubber } from './Scrubber'

const DEBUG_KEYS = ['safeArea', 'boxes', 'focal', 'baseline'] as const

export default function App() {
  const [state, setState] = useState<PlaygroundState>(() =>
    window.location.hash.length > 1 ? decodeState(window.location.hash) : DEFAULT_STATE,
  )
  const [toast, setToast] = useState<string | null>(null)

  // One worker for the app's lifetime. Not disposed on unmount — React StrictMode
  // would terminate it on the throwaway first mount; the browser reclaims it on
  // navigation anyway.
  const [engine] = useState(() => createLayoutEngineClient())

  useEffect(() => {
    window.history.replaceState(null, '', `#${encodeState(state)}`)
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

  // Wall layouts, resolved in the worker whenever the inputs change.
  const [wall, setWall] = useState<{
    layouts: ResolvedLayout[]
    workerMs: number
    roundTripMs: number
  }>({
    layouts: [],
    workerMs: 0,
    roundTripMs: 0,
  })
  const wallActive = state.view === 'wall'
  useEffect(() => {
    if (!wallActive) return
    let live = true
    engine
      .resolve(creative, surfaces, { preferCanvas: state.preferCanvas })
      .then((r) => {
        if (live) setWall(r)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [engine, creative, surfaces, state.preferCanvas, wallActive])

  const layouts = surfaces.map((s, i) => ({ surface: s, layout: wall.layouts[i] }))
  const ready = wall.layouts.length === surfaces.length

  const selected =
    layouts.find((l) => l.surface.id === state.selectedSurface && l.layout) ??
    layouts.find((l) => l.layout)

  const scores = wall.layouts.map((l) => l.score)
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const perResolve = wall.layouts.length ? wall.workerMs / wall.layouts.length : 0

  const patch = (p: Partial<PlaygroundState>) => setState((s) => ({ ...s, ...p }))
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
        <div className="viewtabs">
          <button aria-pressed={state.view === 'wall'} onClick={() => patch({ view: 'wall' })}>
            Surface wall
          </button>
          <button
            aria-pressed={state.view === 'scrubber'}
            onClick={() => patch({ view: 'scrubber' })}
          >
            Resize scrubber
          </button>
        </div>
        <span className="perf">
          <span>
            engine <b>{engine.threaded ? 'worker' : 'main'}</b>
          </span>
          {state.view === 'wall' && (
            <>
              <span>
                resolve <b>{perResolve.toFixed(2)}ms</b>
              </span>
              <span>
                wall <b>{wall.workerMs.toFixed(0)}ms</b>
              </span>
              <span>
                avg <b>{avgScore.toFixed(2)}</b>
              </span>
            </>
          )}
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

      {state.view === 'wall' ? (
        <main className="main">
          <div className="wall-head">
            <h2>{baseCreative.name}</h2>
            <span className="sub">
              one creative · {surfaces.length} surfaces · resolved{' '}
              {engine.threaded ? 'off-thread' : 'in-thread'}
              {!ready && ' …'}
            </span>
            <span className="spacer" style={{ flex: 1 }} />
            <div className="toggle-grid" style={{ gridTemplateColumns: 'repeat(5, auto)' }}>
              {DEBUG_KEYS.map((k) => (
                <label className="toggle" key={k} data-on={state.debug[k]}>
                  <input
                    type="checkbox"
                    checked={state.debug[k]}
                    onChange={(e) =>
                      patch({ debug: { ...state.debug, [k]: e.target.checked } })
                    }
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
            {layouts.map(({ surface, layout }) =>
              layout ? (
                <SurfaceCard
                  key={surface.id}
                  surface={surface}
                  layout={layout}
                  creative={creative}
                  selected={surface.id === selected?.surface.id}
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
              ) : (
                <div className="card" key={surface.id} style={{ minHeight: 200 }} />
              ),
            )}
          </div>
        </main>
      ) : (
        <Scrubber
          creative={creative}
          brandColor={creative.brandColor}
          debug={state.debug}
          dims={state.scrub}
          preferCanvas={state.preferCanvas}
          onDims={(w, h) => patch({ scrub: [w, h] })}
          onToggleDebug={(k, v) => patch({ debug: { ...state.debug, [k]: v } })}
        />
      )}

      <aside className="rail right">
        {state.view === 'wall' && selected?.layout && <Inspector layout={selected.layout} />}
        {state.view === 'scrubber' && (
          <div className="hint" style={{ padding: 4 }}>
            Drag the surface edges or use the sliders. The engine re-resolves every frame
            {engine.threaded ? ' in a Web Worker' : ''} — watch the archetype and strategy flip
            as the shape crosses a threshold.
          </div>
        )}
      </aside>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
