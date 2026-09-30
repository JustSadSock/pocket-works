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

Current validation: 29 flight, collision and ecology tests, TypeScript, Vite/PWA build and registry checks. Chromium completed the full progression through actual controls and additionally passed native two-finger stick/flap steering and touch cancellation. WebKit completed the full progression through real controls: portrait touch start, takeoff/glide, pause/home return, branch walkoff/ground landing, two meals, carried walnut/drop/crack, bell-tower auto-perch/completion, persisted settings/progress and offline reload. No console errors or failed requests were recorded. The offline WebKit check physically stopped the local HTTP server while the service worker supplied the complete application and both GLBs. The final Chromium flight samples were approximately 30–36 FPS, WebKit 18–29 FPS, and lighter street views reached approximately 40–55 FPS under headless software rendering with adaptive quality; these are not measurements from an iPhone.

The browser runner starts its own HTTP server and never mutates the gameplay state. Full progression is enabled explicitly:

```sh
CORVUS_QA_FULL=1 npm run test:gameplay --workspace @pocket-works/corvus-yard
```

`CORVUS_QA_BROWSERS` selects Chromium/WebKit, `CORVUS_CHROMIUM_PATH` and `CORVUS_WEBKIT_PATH` override browser executables, and `CORVUS_QA_DIR` selects report/screenshots output. `CORVUS_QA_NATIVE_OFFLINE=1` verifies the cache by stopping the embedded HTTP server; this avoids a WPE WebKit offline-emulation protocol error. Local evidence lives under `qa/evidence/`.

Both full browser runs and reviewed screenshots are in `qa/evidence/chromium-acceptance/` and `qa/evidence/webkit-acceptance/`; reload and offline return retained two meals, one cracked walnut and the bell-tower visit. Additional roof/perch/collision traversal remains outside this automated acceptance route. Real iPhone/Safari performance still requires physical-device validation. The current environment uses headless Chromium and Linux WebKit, not mobile Safari.
