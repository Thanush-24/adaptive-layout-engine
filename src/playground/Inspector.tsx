import { useState } from 'react'
import type { ResolvedLayout } from '@engine/types'

const barColor = (s: number) =>
  s >= 0.8 ? 'var(--good)' : s >= 0.55 ? 'var(--warn)' : 'var(--bad)'

export function Inspector({ layout }: { layout: ResolvedLayout }) {
  const [tab, setTab] = useState<'score' | 'candidates' | 'trace'>('score')
  const { trace } = layout

  return (
    <div className="insp">
      <h2>{layout.surface.label}</h2>
      <div className="insp-sub">
        {layout.surface.w}×{layout.surface.h} · {trace.archetype} · {trace.winner.strategy}/
        {trace.winner.variant}
      </div>

      <div className="bigscore">
        <span className="n">{layout.score.toFixed(2)}</span>
        <span className="w">composite quality</span>
      </div>

      <div className="tabs">
        <button aria-pressed={tab === 'score'} onClick={() => setTab('score')}>
          Rubric
        </button>
        <button aria-pressed={tab === 'candidates'} onClick={() => setTab('candidates')}>
          Candidates ({trace.candidates.length})
        </button>
        <button aria-pressed={tab === 'trace'} onClick={() => setTab('trace')}>
          Trace
        </button>
      </div>

      {tab === 'score' && (
        <div>
          {layout.ruleScores.map((r) => (
            <div className="rule" key={r.rule}>
              <div className="rule-top">
                <span className="name">{r.rule}</span>
                <span className="val">
                  {r.score.toFixed(2)} ·w{r.weight}
                </span>
              </div>
              <div className="bar">
                <i style={{ width: `${r.score * 100}%`, background: barColor(r.score) }} />
              </div>
              {r.detail && <div className="detail">{r.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'candidates' && (
        <div>
          {trace.candidates.map((c, i) => {
            const win =
              c.strategy === trace.winner.strategy && c.variant === trace.winner.variant
            return (
              <div className={`cand${win ? ' win' : ''}`} key={i}>
                <div className="cand-top">
                  <span>
                    {win ? '★ ' : ''}
                    {c.strategy} · {c.variant}
                  </span>
                  <span className="s">{c.score.toFixed(3)}</span>
                </div>
                <div className="cand-meta">
                  {c.ruleScores
                    .slice()
                    .sort((a, b) => a.score - b.score)
                    .slice(0, 3)
                    .map((r) => `${r.rule} ${r.score.toFixed(2)}`)
                    .join('  ·  ')}
                  {c.dropped.length > 0 && `  ·  −${c.dropped.length}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'trace' && (
        <div>
          <div className="section">
            <h2>Degradation ({trace.degradation.length})</h2>
            {trace.degradation.length === 0 && (
              <div className="hint">
                Nothing shed — every element fit at an acceptable score.
              </div>
            )}
            {trace.degradation.map((d, i) => (
              <div className="cand" key={i}>
                <div className="cand-top">
                  <span>drop {d.role}</span>
                  <span className="s">
                    {d.scoreBefore.toFixed(2)}→{d.scoreAfter.toFixed(2)}
                  </span>
                </div>
                <div className="cand-meta">{d.reason}</div>
              </div>
            ))}
          </div>

          <div className="section">
            <h2>Warnings ({layout.warnings.length})</h2>
            <ul className="warnlist">
              {layout.warnings.length === 0 && <li data-sev="info">Clean — no warnings.</li>}
              {layout.warnings.map((w, i) => (
                <li key={i} data-sev={w.severity}>
                  <b>{w.code}</b> — {w.message}
                </li>
              ))}
            </ul>
          </div>

          {layout.dropped.length > 0 && (
            <div className="section">
              <h2>Dropped</h2>
              <ul className="warnlist">
                {layout.dropped.map((d) => (
                  <li key={d.id} data-sev="info">
                    <b>{d.role}</b> — {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
