# Banners of War · 0.1.0 (experimental vertical slice)
 
An offline-first WEGO medieval tactics game for Pocket Works. The launcher uses the isolated app.config.json. No root or platform changes.

## Play
- Muster 4–12 regiments and a commander within 1500 points, choose a seed and AI style.
- Select a banner, tap the deployment zone to place it, change formation and frontage. Confirm to start.
- Select a friendly regiment; use Group for multi-selection. Choose an order, then draw its route or tap its destination. Targeted attack/shoot orders can be assigned by tapping an enemy. Drag on the map outside order mode to pan; pinch or use zoom buttons.
- Confirm twice to execute both plans over 30 simulated seconds. Playback speed and pause do not change the simulation. Use the end button to enter the next planning phase.
- Inspect tactical layers, event journal, report, previous-round branch or any recorded round via report. Local autosave is scoped to this app.
- Observer mode runs both AI commanders.

## Engine
Fixed 0.25 s steps, continuous coordinates, rectangular oriented collision footprints (approximation), contact frontage, cumulative fatigue, cohesion and morale, routed units, local panic, projectile volleys, commander support, terrain speed and slope. Seed generates topography, woods and a river with a ford; no external LLM or assets. Soldiers are rendered at their assigned formation slots; losses are aggregated and may be fractional internally. Formation geometry is approximate (wedge visuals currently use a rectangular collision envelope); this is not a validated historical model.

## Tests
Run `node --test apps/banners-of-war/engine.test.mjs`. Five regression tests cover fixed step, deterministic replay, symmetric contact and ranged damage, width-dependent geometry, and three seeded AI battles. App-specific Universal QA plan includes browser screenshots and a Playwright journey. Full browser QA and deployment must be confirmed separately; no claim of device FPS.

## Scope not yet implemented
Historical scenarios and antiquity, terrain editor, online/async play, persistent named groups, formal conditional orders, realistic command delay/fog-of-war, extra victory objectives, large/epic battles, full navigation routing, detailed contact phases, per-soldier injury model, audio, training series, additional terrain types and climates, separate replay branches and full replay import. The first release is a vertical slice, not the full design brief.
