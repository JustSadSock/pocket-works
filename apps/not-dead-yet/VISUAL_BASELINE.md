# NOT DEAD YET — visual baseline 2.1.0
**Recorded:** 2026-10-18. **Status:** source audit and deterministic geometry baseline complete; actual desktop/mobile WebGL screenshot and GPU timing capture pending. This is **not** a measured device-performance report.

## Art direction (must survive procedural generation)
The protagonist sees the inside of a compact 1960s–1990s Soviet/post-Soviet lived-in flat: older wallpaper, varnished furniture, partly replaced cabinets, enamel sinks, layered rugs, TV, family belongings and ordinary clutter. Visual identity comes from *different real shapes and rooms*, not palette cycling. Normal domestic familiarity is the source of unease when a location is recalled incorrectly; visual impairments must never obscure a usable center-screen view or compromise aiming.

- Real dimensions in present generator: **1 cell = 1.27 m**; **ceiling = 2.62 m**; first-person camera **1.54 m** above floor. Voxel-like 1-cell corridors are about 1.27 m wide, prior to baseboards. Doors / fixtures must respect the existing 0.20-cell player collision radius.
- Physical cues: layered doorframes, shallow thresholds, skirting and crown molding, recessed windows, exposed kitchen pipes, normal cabinet proportions, bath and sink shapes, enamel, brass, Bakelite and wallpaper rather than arbitrary neon accent light.
- Color: dark lacquer/wood and faded warm ochre, muted sage, brick red, grey enamel and cool window glass. Local bulbs are warm; unlit corridor remains cool/neutral. No overdone haze, bloom or uniformly muddy surfaces.
- Variation: kitchen counters, sofa arms, display glass, wardrobe doors, bath rim, plumbing and lighting must each read by silhouette; a single color-swapped box does not count as a new asset.
- Legibility: at each reference camera the nearest fixture and one navigable exit must be distinguishable without relying on floating HUD clues; the reticle remains centered and readable; flashlight does not wash out materials.
- Style invariants: no AI-slop neon, HUD saturation, overscaled American-house hallways, or full-screen motion blur. Reduce-motion accessible presentation remains mandatory.

## Architecture before the first detail pass
- `rogue-world.mjs`: deterministic 18×18-cell sectors; four very similar corner rooms joined to narrow central corridors, generated furniture footprints for collision. Future work must vary actual topology.
- `rogue-scene.mjs`: emitted WebGL1 triangles, mostly thin wall quads and primitive cuboid furniture. No authored curved silhouettes; walls are mostly single surfaces.
- `textures.mjs` + `renderer.mjs`: local 4×4 procedural material atlas (RGBA), world-space UV projections, one fragment shader using pigment channel plus tinted lighting; no normal/roughness maps or genuine hardware shadow maps. Fixed 90° **vertical** perspective projection in main view; 1.54m camera, simple sinusoidal bob.
- Renderer uploads a single flat static scene mesh on change of sector revision or player movement across 5-cell region; each vertex is 10 floats, i.e. 40 bytes. No chunk cache yet. There are approximately 1–3 WebGL draw calls per frame including the weapon, though GPU cost is not measured.
- Main points to address next: excessive boxiness, few real floor-plan families, simplistic light source positions, world-space atlas scaling, hard-cut geometry rebuild/LOD, no physically correct camera spring.

## Deterministic visual route
`?qa=1` exposes `window.__PW_ROGUE_QA__`. In test mode only:
```js
__PW_ROGUE_QA__.startSeed(222);
__PW_ROGUE_QA__.bookmark('corridor'); // or living,kitchen,bedroom,bathroom,closet,nursery
__PW_ROGUE_QA__.visual();              // scene coverage + renderer metrics
```
Fixed reference seeds: **222, 413, 8787**. Desktop at **1440×900**, phone portrait **390×844**. Proposed footage/screenshots: corridor, kitchen, living room, bathroom, enemy and light-off flashlight, before/after memory revision; 2.1.0 QA currently captures a 3×4 room baseline in Playwright when the browser suite is actually run. **No browser screenshots were captured from this tool environment**. Tests write their screenshots as local Playwright test artifacts, not to the PocketWorks UI.

## Controlled measurements (isolated V8 tool runtime, not real hardware)
At seed 222 / camera cell (9.5,9.5):
| Revision | Triangles | 40-byte vertices | Generated mesh |
|---|---:|---:|---:|
| Before this art pass (v2.0.1) | 13,616 | 40,848 | 1,633,920 bytes |
| First detailed pass (v2.1.0) | 18,623 | 55,869 | 2,234,760 bytes |

Additional first-pass reference counts: seed 413 **18,508 triangles**; seed 8787 **18,256 triangles** at the same camera. For the initial 2.0.1 baseline, seed 413 had **13,426 triangles**, seed 8787 **13,150**. V8 timing before ranged 34–52ms to build the visible scene; initial detailed pass ranged about 53–73ms, subject to isolated runtime variability and cache/warmup. The additional geometry is real but has a measurable CPU/build cost. The next pass **must reduce mesh rebuild spikes** by caching chunks / level-of-detail before radically increasing decorative density. Do not quote these JS results as FPS or GPU timing.

New geometry is rendered only in a **9-cell proximity LOD** for walls, doors and prop details and **11-cell proximity** for room fixtures; base scenes retain the original 17-cell range. Existing gameplay collision footprints are deliberately unchanged.

## Gates to mark complete on a real device
- [ ] Capture screenshot matrices on desktop Chromium and 390×844 WebKit/Safari, including before/after.
- [ ] Profile p50/p95 CPU generation, upload spikes and actual frame/GPU timings.
- [ ] Check visible overlap / z-fighting / penetration in a complete walk through all six room types.
- [ ] Validate safe margins for weapon/hands, camera FOV and mobile HUD.
- [ ] Compare existing story-mode and endless-mode material continuity without modifying the PocketWorks shell.

## Architecture after v2.1.1
The earlier measurements remain a reproducible historical comparison.
The new generator supports five different layouts and small WC/pantry
spaces; new main rooms are at most 4×4 cells and furniture is positioned
relative to doorway access. Old saved runs retain their prior layout.

Isolated V8 static scene meshes at the start point (triangles): seed 222
**17,328**; 413 **17,726**; 8787 **17,100**; 127 **18,171**; 91
**15,875**. These are geometry counts, not GPU benchmarks.

QA image seeds 222, 413, 8787, 4 and 14 collectively cover all five
families. Their browser screenshots are not yet executed/reviewed.
400 seeded/epoch combinations passed actual collision-graph tests for all
rooms, doors and drops; that does not independently verify visual clipping.

## v2.1.2 — interactive physical door pass
The old static fake leaves were replaced by animated carved timber panels.
The entire physical state is represented by an epoch-specific door key and
one horizontal 2D segment. That *same segment* builds the visible WebGL
triangles, stops player/monster movement, occludes flashlight/shots and
drives safe opening/closing. Gameplay interactions show contextual E/touch
text and invoke offline door acoustics. Open/close saves include the
current animation angle. In contrast, legacy saves use no new door obstacle.

A heuristic A* traversal replaced broad BFS for enemies to handle doors
and furniture without flooding unrelated sectors. Closed doors may
intentionally make a route impossible until a player opens them.
22/22 combined source-level roguelike/floorplan/visual/door regression
cases passed in an isolated JS runtime after implementing the doors.
A separate integration harness exercised the actual game initialization
and E-open animation, but it is *not a real WebGL browser run*.

The mobile/browser screenshots, GPU timings and manual overlap inspection
are still outstanding and must not be inferred from these test results.
