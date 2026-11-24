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
