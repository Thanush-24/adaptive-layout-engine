import type { Creative } from '@engine/types'
import { effectivePriority } from '@engine/defaults'

export interface CreativeEditorProps {
  creative: Creative
  overrides: Record<string, string>
  onOverride: (id: string, value: string | null) => void
}

export function CreativeEditor({ creative, overrides, onOverride }: CreativeEditorProps) {
  return (
    <div>
      {creative.elements
        .filter((e) => e.role !== 'background')
        .map((el) => {
          const val = overrides[el.id] ?? el.content
          const isImg = el.kind === 'image'
          return (
            <div className="el-row" key={el.id}>
              <div className="el-head">
                <span className={`role-chip${el.required ? ' req' : ''}`}>{el.role}</span>
                {el.required && <span className="role-chip req">required</span>}
                <span className="prio">p{effectivePriority(el)}</span>
              </div>
              {isImg ? (
                <div className="field" style={{ margin: 0 }}>
                  <input
                    type="text"
                    placeholder="paste image URL…"
                    value={overrides[el.id] ?? ''}
                    onChange={(e) => onOverride(el.id, e.target.value || null)}
                  />
                </div>
              ) : (
                <div className="field" style={{ margin: 0 }}>
                  <textarea value={val} onChange={(e) => onOverride(el.id, e.target.value)} />
                </div>
              )}
            </div>
          )
        })}
      {Object.keys(overrides).length > 0 && (
        <button
          className="toggle"
          style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
          onClick={() => creative.elements.forEach((e) => onOverride(e.id, null))}
        >
          reset edits
        </button>
      )}
    </div>
  )
}
