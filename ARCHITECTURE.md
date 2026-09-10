# Architecture

## Data flow

```
                 Creative                    Surface
            (brand + elements)        (w, h, channel, safe, viewingDistance)
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                         resolveLayout()                       src/engine/resolve.ts
                                  │
              ┌───────────────────┼─────────────────────────────────┐
              ▼                   ▼                                 ▼
        classify(surface)   enumerateCandidates()             ROLE_DEFAULTS
        → Archetype         → LayoutCandidate[]               (typography, priority)
        surfaces.ts         candidates.ts + strategies.ts     defaults.ts
                                  │
                                  ▼   for every candidate
                    ┌─────────────────────────────┐
                    │  place(creative, surface,   │             src/engine/layout/place.ts
                    │        candidate, active)    │
                    │                             │
                    │   ├─ assign elements→regions│
                    │   ├─ fitText()  ────────────┼──▶ text/fit.ts ──▶ text/metrics.ts
                    │   ├─ fitImage() ────────────┼──▶ image/focal.ts
                    │   ├─ chooseForeground() ────┼──▶ image/color.ts
                    │   └─ force-place required   │
                    └──────────────┬──────────────┘
                                   ▼
                         scoreLayout()  →  { total, ruleScores[] }   score/rubric.ts
                                   │
                                   ▼
                 argmax by (score, affinity, name)   ← deterministic tie-break
                                   │
                    score < goodEnough or required unplaced?
                                   │ yes
                                   ▼
                         nextToDrop(active)   →  shed one element     degrade.ts
                         re-run the tournament; keep the drop only
                         if it raised the score (traced either way)
                                   │
                                   ▼
                            audit(winner)  →  Warning[]               audit.ts
                                   │
                                   ▼
        ResolvedLayout { placements, score, ruleScores, dropped, warnings, trace }
```

## Key modules

### `surfaces.ts` — classification

`classify(surface)` maps `(w, h)` to one of eight archetypes (`micro`, `strip`,
`banner`, `square`, `portrait`, `vertical`, `landscape`, `ultrawide`) from shape
and size alone. It is total and side‑effect‑free so the trace is easy to reason
about. `MIN_LEGIBLE_PX` turns `viewingDistance` into a hard floor for body text
(≈0.007 rad angular size at the canonical distance for phone / desktop / TV).

### `text/metrics.ts` — measurement with two backends

`measureEm(text, spec)` returns width in `em`. The **table** backend (per‑family
average advance widths by character class, weight‑adjusted) is deterministic and
used everywhere by default. The **Canvas** backend (`measureText`) is opt‑in
(`preferCanvas`) for on‑screen accuracy in the playground. They agree to within a
few percent.

### `text/fit.ts` — largest‑that‑fits

Binary‑searches the largest whole‑pixel size whose wrapped text fits the box.
Wrapping is greedy, then **balanced**: it tries each line count up to `maxLines`
and keeps the arrangement with the lowest raggedness (squared slack, with the
last line discounted) — so headlines don't leave a lonely trailing word.

### `image/focal.ts` — focal‑aware cropping

For a `cover` fit it computes the crop window that keeps the declared focal point
in frame with margin while minimising discarded area, and emits both a normalized
crop rect and the equivalent CSS `object-fit` / `object-position` so a plain
`<img>` reproduces it with no JavaScript. Protected assets fall back to `contain`.

### `image/color.ts` — contrast‑aware colour

WCAG 2.1 luminance and contrast. `chooseForeground(bgL, target, volatile)` picks
black or white text and, if needed, solves the lightest scrim opacity that clears
the target. `volatile` (an image, whose luminance is only a mean) designs for the
adverse luminance excursion and lays down a protective scrim.

### `layout/partition.ts` — the track solver

`solveTracks(total, specs)` distributes space by weight, clamps to per‑track
min/max, and redistributes slack from clamped tracks — iterating to a fixed
point. Same idea as CSS `flex-grow` / `flex-shrink`, kept small and deterministic.
`rows()` / `cols()` split a rect with it.

### `layout/strategies.ts` — the six strategies

Each strategy is `(ctx) => LayoutCandidate[]`. A candidate is a list of `Region`s
(a rect + the roles it may host + alignment + overlay flag). Strategies **only
carve space** — they never measure text or place elements. `applies(archetype)`
gates them. Most emit 2–3 variants (image left/right, band top/bottom/centre,
centred/left‑aligned).

### `score/rubric.ts` — the rubric

Eleven rules, each returning `0..1` with a fixed weight. Legibility (3),
no‑collision (3), containment (2.6) and safe‑area (2.4) dominate so a cosmetic win
can't outvote a hard failure — and a single badly overlapping text pair floors
`no-collision` at 0.15 outright. `completeness` collapses to ~0 if a required
element is unplaced. `headline-impact` scores the headline size against a target
derived from the surface's short edge, so the optimiser prefers shedding a
low‑priority element over shrinking the headline into timidity. The weighted mean
is the composite score.

### `resolve.ts` — the orchestrator

Runs the tournament, applies the degradation loop, calls the auditor, and
assembles the `Trace` (archetype, content budget, every candidate with its
per‑rule scores, the winner, each degradation step with before/after score, and
`elapsedMs`).

### `narrate.ts` — the trace in prose

Pure `narrate(layout): string[]`. Turns the trace into 3–5 sentences: the
archetype and strategy chosen, how the winner beat the runner‑up and on which
rule, the weakest and strongest rubric rules, what was shed and the score it
bought, and any unresolved warning. Used by the scrubber and by `ale --explain`.

### `dsl.ts` — authoring + validation

`parseCreative(input): ParseResult`. Accepts anything (a file, an API body, the
playground editor), walks it once collecting **every** error with a JSON‑path
(`elements[2].image.focal`), separates hard errors from soft warnings ("no CTA",
"2 headline elements"), fills role‑derived defaults, and returns a typed
`Creative` or the error list — it never throws, so a UI can show all problems at
once.

## The playground

### `playground/engine/` — the engine off the main thread

`worker.ts` runs `resolveLayout`; `client.ts` wraps it in a promise API with
**latest‑wins** semantics — while a request is in flight, new calls queue and only
the most recent survives, which is exactly what a resize scrubber dragging at
60fps needs. Falls back to a synchronous in‑thread resolve where Workers are
unavailable (SSR, tests). The wall and the scrubber each hold their own client so
they never contend for the queue.

### The two views

- **`SurfaceCard` + `Inspector`** — the 17‑surface wall. The card renders the ad
  scaled to fit; the inspector shows the rubric bars, every candidate with its
  three worst rules, the degradation log and the warnings.
- **`Scrubber`** — one large surface with sliders / drag‑handles / presets. Every
  dimension change posts to the worker; the result updates the preview, the live
  archetype/strategy/score readout, the mini‑rubric, and the `narrate()` output.

## Rendering

Three renderers read only `ResolvedLayout`:

- **`render/react/AdSurface.tsx`** — true‑pixel placement inside a scaled frame,
  optional debug overlay layer, and FLIP‑style transitions to each re‑resolved
  layout.
- **`render/html.ts`** — a self‑contained inline‑styled `<div>` tree; the focal
  crop becomes `object-fit` / `object-position`, scrims are per‑line inline
  backgrounds. No runtime.
- **`render/svg.ts`** — a standalone `<svg>`; the focal crop becomes an
  over‑scaled `<image>` inside a `<clipPath>`, gradients are converted to
  `<linearGradient>`. The CLI's file target.

## The CLI — `bin/ale.ts`

Bundled to `dist/ale.mjs` by `vite.cli.config.ts` (node target, all builtins
external). `render` resolves a creative onto a surface selection, writes
HTML/SVG/JSON per surface, prints a score table (plus `narrate()` with
`--explain`), and exits non‑zero if any surface scores below 0.55 — a drop‑in
content‑pipeline gate.

## Design rationale

**Why candidate generation + scoring instead of template selection?**
It degrades gracefully at the boundaries between archetypes, it makes the
trade‑offs explicit and inspectable, and it lets you add a strategy or tune a
rule weight without rewriting a decision tree. The cost is doing 6–12× the
placement work per resolve — which the benchmark shows is still ~1.7 ms.

**Why keep the engine framework‑agnostic?**
The same `resolveLayout` should run at request time on a server, in a build step
that pre‑renders ad variants, in a worker, and in the browser. Pushing all React
/ DOM concerns into `src/render` keeps that boundary honest and keeps the engine
trivially testable in Node.

**Why force‑place required elements instead of failing?**
A legally required disclaimer or a brand's CTA must render even on a 320×50. The
engine always places them (carving a sliver if necessary), and the scorer +
auditor flag the compromise rather than the layout silently dropping something
the advertiser is contractually obliged to show.

**Why procedural SVG art?**
Zero licensing risk, deterministic tests, and every asset carries an honest focal
point and mean luminance so the focal‑crop and auto‑colour paths are actually
exercised. The playground still accepts any pasted image URL.

**Why a Web Worker for a sub‑2ms function?**
One resolve is cheap; a 17‑surface wall re‑resolving on every keystroke, or a
scrubber re‑resolving on every drag frame, is not. Moving it off the main thread
keeps input handling and the FLIP transitions smooth, and the latest‑wins client
means a fast drag never queues up stale work.

**Why three renderers?**
`ResolvedLayout` is the contract. React is for the playground; the HTML string is
for email / SSR / a quick export; SVG is for crisp scalable files and is what the
CLI writes. Each is ~150 lines because the engine already did the hard part —
they only translate rects, font sizes and colours into their own syntax.
