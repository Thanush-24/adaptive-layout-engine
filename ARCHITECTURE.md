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

Ten rules, each returning `0..1` with a fixed weight. Legibility (3), containment
(2.6) and safe‑area (2.4) dominate so a cosmetic win can't outvote a hard
failure. `completeness` collapses to ~0 if a required element is unplaced. The
weighted mean is the composite score.

### `resolve.ts` — the orchestrator

Runs the tournament, applies the degradation loop, calls the auditor, and
assembles the `Trace` (archetype, content budget, every candidate with its
per‑rule scores, the winner, each degradation step with before/after score, and
`elapsedMs`).

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
