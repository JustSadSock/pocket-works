# Crown & Marches — 0.1.0 (experimental)

Offline campaign strategy inside Pocket Works. Create a world by seed, inspect your capital, build mills and workshops, recruit 60-man regiments, settle accessible land, negotiate and march. Time is paused initially. Select an army marker, choose "Задать маршрут", then tap a target cell. War permits enemy occupation; cities surrender after blockade and transfer at peace. On army contact choose tactical battle or automatic resolution. Select a regiment and a command, then tap its destination or enemy. Battles pause the campaign; losses persist. Campaign and ongoing battle are saved locally.

## Architecture
- `world.mjs`: 192×128 cells, deterministic relief and downhill drainage, resource potential, cost-based territorial expansion, production and local stocks, trade, diplomacy and strategic armies.
- `battle.mjs`: individual entities, unit formations, local spatial hash, movement, attacks, ammo, morale and flight; results feed campaign.
- `render.mjs`: Canvas map and battle scene, camera and map layers.
- `app.js`: interaction, fixed simulation step, persistence and lifecycle.
- `sw.js`: isolated offline shell and shared Pocket Works update protocol.

## QA
`node --test apps/crown-and-marches/engine.test.mjs`
Universal QA smoke plan covers desktop/mobile entry and campaign interaction. Production and visual approval require the actual browser artifacts and CI.

## Scope and limits
This is an initial playable vertical slice, not the full requested grand strategy. No naval combat, negotiated multi-clause peace, separate garrison recruitment, siege assault interface, detailed weather fronts, worker offload, real caravan entities, dynamic diplomacy coalitions, or production-grade battle animations yet. Trade is periodic stock transfer along computed routes. Technology effects, economic balance, map contour smoothness and AI require further depth and profiling. Tactical units use a simplified 2D miniature representation. No verified upper bound on tactical entity performance on iOS yet.

## Visual direction
An earthy relief atlas, rectangular brass-and-wood command controls, faction banners and a 2D field diorama. The map remains central; expanding a city panel exposes the actual stocks and orders rather than a dashboard. Original procedural assets and app-local SVG icon. No external art or audio dependencies.


## 0.2.0 — Art of War (experimental)

- Individual circles and two collision passes, weapon reach, cavalry acceleration and braking, defensive spear bracing, projectile flight and friendly interception, morale contagion, fatigue and pursuit. Wounded soldiers are counted as unavailable in the campaign; no recovery system yet.
- Custom Battle opens independently from the start menu. Both armies can be human or AI, 1–1500 soldiers per side; four terrain presets, rain, experience, formations, deployment offsets, deterministic seed, retry and session history. The campaign save remains untouched.
- Active pause, group selection and three stored groups, queued orders, reserve/defensive/free doctrines, touch-drawn front lines, formation width and angle.
- Canvas sprite cache, viewport culling and zoom-dependent detail. Projectile lines are drawn in a single path. Tactical simulation runs in 100 ms steps independently of the display loop.
- Exact casualties by unit type transfer to the campaign; no proportional loss rounding for individual battles.

### Regression and performance

Run `node --test apps/crown-and-marches/engine.test.mjs` at the repository root. Eight scenarios cover world determinism, economy, campaign battle transfer, custom battle determinism, physical separation, queued orders, projectiles/friendly interception, and 3000-soldier creation. Browser QA plan includes a fresh custom battle launch and pause.

Measured in the connector JavaScript runtime (not mobile hardware, no rendering): 180 steps at 0.1 s on a plain map, seed 123, both AI, 60% spears / 20% archers / 20% heavy cavalry, deployment shifted 70 toward the center on both sides. 500 soldiers median 9 ms / p95 12 ms; 1000 median 19 ms / p95 22 ms; 3000 median 64 ms / p95 85 ms. Mobile FPS and actual battery/thermal behavior remain unmeasured.

Limitations: collision solver is approximate; no full navigation around obstacles, animation interpolation, persistent wounded prisoners, or advanced coordinated multi-army AI. Formation orders are discrete simulations, not a full historical physics model. Release remains experimental until CI and deployment are confirmed.
