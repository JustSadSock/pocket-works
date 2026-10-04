# ХРОНОСКОП

Pocket Works foundation for interactive historical reconstructions. The application intentionally separates the reusable viewer from scenario data: a future battle, siege, campaign day or political event can be delivered primarily as a new scenario module.

## Product model

- Canvas 2D historical map with semantic layers: geography, fortifications, units, commanders, labels and event focus.
- Free pan, wheel/pinch zoom and explicit zoom controls.
- Timeline scrubbing in both directions as if navigating a video.
- Director camera that follows scenario-authored camera cues; any manual map gesture disables it until the user turns it back on.
- Smart playback mode that slows automatically around important or densely clustered events.
- Event cards with uncertainty/confidence notes instead of pretending disputed minute-by-minute history is exact.
- Local persistence for time, layer state and camera preference.
- Offline-first PWA shell and Pocket Works update contract.

## Scenario contract

`scenario-constantinople.js` is the reference implementation. A scenario owns:

- `bounds`, terrain polygons, walls and places;
- `units` and `commanders` with time-keyed tracks;
- `events` with importance, copy, confidence and focus camera data;
- `phases` and director `camera` cues;
- start time and duration.

The renderer is deliberately agnostic to the specific battle.

## Historical demo

The included Constantinople 1453 scenario is a **technical demonstration**, not the final scholarly reconstruction. It uses broad, commonly described phases of the final assault and explicitly marks disputed minute-level timing as approximate. A future dedicated Constantinople delivery can replace/expand the scenario data without changing the engine.

## QA

```bash
node --test apps/chronoscope/tests/engine.test.mjs
node --check apps/chronoscope/app.js
node --check apps/chronoscope/engine.js
node --check apps/chronoscope/scenario-constantinople.js
node --check apps/chronoscope/sw.js
npm run registry:check
```
