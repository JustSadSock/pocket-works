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


## 0.6.0 — Balance of Power (integration candidate)

The main campaign and independent Diplomacy Sandbox share the political engine. Older campaign saves are migrated on entry without resetting land, military or economic state. The original tactical, economy and campaign laboratories remain available.

- Directional trust, hostility, strategic estimates, dependence, historical interests, weighted memories and campaign lessons. Prospective war assessment uses actual route and food requirements, expected military and political costs, and earlier failures instead of an arbitrary war frequency quota.
- Multi-clause agreements, target-specific guarantees, renewable/revisable obligations, independent conflict fronts, allied reconnaissance, logistics, landing and withdrawal after separate peace. Dependent states retain their own economic and military systems; total territorial defeat reconciles populations, stores, obligations and ownership.
- Diplomacy Sandbox offers political history, reasons for decisions, actual state power samples, territorial history and same-seed comparisons (six recent experiments). JSON export includes contracts and the recent decision archive. The strategic world currently supports 2–6 factions; 12/20 require a future expansion of generation, palette, scenario and UI limits, not merely changing a benchmark constant.
- Required QA: 76 regression cases, existing military/economic experiments, 20×20-year plus 5×50-year political runs, ten asymmetric political experiments, Chromium and WebKit diplomatic journeys and separate phase timing. Branch metadata and cache protocol identify the 0.6.0 candidate; no production deployment is implied. Full release requires repository-wide validation and Cloudflare/Launcher verification.


## 0.7.0 — Age of Discovery (development candidate)

22 connected knowledge nodes, nine areas, settlement-local invention/diffusion/adoption, seven funded institution types; adoption affects real agricultural/industrial production, recruitment and siege construction. Geography is separated into authoritative terrain and faction charts; physical surveys consume existing resources and carry people, and colony founding transfers the existing population and cargo. Known sea routes use depth, seasonal wind and storm costs. Eight ship types, technology-gated construction, upkeep and individual tactical hulls in Custom Naval Battle; strategic encounters apply losses back to the campaign. Discovery Sandbox is a fifth isolated laboratory with JSON exports and save/restore. Old laboratories remain explicitly opt-in legacy modes.

QA: 13 new controlled discovery cases; 20×50-year and 5×200-year autonomous runs registered in existing mandatory batches, plus four political pressure cases and Chromium/WebKit discovery/naval journeys. Candidate is not a claim of balance or release. Limits: 2–6 factions and fixed 192×128 world, incomplete overseas administrative autonomy, trade hubs/transshipment and fully historical land weapon differentiation; fog/archive is approximate. No merge/deployment until mandatory checks pass.


## 0.8.0 — Lords & Subjects (development candidate)

The validated baseline at 97d7522 completed the four workflows and all 25 social runs (3,500 simulated years), as confirmed in the project handoff. The society-300-4 accounting investigation found the first old-algorithm breach on day 99,852, grain consumption. Old maximum 1.89058e-5; compensated maximum 2.66661e-6; unchanged tolerance 1e-5. Both 300-year audit trajectories completed. This is the baseline evidence, not a claim that later engine changes have passed all long runs.

District reforms now reserve actual treasury funds before acceptance, pay implementation expenses from escrow, refund unused balances to the current sovereign, suspend during famine and persist through save/load, succession and territorial transfer. Coalition concessions preflight total cost. Territorial contact requires adjacent administered land; land reconnaissance searches reachable frontier through known cells and records supply blockers. No hidden global resource intelligence or arbitrary war frequency.

### Political acceptance matrix

The following maps the original 14 requirements and additional 12 scenarios to controlled regression cases in discovery.test.mjs unless otherwise specified. These are engine fixtures, not equivalent to 26 end-to-end player sessions.

| # | Scenario | Evidence (test title or identifying excerpt) |
|---|---|---|
| 1 | Feudal centralization | funded centralization and cancellation preserve money; constitution has delayed implementation; local autonomy falls, distinct from abolishing feudal military authority |
| 2 | Overtaxation and resistance | sustained taxation and food crisis organize lord coalition against the crown |
| 3 | Merchant privileges | merchant treasury can reject higher tariffs and approve trade privileges |
| 4 | War losses and legitimacy | real casualties reduce ruling legitimacy and household support (controlled recorded-loss fixture) |
| 5 | Contested succession | displaced dynastic heir can become the explicit claimant in a succession petition |
| 6 | Dynastic union | dynastic union through succession keeps two realms distinct and resolves shared ruler death |
| 7 | Peaceful autonomy | negotiated autonomy funds administration through escrow and completes without war |
| 8 | Material civil war | civil war transfers real service ranges; prepared society campaign can enter civil conflict without inventing material resources |
| 9 | Secession and conservation | secession expands all realm structures beyond six with no duplicate assets |
| 10 | Cultural/religious coexistence | religious reform funds a real coexistence of rites; expedition and founding retain mixed culture and religion |
| 11 | Religious education | clergy funds an actual school and research advances without new money; trade transfers knowledge without automatic adoption |
| 12 | Urban wealth and political change | urban capital changes constitutional options through actual constituency power |
| 13 | Colonial autonomy | colonial charter funds implementation and enacts autonomy |
| 14 | Situational institutional differences | central crown and feudal lord military authority differ; treasury institutions have different actual tax decisions |
| A1 | Concessions without war | negotiated autonomy funds administration through escrow and completes without war |
| A2 | Multiple-lord coalition | sustained taxation and food crisis organize lord coalition against the crown |
| A3 | Competing heirs | dynastic nomination preserves the displaced heir; displaced dynastic heir can become the explicit claimant |
| A4 | Real army defection | civil war transfers real service ranges and preserves legal sovereignty until settlement |
| A5 | Assets at secession | secession expands all realm structures beyond six with no duplicate assets |
| A6 | Ruler replaced without fragmentation | civil war transfers real service ranges and preserves legal sovereignty until settlement (succession resolution) |
| A7 | Overseas self-government | colonial charter funds implementation and enacts autonomy |
| A8 | Foreign intervention | foreign military intervention shares civil conflict and is closed by independence settlement |
| A9 | Reunification | voluntary reunion is negotiated rather than a free annexation |
| A10 | Deterministic civil-war reload | civil-war state in secession/war regression cases and existing discovery browser journey |
| A11 | Repeated divisions and reunions | historic realm identifiers cross the former 64 limit; separation and reunion never reuse historical realm id |
| A12 | Extinction obligations | balance.test.mjs: complete territorial defeat retains people, material stocks, gold and archives obligations |

The current discovery/society file has 69 cases passing direct execution with an assertion adapter. Native and browser QA on the final revision are still required. The fixtures demonstrate mechanisms under controlled conditions, not spontaneous frequency or long-horizon equilibrium.

## The Grand Campaign — 0.9.0 development in progress

Main campaign enables all existing layers at creation and migrates older campaign saves. The six labs remain distinct. World selection supports independent faction counts and classic, continent, continents, archipelago, inland sea, isolated and straits presets as defined in the engine. Preview shows the actual generated terrain and initial realm positions. The active world uses shared geometry bindings: switch with activateWorld(state) when using low-level APIs across multiple differently sized worlds.

| Map | Cells | Initial maximum | 120-day step p95/p99 | Save characters | Serialize/restore |
|---|---:|---:|---:|---:|---:|
| Standard | 24,576 | 6 | 21/25 ms | 1,309,284 | 67/472 ms |
| Large | 49,152 | 12 | 45/63 ms | 3,226,769 | 172/864 ms |
| Huge | 102,400 | 20 | 80/103 ms | 8,240,936 | 427/1,838 ms |

Measurements on fc548fa, direct V8 execution, fixed grand-regression seed, continents, maximum factions, 120 days; not browser or physical-phone frame timings. All restored simulation hashes matched, material/money error below 1e-5. No contacts arose on that short seed; this does not settle the international isolation question. Large and huge remain experimental. Historical IDs are never recycled, retired grand-campaign charts are freed; 63 actual separations/reunions crossed the former 64-realm limit. Current cap 128 is imposed by signed-byte ownership; dense diplomacy remains bounded, not unlimited.

Campaign saves use IndexedDB with primary and previous snapshot in a single transaction, format 2 wrapper, legacy localStorage migration, fallback, manual export/import, periodic saves and recovery. Browser termination can interrupt an asynchronous last-minute save, so the previous committed snapshot is essential. Laboratory storage stays separate. Eight delegation areas share the existing economy/army/research/administrative rules; public input procurement uses real funds and cargo.

New Chromium/WebKit journeys exercise three map sizes, selection, actual UI actions and IndexedDB reload. They are not six long role-specific playthroughs. Remaining gates: browser validation of new campaign, campaign goals and tutorial, unified explanations/chronicle, visual/audio integration, six target playthroughs, 100/300/500-year integrated experiments, performance and balance, production packaging, main integration and confirmed Cloudflare/Launcher availability. Version metadata remains 0.8.0 experimental until 0.9.0 meets its acceptance criteria. No production release is implied.

### Grand Campaign — gameplay and experience (development)

The existing 0.8.0 development metadata remains unchanged until 0.9.0 acceptance. HTML version aligned; Pereves comparison added after reviewing the application and visual direction. Platform Smoke and Creative Direction passed at 1f8e845 (Validate 45612356508); subsequent head requires final validation. No validator changes.

- Main-campaign crown dispatch, contextual city tabs, 9 optional goal directions, 8 real-action tutorial episodes, witnessed history with 4,000-event bound and 40 compact border snapshots, audio controls, eight delegation domains with explicit priorities and advisor explanations. Existing laboratories preserved. Army order cancellation and escrow-safe charter cancellation; IndexedDB recovery retains the prior valid backup.
- Paired 120-day V8 simulation at 6/12/20 states: p95 22/49/86 ms -> 14/32/63 ms; authoritative hashes equal. Occupation pressure indices and cached territory ranking. No claim of physical-device performance.
- Direct Discovery/Society assertion-adapter results at d84658d: 73/73; four new regressions for hidden history, production causes, policy execution and cancellation. Browser journeys extended for new panels, persisted direction/tutorial state, corrupt huge-map primary recovery; final browser execution pending.
- At ab6122e (standard, six states, observer, 720 days each): grand-observe-a continents, b straits, c archipelago. Contacts/contracts/wars/shipments all zero. Expeditions launched/returned 7/7, 7/7, 9/9; inventions 1/1/2; blockers food 8/19/23 and tools 7/6/5. Max goods error 2.73e-12, money 4.55e-12, all restore hashes equal. P95 14/13/12 ms. Saves 1.335/1.313/1.303M characters. Persistent isolation remains a balance concern; no artificial activity quotas.
- Targeted deep suite: grand-history (five independent 100/300/500-year runs, standard/large/huge). Annual checkpoint metrics, invariant checks, periodic round-trip hashes and exact revision. Run with the existing targeted deep QA dispatcher after branch availability, or `node apps/crown-and-marches/grand-experiment.mjs 0` through `4`. Not yet completed; no smoke exclusions.
- Pending: final browser checks and screenshot review, full six role campaigns, long histories, map order previews/LOD refinement, additional save failure scenarios, trade/contact balance, performance on developed worlds and worker investigation, visual/audio polish, Production Packaging and published Launcher verification. No release claim.
