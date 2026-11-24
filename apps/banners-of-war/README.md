# Banners of War · 0.2.0 (Art of Command — experimental)
 
An offline-first WEGO medieval tactics game for Pocket Works. The launcher uses the isolated app.config.json. No root or platform changes.

## Play
- Muster 4–12 regiments and a commander within 1500 points, choose a seed and AI style.
- Select a banner, tap the deployment zone to place it, change formation and frontage. Confirm to start.
- Select a friendly regiment; use Group for multi-selection. Choose an order, then draw its route or tap its destination. Targeted attack/shoot orders can be assigned by tapping an enemy. Drag on the map outside order mode to pan; pinch or use zoom buttons.
- Confirm twice to execute both plans over 30 simulated seconds. Playback speed and pause do not change the simulation. Use the end button to enter the next planning phase.
- Inspect tactical layers, event journal, report, previous-round branch or any recorded round via report. Local autosave is scoped to this app.
- Observer mode runs both AI commanders.

## Engine
Fixed 0.25 s steps, continuous coordinates, rectangular oriented collision footprints (approximation), projected contact frontage, weapon reach, relative formation pressure, charge and bracing, cumulative fatigue, cohesion and morale, routed units, local panic, projectile volleys, commander support, terrain speed and slope. Seed generates topography, woods and a river with a ford; no external LLM or assets. Soldiers are rendered at their assigned formation slots; losses are aggregated and may be fractional internally. Formation geometry is approximate (wedge visuals currently use a rectangular collision envelope); this is not a validated historical model.

## Tests
Run `node --test apps/banners-of-war/engine.test.mjs`. Thirteen regression tests cover fixed step, deterministic replay, symmetric contact and ranged damage, width-dependent geometry, and three seeded AI battles. App-specific Universal QA plan includes browser screenshots and a Playwright journey. Full browser QA and deployment must be confirmed separately; no claim of device FPS.

## Scope not yet implemented
Historical scenarios and antiquity, terrain editor, online/async play, persistent named groups, realistic command delay/fog-of-war, extra victory objectives, large/epic battles, full navigation routing, detailed contact phases, per-soldier injury model, audio, training series, additional terrain types and climates, separate replay branches and full replay import. The first release is a vertical slice, not the full design brief.

## Art of Command
During planning, select a regiment or use Group to select multiple. Assign an initial order; then use **Этапы приказа** to choose a transition condition and record the next order. Conditions: path finished, elapsed seconds, enemy contact, disengaged, morale threshold, nearby enemy, or shared group arrival. Set formation/width before recording the next order to schedule reformation. Plans survive turn boundaries unless explicitly replaced; routed regiments abandon their chain. Mixed groups limit marching speed to their slowest member; curved paths and terrain can still distort spacing. Future paths are numbered on the map.

The contact model projects oriented footprints onto a contact tangent, applies weapon reach and weights displacement by effective mass, rank depth and bracing. Charge shock depends on approach velocity; a contact cooldown prevents repeated impact from numerical oscillation. Reports distinguish melee, missiles, flank subset, shock, countershock and pressure. Shock/pressure are indices, not casualties. AI infantry shares a marching group and assigns opponents along the line. These remain approximations, not individual soldier physics.

### Evidence and limitations
The 13 engine cases were executed in a JavaScript runtime, with deterministic, symmetric baseline tests and controlled frontage, shield wall, synchronized arrival, cross-turn timer, retreat, bracing and reformation comparisons. Hosted browser QA, visual inspection and production deployment remain separate gates. No historical scenario, mode or multiplayer was added. A controlled two-wing versus frontal-charge experiment was also added; large-scale double envelopment, gap exploitation, false retreat and constrained-terrain tests remain necessary; passing local component experiments is not proof of ten viable tactics. Group spacing on curves, detailed formation deformation and advanced enemy coordination are still limited.

Baseline visual QA artifacts (run 45297817306) were inspected on Chromium and WebKit. The portrait atlas was too small; the new viewport rotates the battlefield, retains world-space gestures, and the wide desktop layout has a separate command ledger. New browser QA and visual sign-off are pending.
