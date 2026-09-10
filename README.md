# Adaptive Layout Engine for Multi-Surface Ads

Author an ad creative **once**, resolve it onto **any surface** — a 320×50 mobile
banner, a 1080×1920 story, a 1920×1080 connected‑TV frame, a 3840×1080 DOOH pillar
— and get back a concrete, renderable layout plus a full explanation of every
decision the engine made.

**Live playground:** _(Vercel URL — added on deploy)_
**Repo:** https://github.com/Thanush-24/adaptive-layout-engine

The playground renders one creative across all 17 surfaces at once. Select any
card to open the inspector: the composite score, the ten‑rule breakdown, every
candidate layout the optimiser considered, the degradation log, and the audit
warnings. Toggle safe‑area / region‑box / focal‑point / baseline overlays,
drag‑resize any surface, and export a card to PNG or standalone HTML.

---

## The idea

Most "responsive ad" engines classify the surface and pick **one** layout
template for it. That breaks down at the edges: the template that suits a 300×250
rectangle is wrong for a 300×600 half‑page, and picking by aspect ratio alone
ignores whether the _content_ actually fits.

This engine treats layout as an **optimisation problem**:

```
classify surface → generate many candidate layouts → place + score every one
   → select the best → (if still weak) shed the lowest-priority element, retry
   → audit → emit layout + decision trace
```

Six strategies (`strip`, `stack`, `split`, `hero-overlay`, `sidebar`, `poster`)
each propose one or more candidate region maps. Every candidate is fully placed —
real font metrics, focal‑point‑aware image crops, contrast‑aware colour — and
graded against a ten‑rule rubric (legibility, safe‑area, containment, collisions,
completeness, hierarchy, CTA prominence, brand visibility, focal preservation,
whitespace balance). The highest weighted score wins, and the whole tournament is
returned in `layout.trace` so you can see _why_.

### How this compares to a template‑selection engine

|                  | Template selection                | This engine                                                        |
| ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| Layout choice    | 1 template picked by aspect ratio | N candidates generated, scored, best selected                     |
| Explains itself  | warnings list                     | every candidate + per‑rule score breakdown + drop log            |
| Type fitting     | binary‑search font size           | binary‑search **+** line‑break balancing **+** legibility floor  |
| Imagery          | focal point stored                | focal‑aware crop → CSS `object-position`, + auto colour / scrim  |
| Degradation      | drop lowest priority              | drop only when it _measurably raises the score_, each step traced |
| Viewing distance | —                                 | near / mid / far drives the minimum legible px                    |
| Output           | in‑app render                     | React **+** framework‑agnostic HTML string **+** PNG / HTML export |
| Playground       | one surface, sliders              | all 17 surfaces at once, drag‑resize, debug overlays, shareable URL |
| Tests            | a unit suite                      | creative×surface golden matrix + property tests + CI + benchmark  |

---

## Quickstart

```bash
npm install
npm run dev        # playground at http://localhost:5173
npm test           # 150+ assertions
npm run bench      # engine throughput
npm run build      # production build to dist/
```

## Engine API

The engine (`src/engine`) has **zero** React or DOM dependencies — it runs in
Node, a worker, or a build step unchanged.

```ts
import { resolveLayout, SURFACES } from './src/engine'

const layout = resolveLayout(creative, SURFACES[0])

layout.placements // [{ id, role, rect, text?, image?, colors?, z }]
layout.score // 0..1 composite quality
layout.ruleScores // per-rule breakdown with weights
layout.dropped // elements shed, with reasons
layout.warnings // frame-breach / safe-area / sub-legible / severe-crop / …
layout.trace // archetype, every candidate + score, degradation steps, elapsedMs
```

A `Creative` is a brand colour plus a list of semantic elements:

```ts
{
  id: 'retail-sale',
  brandColor: '#f72585',
  elements: [
    { id: 'bg',       role: 'background', kind: 'image', content: url, priority: 20,
      image: { aspect: 1.33, focal: { x: 0.7, y: 0.38 }, luminance: 0.34 } },
    { id: 'headline', role: 'headline',   kind: 'text',  content: 'Up to 50% off',
      priority: 100, required: true },
    { id: 'cta',      role: 'cta',        kind: 'text',  content: 'Shop the sale',
      priority: 92,  required: true },
    // logo, subhead, badge, legal, product …
  ],
}
```

Roles carry layout intent (reading order, space weight, degradation priority) and
supply typography defaults, so a bare creative still resolves well.

### Rendering

```ts
import { renderToHtml } from './src/render/html' // -> self-contained HTML string
import { AdSurface } from './src/render/react/AdSurface' // -> <AdSurface layout={…} />
```

The React renderer also draws debug overlays (safe area, region boxes, focal
points, baseline grid). The HTML renderer is dependency‑free and escapes all
content — usable in email, SSR, or a build artefact.

---

## Architecture

```
src/engine/                 framework-agnostic — no React, no DOM
  types.ts                  Creative, AdElement, Surface, ResolvedLayout, Trace
  surfaces.ts               17 presets + archetype classifier + legibility table
  defaults.ts               role-derived typography & priority
  geometry.ts               rect math (inset, breach, overlap, align)
  text/metrics.ts           Canvas measureText + deterministic table fallback
  text/fit.ts               largest-that-fits font size + line-break balancing
  image/focal.ts            focal-aware crop → object-fit / object-position
  image/color.ts            WCAG luminance / contrast / scrim / auto text colour
  layout/partition.ts       CSS-flex-like weighted track solver
  layout/strategies.ts      strip · stack · split · hero-overlay · sidebar · poster
  layout/candidates.ts      enumerate applicable strategies → LayoutCandidate[]
  layout/place.ts           place elements into regions; fit type & imagery
  score/rubric.ts           10 weighted rules → composite score
  degrade.ts                priority-ordered shed policy
  audit.ts                  post-hoc warnings
  resolve.ts                the orchestrator (public entry point)

src/render/                 html.ts (string) · react/AdSurface.tsx (+ overlays)
src/playground/             the Vercel app — surface wall, inspector, editor, export
src/data/                   7 sample creatives, procedural SVG art (no external assets)
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the data‑flow walk‑through and the
design rationale.

### Determinism

`resolveLayout(creative, surface)` is a pure function — identical input yields
byte‑identical output (timing aside). Tests pin the table font‑metrics backend;
the playground opts into Canvas metrics for on‑screen accuracy.

---

## Performance

`npm run bench` — Apple Silicon, table metrics (what a server/build caller uses):

```
119 creative×surface pairs
single resolve   p50 ~1.7ms   p95 ~3.2ms
full wall (119)  ~180ms
```

Each resolve places and scores ~6–12 candidate layouts plus up to 4 degradation
retries, so a single resolve is ~30–60 full place+score cycles.

---

## Testing

```
npm test
```

- **Invariant matrix** — every one of the 7 creatives × 17 surfaces: nothing
  breaches the frame, required elements are never dropped, primary text never
  overlaps, font sizes stay in bounds, the trace always explains the winner.
- **Golden fingerprint** — a compact snapshot of every resolved layout; any
  behaviour change shows up as a reviewable diff.
- **Property tests** (`fast-check`) — 250 random creative × arbitrary‑surface
  runs assert the same invariants; the classifier is checked total and stable.
- **Unit tests** — type fitting, font metrics, focal cropping, colour math, the
  track solver.
- **Renderer tests** (jsdom) — React and HTML output, content escaping.
- **Determinism** — repeated resolves are identical.

CI (`.github/workflows/ci.yml`) runs typecheck → lint → format → test → build →
bench on every push and PR.

---

## Deployment

Vite SPA on **Vercel** (`vercel.json`, zero config). Playground state — creative,
text edits, resized surfaces, debug toggles — is encoded in the URL hash, so any
view is shareable. Each surface card exports to **PNG** or **standalone HTML**.

---

_Built for Flam's Frontend R&D assignment._
