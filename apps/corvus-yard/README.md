# CORVUS · Над дворами

An isolated Babylon.js crow flight game inside PocketWorks. Authored local GLBs contain a feathered crow with a real skeleton and named animation clips, and an autumn canal district. No remote assets or subscriptions are required.

Controls: left stick turns and controls height (moves forward/back on foot); hold Wing to take off and gain speed; release to glide; hold Landing to brake and assist a close slow approach to a perch. E picks up/eats food; Q drops an object. WASD, Space and Shift also work. Start, pause and completion screens have explicit PocketWorks exit links.

The short progression is two meals, one walnut cracked by dropping it on a hard surface, and a landing at the bell-tower finial. Exploration remains available afterward. Consumed food and cracked nuts are persisted independently so reload cannot count them twice. A water contact returns to the home branch. Settings/progress save on pause and suspension.

Modules: flight/core (renderer-independent forces and locomotion), crow (authored clips and non-accumulating head/tail adjustments), world (geometry, contact support, colliders, wind), ecology (food, ballistic carried objects, reactive birds), camera/input/audio, main (integration and UI).

Build and tests:

```sh
npm run build --workspace @pocket-works/corvus-yard
npm run registry:check
```

Generated runtime files are not source-controlled; CI and Cloudflare build them from source. The models in public/models are committed. Deterministic Blender sources and the Asset Forge manifest are in asset-forge.

Current validation: 17 simulation/ecology tests, TypeScript and Vite/PWA build. Chromium portrait startup, flight, walk, pause and home return exercised with no console errors. Visual and performance review is still in progress: this is not yet signed off as a polished vertical slice. Real-phone performance, WebKit/offline acceptance, wider landing/collision coverage and complete progression browser testing remain release gates.
