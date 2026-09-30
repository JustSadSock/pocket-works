# Последний камень — vertical slice 1.1

An independently runnable PocketWorks castle-defense game. Build a small stone-and-timber
fortress, withstand a siege, inspect the breach, repair and strengthen the same castle.
The initial budget supports a complete 5×5 perimeter with four corner towers and a gate.
The first assault combines infantry with a ram; ladders appear in wave two, artillery in six.
There are twelve waves, but this release's acceptance scenario is the first siege and recovery.

## Controls

Choose a tool, tap a tile, inspect the full-size translucent preview, then **Confirm**.
Invalid cells and the reason for rejection are visible before spending anything.
**Cancel** dismisses the placement; **Undo move** reverses up to twenty construction actions,
including dismantling, repair and upgrades. Rotate gates or an isolated wall before placement.
Connected wall sections automatically form straight runs and corners.
**Repair** restores a damaged section for half the proportional material cost.
**Strengthen** costs 75% of base materials plus one iron: +50% base HP per level and +35%
weapon damage per level, to level three. Damage percentage is preserved on upgrade.
Drag the battlefield to orbit; pinch to zoom; visible camera controls reset the survey view.
The siege controls pause/resume and switch between 1×/2×. Help also provides a confirmed restart.
PocketWorks exit remains text-labelled on both orientations and all gameplay states.

## Architecture and audit

- `simulation.ts`: renderer-independent 30 Hz simulation, economy, upgrades, campaign state,
  reverse Dijkstra flow field and cardinal waypoints. Layout and 25-HP buckets invalidate
  the shared route cache. An intact cell is attacked from the adjacent cell; a demolished
  section immediately becomes navigable. Ladders traverse one wall into a free landing cell.
- `world.ts`: Babylon renderer, modular masonry, automatic wall adjacency, gate orientation,
  fixed approach bridges, material-group geometry batches, instanced ballistic fragments,
  damage stages, health bars and capped/adaptive rendering. Debris has gravity, spin, ground
  collision and damped bounces; it does not obstruct the authoritative navigation grid.
- `main.ts`: explicit placement transactions, bounded undo, modal locking, fixed-step loop,
  audio preferences, lifecycle saving, progression results and read-only QA state.
- `source/vendor/visual-kit.js`: unchanged copy of PocketWorks visual-kit from platform branch
  `platform/visual-pipeline-integrated`, commit `e114c0679282272187076aafb2f446f28954c62b`.
  It supplies forest lighting, PBR surfaces and isolated hit flashes. That platform capability
  is not on main; the copy keeps this app isolated and buildable without merging unrelated work.
- `source/catalog.json`: app-local Asset Registry containing semantic tags, palettes, dimensions,
  pivots, LOD budgets and provenance for deterministic texture/scatter assets. No remote assets,
  paid services or network-dependent runtime generation. Upstream catalog's high-poly assets
  are deliberately not fetched; this slice uses authored procedural miniature geometry.
- `sw.ts`: versioned app-only precache including shader chunks. No other app's cache is removed.

The original failure mechanisms were immediate placement without a transaction, the touch click
retargeting a newly revealed panel, rounded mid-segment navigation, incomplete waypoint arrival,
unconnected wall orientation, insufficient internal defender coverage, excessive draw calls,
saves that silently reset a running siege, and a Service Worker claim helper registered too
late inside activation. Source modules and Babylon runtime have been retained.

State is stored at `pocket-works:last-stone:campaign`. Old v1 saves migrate without losing built
sections. New saves preserve the current wave, living units, climbing/waypoint states, projectiles,
HP, elapsed time and upgrades. Reload resumes the siege deterministically. Visibility suspension
stops simulation/rendering and saves; it does not accrue hidden elapsed time.

## Validation

```bash
npm run typecheck --workspace=@pocket-works/last-stone
npm run test --workspace=@pocket-works/last-stone
npm run build --workspace=@pocket-works/last-stone
npm run registry:check
# Serve repository root on 127.0.0.1:4173, then:
npm run test:gameplay --workspace=@pocket-works/last-stone
```

`qa/gameplay.mjs` exercises real touch events in Chromium and WebKit, portrait and landscape:
invalid placement, cancel, confirm, undo, closed perimeter construction, help dismissal,
persistence, siege, pause/resume, destruction, recovery, repair, upgrade and offline reload.
WebKit offline reload is verified by stopping a dedicated local HTTP server; Chromium uses
context offline mode. This avoids WebKit inspector network emulation, which bypasses normal
Service Worker navigation. The first visit is now claimed during activation, without a reload.
Screenshots and measured frame rates go to `LAST_STONE_QA_DIR` (default `/tmp/last-stone-qa`).
`?qa=1` publishes read-only projected tile centers; there is no gameplay mutation/testing backdoor.

## Release limits

Bridges are fixed approach infrastructure, not a player-operated drawbridge system. The breach
model is HP-based structural demolition with physical visual fragments, not a general rigid-body
solver for every stone. Only the opening siege and recovery are browser acceptance-tested;
later waves still need long-session balance testing. Authored character rigs/animations, stronger
terrain art and real midrange Android/iPhone thermal/FPS measurements remain release work.
