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


## 0.3.0 — Living Lands (experimental, not released)

The 0.2.0 Art of War commit is e67c6d8f4ee9e40fd41d030a27fc416f89ae166f. Its browser, mobile and regression suites passed; platform-wide contract failures still block production publication. The same application branch continues development without changing QA infrastructure.

- New worlds: priority-flood drainage, strictly downhill river edges, connected ridges, watersheds, coastal deltas, climate and geological resource fields. Schema-1 saves retain their original geography.
- Cell state: legal owner, occupier, district, accessible administration, control, development, devastation, occupation pressure, contenders, roads and bridges. Capture is gradual; occupied districts do not flip instantly with their center. Peace can transfer actually occupied parcels.
- Weighted administrative expansion, isolation by terrain and hostile control, adjacent parcel transfer and subdivision into new centers. Automatic resource exploitation uses workforce, materials, security, roads and seasons. Settlement specialization changes labor allocation; industrial districts, markets and warehouses affect production, hauling and storage.
- Road construction costs timber and treasury. Cargo is dispatched, travels cell by cell, can be blocked by hostile patrols, reroutes or is lost. Army movement, supply and migration use travel costs and safe routes.
- Battlefield terrain samples the real strategic river graph, bridges, roads, relief, fields, buildings and fortifications. Prepared strategic defense selects the battlefield center; deployment is oriented along army approach.
- Continuous map overlay, zoom-dependent trees and settlement footprint, road edges, moving caravan markers, development layer and explicit survey grid. Existing Art of War custom battles remain independent.

Validation: `node --test apps/crown-and-marches/engine.test.mjs apps/crown-and-marches/living.test.mjs`. The nine Living Lands scenarios exercise drainage/geology, mountain barriers, partial iron occupation, road blockade, district isolation, fertile founding and investment, redistribution, bridge terrain and six autonomous states for 360 days. Browser performance suite measures 500/1000/3000 soldiers with simultaneous fixed-step simulation and canvas rendering in Chromium/WebKit mobile portrait/landscape emulation; real mobile hardware remains unverified.

Limitations: terrain is an approximate raster model, river deltas are classified coastal mouths rather than branching channels, houses and roads are procedural symbols, sea shipments use abstract transit time, walls slow tactical movement rather than full destructible geometry, and AI remains heuristic. The global release must not be marked deployed until mandatory checks and Cloudflare availability actually pass.


## 0.4.0 — Wealth of Nations (experimental)

The campaign now uses a single material system for 17 goods. Inputs and outputs are logged independently: grain/food, timber/planks, ore and fuel/metal, metal and timber/tools and arms, metal and cloth/armor, wool/cloth, and sand and fuel/glass. New workshops require construction time; tools and available workers affect throughput. The economic cycle runs every four strategic days, transport and military upkeep every day. Market prices are per settlement, smoothed and bounded against commodity base values.

Private household/merchant cash, state treasury, and trade escrow are separate balances. Taxes, tariffs, wages, subsidies and purchases transfer money between them; no periodic money grant is used. Construction consumes physical supplies. State reserves can be purchased and released through the economic book. Trade dispatch deducts cargo from its origin and places the buyer's payment in escrow; arrival credits inventory and settles seller proceeds and tariff, road capacity can delay transit, blockade can force rerouting or cause loss, and a hostile patrol can seize cargo. Coastal trade uses connected water cells where both states have navigation technology; land siege or occupation blocks ports.

Recruitment transfers actual equipment and food into an army, reduces its home settlement's civilian population, records cohorts by origin, and pays wages. Combat casualties remove equipment and count losses at home. Surviving demobilized soldiers return progressively. Tactical ammunition is constrained by strategic timber and metal carried for missiles; Custom Battle remains self-contained.

The Economy Sandbox is a separate in-memory campaign with 2–6 AI states, seed, stock and industry scale, population, resource concentration, tax, military priority, trade and navigation settings. It records sampled series and exports JSON without modifying the campaign save. Schema 3 migrates versions 1 and 2, preserves the original generated terrain, and initializes newly introduced economic balances once. The material audit checks each daily transition as well as each economic cycle.

Experiments: `node --test apps/crown-and-marches/engine.test.mjs apps/crown-and-marches/living.test.mjs apps/crown-and-marches/wealth.test.mjs`; `node apps/crown-and-marches/wealth-experiment.mjs 0` through group 3 run five seeds each, 3600 days per seed, producing a JSON report with yearly samples and conservation residuals. Initial testing identified excessive demographic growth (roughly fivefold over ten years); the subsequent revision reduced peaceful growth to 0.022% per four-day economic cycle (about 2% per game year before losses and shortages) rather than guaranteeing survival. Treasury insolvency episodes count transitions below one coin, not formal legal bankruptcy. No debt or money issuance system is implemented.

The overview battlefield layer is rasterized from individual soldier positions once per simulation tick, with a single cached surface at subsequent render frames. Close-up figures retain detailed sprite rendering. Benchmark is headless Chromium and WebKit mobile emulation, not a physical phone; it measures concurrent simulation and rendering.

Remaining limits: standardized commodity lots are abstract rather than kilograms; the local private sector is a pooled household/merchant balance rather than individually owned enterprises; no dedicated naval combat or debt market; resource concentration in sandbox is an initial scenario, not a saved campaign terrain rewrite; economic AI remains heuristic. Repository-wide publication is not asserted until mandatory QA and Cloudflare confirm it.
